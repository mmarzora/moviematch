"""
Matching service for the MovieMatch algorithm.
Combines genre preferences and embeddings for dual-user movie recommendations.
"""

import json
import numpy as np
import uuid
from typing import List, Dict, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from collections import defaultdict

from ..models.models import Movie, UserPreference, MatchingSession, UserFeedback
from .movie_service import movie_service

def parse_json_field(val):
    if isinstance(val, str):
        return json.loads(val)
    return val if val else []

class MatchingService:
    """Service for the MovieMatch recommendation algorithm."""
    
    # Algorithm parameters
    INITIAL_LEARNING_RATE = 0.3
    FINAL_LEARNING_RATE = 0.1
    EXPLORATION_BUDGET = 0.25
    DIVERSITY_THRESHOLD = 0.8
    
    # Stage thresholds
    EXPLORATION_STAGE_LIMIT = 10
    LEARNING_STAGE_LIMIT = 30
    
    def __init__(self):
        """Initialize the matching service."""
        pass
    
    def create_session(self, db: Session, user1_id: str, user2_id: str) -> str:
        """Create a new matching session for two users."""
        session_id = str(uuid.uuid4())
        
        # Create session record
        session = MatchingSession(
            id=session_id,
            user1_id=user1_id,
            user2_id=user2_id,
            session_preferences="{}",
            session_stage="exploration"
        )
        db.add(session)
        db.commit()
        
        return session_id
    
    def get_recommendations(
        self, 
        db: Session, 
        session_id: str, 
        user_id: str,
        batch_size: int = 20
    ) -> List[Dict]:
        """Get movie recommendations for a session and user."""
        
        # Get session data
        session = db.query(MatchingSession).filter(MatchingSession.id == session_id).first()
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        # Get user preferences
        user1_prefs = self._get_user_preferences(db, session.user1_id)
        user2_prefs = self._get_user_preferences(db, session.user2_id)
        
        # Determine session parameters based on stage
        stage_params = self._get_stage_parameters(session)
        
        # Generate candidates for the requesting user
        candidates = self._generate_candidates(db, session, user1_prefs, user2_prefs, user_id)
        
        # Score candidates using hybrid approach
        scored_movies = self._score_movies(
            candidates, user1_prefs, user2_prefs, session, stage_params
        )
        
        # Apply diversity filtering
        final_recommendations = self._apply_diversity_filtering(
            scored_movies, batch_size, stage_params
        )
        
        return final_recommendations
    
    def process_feedback(
        self, 
        db: Session, 
        session_id: str, 
        user_id: str, 
        movie_id: int, 
        feedback_type: str,
        time_spent_ms: Optional[int] = None
    ) -> None:
        """Process user feedback and update preferences."""
        
        # Record feedback
        feedback = UserFeedback(
            session_id=session_id,
            user_id=user_id,
            movie_id=movie_id,
            feedback_type=feedback_type,
            time_spent_ms=time_spent_ms
        )
        db.add(feedback)
        
        # Get movie data
        movie = db.query(Movie).filter(Movie.id == movie_id).first()
        if not movie:
            return
        
        # Update user preferences
        self._update_user_preferences(db, user_id, movie, feedback_type)
        
        # Update session state
        self._update_session_state(db, session_id, user_id, movie, feedback_type)
        
        db.commit()
    
    def _get_user_preferences(self, db: Session, user_id: str) -> Dict:
        """Get or create user preferences."""
        prefs = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
        
        if not prefs:
            # Create default preferences
            default_genre_prefs = {}
            return {
                'genre_preferences': default_genre_prefs,
                'embedding_vector': None,
                'confidence_score': 0.0,
                'total_interactions': 0
            }
        
        return {
            'genre_preferences': parse_json_field(prefs.genre_preferences) if prefs.genre_preferences else {},
            'embedding_vector': movie_service.bytes_to_array(prefs.embedding_vector) if prefs.embedding_vector else None,
            'confidence_score': prefs.confidence_score,
            'total_interactions': prefs.total_interactions
        }
    
    def _get_stage_parameters(self, session: MatchingSession) -> Dict:
        """Determine algorithm parameters based on session stage."""
        interactions = session.total_interactions
        
        if interactions <= self.EXPLORATION_STAGE_LIMIT:
            stage = "exploration"
            genre_weight = 0.7
            embedding_weight = 0.2
            exploration_rate = 0.4
        elif interactions <= self.LEARNING_STAGE_LIMIT:
            stage = "learning"
            genre_weight = 0.5
            embedding_weight = 0.4
            exploration_rate = 0.3
        else:
            stage = "convergence"
            genre_weight = 0.3
            embedding_weight = 0.6
            exploration_rate = 0.2
        
        return {
            'stage': stage,
            'genre_weight': genre_weight,
            'embedding_weight': embedding_weight,
            'diversity_weight': 0.1,
            'exploration_rate': exploration_rate,
            'learning_rate': max(
                self.FINAL_LEARNING_RATE,
                self.INITIAL_LEARNING_RATE * (0.9 ** (interactions / 10))
            )
        }
    
    def _generate_candidates(
        self, 
        db: Session, 
        session: MatchingSession,
        user1_prefs: Dict, 
        user2_prefs: Dict,
        current_user_id: str
    ) -> List[Movie]:
        """Generate candidate movies for scoring for the requesting user only."""
        # Get recently shown movies to avoid repeats (for this user only)
        recent_feedback = db.query(UserFeedback).filter(
            UserFeedback.session_id == session.id,
            UserFeedback.user_id == current_user_id
        ).order_by(UserFeedback.created_at.desc()).limit(50).all()
        recent_movie_ids = {f.movie_id for f in recent_feedback}
        # Start with a broad candidate pool
        query = db.query(Movie).filter(
            Movie.embedding.isnot(None),
            ~Movie.id.in_(recent_movie_ids)
        )
        # Apply basic quality filters
        query = query.filter(
            Movie.rating >= 6.0,
            Movie.release_year >= 1990
        )
        # Get candidates (limit to reasonable number for scoring)
        candidates = query.limit(1000).all()
        return candidates
    
    def _score_movies(
        self, 
        candidates: List[Movie], 
        user1_prefs: Dict, 
        user2_prefs: Dict,
        session: MatchingSession,
        stage_params: Dict
    ) -> List[Tuple[float, Dict]]:
        """Score movies using hybrid genre + embedding approach."""
        
        scored_movies = []
        
        for movie in candidates:
            movie_dict = movie.to_dict()
            movie_dict['genres'] = parse_json_field(movie_dict['genres'])
            
            # Calculate genre compatibility
            genre_score = self._calculate_genre_score(
                movie_dict['genres'], user1_prefs, user2_prefs
            )
            
            # Calculate embedding similarity
            embedding_score = self._calculate_embedding_score(
                movie, user1_prefs, user2_prefs
            )
            
            # Combine scores
            final_score = (
                stage_params['genre_weight'] * genre_score +
                stage_params['embedding_weight'] * embedding_score
            )
            
            # Apply confidence multiplier
            confidence_multiplier = self._get_confidence_multiplier(
                user1_prefs, user2_prefs
            )
            final_score *= confidence_multiplier
            
            scored_movies.append((final_score, movie_dict))
        
        # Sort by score (descending)
        scored_movies.sort(key=lambda x: x[0], reverse=True)
        return scored_movies
    
    def _calculate_genre_score(
        self, 
        movie_genres: List[str], 
        user1_prefs: Dict, 
        user2_prefs: Dict
    ) -> float:
        """Calculate genre compatibility score."""
        
        user1_genre_prefs = user1_prefs['genre_preferences']
        user2_genre_prefs = user2_prefs['genre_preferences']
        
        if not movie_genres:
            return 0.5  # Neutral score for movies without genres
        
        # Calculate individual user scores
        user1_score = np.mean([user1_genre_prefs.get(genre, 0.5) for genre in movie_genres])
        user2_score = np.mean([user2_genre_prefs.get(genre, 0.5) for genre in movie_genres])
        
        # Use minimum to ensure both users are reasonably satisfied
        # But add a small average component to avoid being too conservative
        combined_score = 0.7 * min(user1_score, user2_score) + 0.3 * np.mean([user1_score, user2_score])
        
        return combined_score
    
    def _calculate_embedding_score(
        self, 
        movie: Movie, 
        user1_prefs: Dict, 
        user2_prefs: Dict
    ) -> float:
        """Calculate embedding similarity score."""
        
        if not movie.embedding:
            return 0.5  # Neutral score for movies without embeddings
        
        movie_embedding = movie_service.bytes_to_array(movie.embedding)
        
        user1_embedding = user1_prefs['embedding_vector']
        user2_embedding = user2_prefs['embedding_vector']
        
        # If no user embeddings yet, return neutral score
        if user1_embedding is None or user2_embedding is None:
            return 0.5
        
        # Calculate similarities
        user1_sim = self._cosine_similarity(movie_embedding, user1_embedding)
        user2_sim = self._cosine_similarity(movie_embedding, user2_embedding)
        
        # Combine similarities (same strategy as genre scoring)
        combined_score = 0.7 * min(user1_sim, user2_sim) + 0.3 * np.mean([user1_sim, user2_sim])
        
        # Normalize to 0-1 range (cosine similarity is -1 to 1)
        return (combined_score + 1) / 2
    
    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors."""
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return np.dot(vec1, vec2) / (norm1 * norm2)
    
    def _get_confidence_multiplier(self, user1_prefs: Dict, user2_prefs: Dict) -> float:
        """Calculate confidence multiplier based on how well we know user preferences."""
        user1_confidence = user1_prefs['confidence_score']
        user2_confidence = user2_prefs['confidence_score']
        
        # Average confidence, with a minimum to avoid zero scores
        avg_confidence = (user1_confidence + user2_confidence) / 2
        return 0.7 + 0.3 * avg_confidence  # Range: 0.7 to 1.0
    
    def _apply_diversity_filtering(
        self, 
        scored_movies: List[Tuple[float, Dict]], 
        batch_size: int,
        stage_params: Dict
    ) -> List[Dict]:
        """Apply diversity constraints to final recommendations."""
        
        final_recommendations = []
        exploration_count = int(batch_size * stage_params['exploration_rate'])
        exploitation_count = batch_size - exploration_count
        
        # Add top scoring movies (exploitation)
        genre_counts = defaultdict(int)
        for score, movie in scored_movies:
            if len(final_recommendations) >= exploitation_count:
                break
            
            # Check genre diversity
            movie_genres = movie['genres']
            genre_key = tuple(sorted(movie_genres)) if movie_genres else ('unknown',)
            
            if genre_counts[genre_key] < 2:  # Max 2 per exact genre combination
                final_recommendations.append(movie)
                genre_counts[genre_key] += 1
        
        # Add exploration movies (random selection from remaining)
        remaining_movies = [movie for _, movie in scored_movies[exploitation_count:]]
        if remaining_movies and exploration_count > 0:
            exploration_movies = np.random.choice(
                remaining_movies, 
                size=min(exploration_count, len(remaining_movies)), 
                replace=False
            )
            final_recommendations.extend(exploration_movies)
        
        return final_recommendations
    
    def _update_user_preferences(
        self, 
        db: Session, 
        user_id: str, 
        movie: Movie, 
        feedback_type: str
    ) -> None:
        """Update user preferences based on feedback."""
        
        # Get or create user preferences
        prefs = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
        if not prefs:
            prefs = UserPreference(
                user_id=user_id,
                genre_preferences="{}",
                confidence_score=0.0,
                total_interactions=0
            )
            db.add(prefs)
        
        # Parse current preferences
        genre_prefs = parse_json_field(prefs.genre_preferences) if prefs.genre_preferences else {}
        current_embedding = movie_service.bytes_to_array(prefs.embedding_vector) if prefs.embedding_vector else None
        
        # Calculate learning rate
        learning_rate = max(0.05, 0.3 * (0.9 ** (prefs.total_interactions / 10)))
        
        # Update genre preferences
        movie_genres = parse_json_field(movie.genres) if movie.genres else []
        feedback_value = 1.0 if feedback_type == 'like' else 0.0 if feedback_type == 'dislike' else 0.5
        
        for genre in movie_genres:
            current_pref = genre_prefs.get(genre, 0.5)
            genre_prefs[genre] = current_pref + learning_rate * (feedback_value - current_pref)
        
        # Update embedding preferences
        if movie.embedding:
            movie_embedding = movie_service.bytes_to_array(movie.embedding)
            
            if current_embedding is None:
                # First interaction - initialize with movie embedding
                new_embedding = movie_embedding.copy()
            else:
                # Update existing embedding
                if feedback_type == 'like':
                    # Move toward liked movie
                    new_embedding = current_embedding + learning_rate * (movie_embedding - current_embedding)
                elif feedback_type == 'dislike':
                    # Move away from disliked movie
                    new_embedding = current_embedding - learning_rate * (movie_embedding - current_embedding) * 0.5
                else:
                    # Skip - no update
                    new_embedding = current_embedding
            
            prefs.embedding_vector = new_embedding.tobytes()
        
        # Update metadata
        prefs.genre_preferences = json.dumps(genre_prefs)
        prefs.total_interactions += 1
        prefs.confidence_score = min(1.0, prefs.total_interactions / 20.0)  # Confidence builds up to 1.0 over 20 interactions
    
    def _update_session_state(
        self, 
        db: Session, 
        session_id: str, 
        user_id: str, 
        movie: Movie, 
        feedback_type: str
    ) -> None:
        """Update session state based on feedback."""
        
        session = db.query(MatchingSession).filter(MatchingSession.id == session_id).first()
        if not session:
            return
        
        session.total_interactions += 1
        
        # Check for mutual likes
        if feedback_type == 'like':
            # Check if the other user also liked this movie
            other_user_id = session.user2_id if user_id == session.user1_id else session.user1_id
            other_feedback = db.query(UserFeedback).filter(
                UserFeedback.session_id == session_id,
                UserFeedback.user_id == other_user_id,
                UserFeedback.movie_id == movie.id,
                UserFeedback.feedback_type == 'like'
            ).first()
            
            if other_feedback:
                session.mutual_likes += 1
        
        # Update session stage
        if session.total_interactions <= self.EXPLORATION_STAGE_LIMIT:
            session.session_stage = "exploration"
        elif session.total_interactions <= self.LEARNING_STAGE_LIMIT:
            session.session_stage = "learning"
        else:
            session.session_stage = "convergence"

# Global service instance
matching_service = MatchingService() 