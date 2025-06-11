"""
Recommendation Explainer for MovieMatch

This tool provides detailed explanations for why specific movies were recommended
by analyzing the scoring components and user preferences.
"""

import numpy as np
import json
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from collections import defaultdict

from ..models.models import Movie, UserPreference, MatchingSession
from ..services.movie_service import movie_service
from ..database.db import get_db

def parse_json_field(val):
    if isinstance(val, str):
        return json.loads(val)
    return val if val else []

class RecommendationExplainer:
    """Explains why movies were recommended to users."""
    
    def __init__(self):
        """Initialize the explainer."""
        self.stage_explanations = {
            'exploration': "We're exploring different movie types to learn your preferences",
            'learning': "We're learning from your feedback to improve recommendations", 
            'convergence': "We've learned your tastes and are finding your perfect matches"
        }
        
        self.stage_weights = {
            'exploration': {'genre': 0.7, 'embedding': 0.2, 'diversity': 0.1},
            'learning': {'genre': 0.5, 'embedding': 0.4, 'diversity': 0.1},
            'convergence': {'genre': 0.3, 'embedding': 0.6, 'diversity': 0.1}
        }
    
    def explain_recommendation(
        self, 
        db: Session, 
        session_id: str, 
        movie_id: int, 
        user1_id: str, 
        user2_id: str
    ) -> Dict:
        """Generate a detailed explanation for why a movie was recommended."""
        
        # Get session data
        session = db.query(MatchingSession).filter(MatchingSession.id == session_id).first()
        if not session:
            return {"error": "Session not found"}
        
        # Get movie data
        movie = db.query(Movie).filter(Movie.id == movie_id).first()
        if not movie:
            return {"error": "Movie not found"}
        
        # Get user preferences (may be None for new users)
        user1_prefs = self._get_user_preferences(db, user1_id)
        user2_prefs = self._get_user_preferences(db, user2_id)
        
        # Handle case where users don't have preferences yet
        if not user1_prefs:
            user1_prefs = self._create_default_preferences(user1_id)
        if not user2_prefs:
            user2_prefs = self._create_default_preferences(user2_id)
        
        # Calculate explanation components
        movie_dict = movie.to_dict()
        movie_dict['genres'] = parse_json_field(movie_dict['genres']) if movie_dict['genres'] else []
        
        # Get current stage and weights
        stage = self._determine_stage(session)
        weights = self.stage_weights[stage]
        
        # Calculate individual scores
        genre_analysis = self._analyze_genre_match(movie_dict['genres'], user1_prefs, user2_prefs)
        embedding_analysis = self._analyze_embedding_match(movie, user1_prefs, user2_prefs)
        stage_context = self._get_stage_context(session, stage)
        
        # Generate primary reasons
        primary_reasons = self._generate_primary_reasons(
            genre_analysis, embedding_analysis, weights, stage
        )
        
        # Generate detailed breakdown
        detailed_breakdown = {
            "genre_compatibility": genre_analysis,
            "semantic_similarity": embedding_analysis,
            "algorithm_stage": stage_context,
            "confidence_factors": self._get_confidence_factors(user1_prefs, user2_prefs)
        }
        
        return {
            "movie_id": movie_id,
            "movie_title": movie.title,
            "session_stage": stage,
            "primary_explanation": self._format_primary_explanation(primary_reasons, stage),
            "why_this_movie": primary_reasons,
            "detailed_breakdown": detailed_breakdown,
            "user_context": {
                "user1_interactions": user1_prefs['total_interactions'],
                "user2_interactions": user2_prefs['total_interactions'],
                "user1_confidence": user1_prefs['confidence_score'],
                "user2_confidence": user2_prefs['confidence_score']
            }
        }
    
    def _create_default_preferences(self, user_id: str) -> Dict:
        """Create default preferences for users without data."""
        return {
            'genre_preferences': {},
            'embedding_vector': None,
            'confidence_score': 0.0,
            'total_interactions': 0
        }
    
    def _get_user_preferences(self, db: Session, user_id: str) -> Optional[Dict]:
        """Get user preferences with proper formatting."""
        prefs = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
        if not prefs:
            return None
        
        return {
            'genre_preferences': parse_json_field(prefs.genre_preferences) if prefs.genre_preferences else {},
            'embedding_vector': movie_service.bytes_to_array(prefs.embedding_vector) if prefs.embedding_vector else None,
            'confidence_score': prefs.confidence_score,
            'total_interactions': prefs.total_interactions
        }
    
    def _determine_stage(self, session: MatchingSession) -> str:
        """Determine the current session stage."""
        interactions = session.total_interactions
        if interactions <= 10:
            return 'exploration'
        elif interactions <= 30:
            return 'learning'
        else:
            return 'convergence'
    
    def _analyze_genre_match(self, movie_genres: List[str], user1_prefs: Dict, user2_prefs: Dict) -> Dict:
        """Analyze how well the movie's genres match user preferences."""
        user1_genre_prefs = user1_prefs['genre_preferences']
        user2_genre_prefs = user2_prefs['genre_preferences']
        
        if not movie_genres:
            return {
                "match_quality": "neutral",
                "explanation": "Movie has no specific genres listed",
                "user1_genre_scores": {},
                "user2_genre_scores": {},
                "combined_score": 0.5,
                "best_matching_genres": [],
                "movie_genres": []
            }
        
        # If users have no preferences yet, use neutral scores
        if not user1_genre_prefs and not user2_genre_prefs:
            neutral_scores = {genre: 0.5 for genre in movie_genres}
            return {
                "match_quality": "exploratory",
                "explanation": f"Exploring {', '.join(movie_genres[:2])} - no preferences learned yet",
                "user1_genre_scores": neutral_scores,
                "user2_genre_scores": neutral_scores,
                "combined_score": 0.5,
                "best_matching_genres": [],
                "movie_genres": movie_genres
            }
        
        # Calculate individual user scores for each genre
        user1_scores = {genre: user1_genre_prefs.get(genre, 0.5) for genre in movie_genres}
        user2_scores = {genre: user2_genre_prefs.get(genre, 0.5) for genre in movie_genres}
        
        # Calculate combined scores
        user1_avg = np.mean(list(user1_scores.values()))
        user2_avg = np.mean(list(user2_scores.values()))
        combined_score = 0.7 * min(user1_avg, user2_avg) + 0.3 * np.mean([user1_avg, user2_avg])
        
        # Determine match quality
        if combined_score >= 0.7:
            match_quality = "excellent"
            explanation = f"Both users love {', '.join(movie_genres[:2])} movies"
        elif combined_score >= 0.6:
            match_quality = "good"
            explanation = f"Good match for {', '.join(movie_genres[:2])} preferences"
        elif combined_score >= 0.4:
            match_quality = "moderate"
            explanation = f"Moderate compatibility with {', '.join(movie_genres[:2])}"
        else:
            match_quality = "exploratory"
            explanation = f"Exploring {', '.join(movie_genres[:2])} to learn preferences"
        
        # Find best matching genres
        best_genres = []
        for genre in movie_genres:
            user1_score = user1_scores[genre]
            user2_score = user2_scores[genre]
            if min(user1_score, user2_score) >= 0.6:
                best_genres.append(genre)
        
        return {
            "match_quality": match_quality,
            "explanation": explanation,
            "user1_genre_scores": user1_scores,
            "user2_genre_scores": user2_scores,
            "combined_score": float(combined_score),
            "best_matching_genres": best_genres,
            "movie_genres": movie_genres
        }
    
    def _analyze_embedding_match(self, movie: Movie, user1_prefs: Dict, user2_prefs: Dict) -> Dict:
        """Analyze semantic similarity between movie and user preferences."""
        if not movie.embedding:
            return {
                "similarity_quality": "unknown",
                "explanation": "No semantic analysis available",
                "user1_similarity": 0.5,
                "user2_similarity": 0.5,
                "combined_similarity": 0.5
            }
        
        movie_embedding = movie_service.bytes_to_array(movie.embedding)
        user1_embedding = user1_prefs['embedding_vector']
        user2_embedding = user2_prefs['embedding_vector']
        
        if user1_embedding is None or user2_embedding is None:
            return {
                "similarity_quality": "learning",
                "explanation": "Still learning your taste preferences",
                "user1_similarity": 0.5,
                "user2_similarity": 0.5,
                "combined_similarity": 0.5
            }
        
        # Calculate similarities
        user1_sim = self._cosine_similarity(movie_embedding, user1_embedding)
        user2_sim = self._cosine_similarity(movie_embedding, user2_embedding)
        combined_sim = 0.7 * min(user1_sim, user2_sim) + 0.3 * np.mean([user1_sim, user2_sim])
        
        # Normalize to 0-1 range
        user1_sim_norm = (user1_sim + 1) / 2
        user2_sim_norm = (user2_sim + 1) / 2
        combined_sim_norm = (combined_sim + 1) / 2
        
        # Determine similarity quality
        if combined_sim_norm >= 0.8:
            similarity_quality = "excellent"
            explanation = "Very similar to movies you both loved"
        elif combined_sim_norm >= 0.7:
            similarity_quality = "good"
            explanation = "Matches your shared taste preferences well"
        elif combined_sim_norm >= 0.6:
            similarity_quality = "moderate"
            explanation = "Somewhat similar to your preferred movie styles"
        else:
            similarity_quality = "exploratory"
            explanation = "Exploring new movie styles for you"
        
        return {
            "similarity_quality": similarity_quality,
            "explanation": explanation,
            "user1_similarity": float(user1_sim_norm),
            "user2_similarity": float(user2_sim_norm),
            "combined_similarity": float(combined_sim_norm)
        }
    
    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors."""
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return np.dot(vec1, vec2) / (norm1 * norm2)
    
    def _get_stage_context(self, session: MatchingSession, stage: str) -> Dict:
        """Get context about the current algorithm stage."""
        weights = self.stage_weights[stage]
        
        return {
            "stage": stage,
            "description": self.stage_explanations[stage],
            "weights": weights,
            "total_interactions": session.total_interactions,
            "focus": self._get_stage_focus(stage, weights)
        }
    
    def _get_stage_focus(self, stage: str, weights: Dict) -> str:
        """Get the main focus of the current stage."""
        if stage == 'exploration':
            return "Discovering your movie preferences through diverse recommendations"
        elif stage == 'learning':
            return "Balancing genre preferences with deeper taste analysis"
        else:
            return "Using deep learning to find movies perfectly matched to your tastes"
    
    def _get_confidence_factors(self, user1_prefs: Dict, user2_prefs: Dict) -> Dict:
        """Get factors affecting recommendation confidence."""
        user1_confidence = user1_prefs['confidence_score']
        user2_confidence = user2_prefs['confidence_score']
        avg_confidence = (user1_confidence + user2_confidence) / 2
        
        confidence_level = "high" if avg_confidence >= 0.7 else "medium" if avg_confidence >= 0.4 else "low"
        
        return {
            "overall_confidence": confidence_level,
            "user1_confidence": float(user1_confidence),
            "user2_confidence": float(user2_confidence),
            "confidence_explanation": self._get_confidence_explanation(avg_confidence, user1_prefs, user2_prefs)
        }
    
    def _get_confidence_explanation(self, avg_confidence: float, user1_prefs: Dict, user2_prefs: Dict) -> str:
        """Generate explanation for confidence level."""
        user1_interactions = user1_prefs['total_interactions']
        user2_interactions = user2_prefs['total_interactions']
        
        if avg_confidence >= 0.7:
            return f"High confidence based on {user1_interactions + user2_interactions} total interactions"
        elif avg_confidence >= 0.4:
            return f"Building confidence with {user1_interactions + user2_interactions} interactions so far"
        else:
            return "Early stage - still learning your preferences"
    
    def _generate_primary_reasons(
        self, 
        genre_analysis: Dict, 
        embedding_analysis: Dict, 
        weights: Dict, 
        stage: str
    ) -> List[str]:
        """Generate the primary reasons for recommendation."""
        reasons = []
        
        # Genre-based reasons
        if weights['genre'] >= 0.5 and genre_analysis['match_quality'] in ['excellent', 'good']:
            if genre_analysis['best_matching_genres']:
                reasons.append(f"Both users enjoy {', '.join(genre_analysis['best_matching_genres'][:2])}")
            else:
                reasons.append(f"Good genre compatibility with {', '.join(genre_analysis['movie_genres'][:2])}")
        
        # Embedding-based reasons
        if weights['embedding'] >= 0.4 and embedding_analysis['similarity_quality'] in ['excellent', 'good']:
            reasons.append(embedding_analysis['explanation'])
        
        # Stage-specific reasons
        if stage == 'exploration':
            reasons.append("Exploring diverse options to learn your preferences")
        elif stage == 'convergence':
            reasons.append("Precisely matched to your learned taste profile")
        
        # Fallback reason
        if not reasons:
            reasons.append("Selected to help us understand your movie preferences better")
        
        return reasons[:3]  # Limit to top 3 reasons
    
    def _format_primary_explanation(self, reasons: List[str], stage: str) -> str:
        """Format the primary explanation text."""
        if not reasons:
            return "This movie was selected to explore your preferences."
        
        if len(reasons) == 1:
            return f"This movie was recommended because: {reasons[0]}."
        elif len(reasons) == 2:
            return f"This movie was recommended because: {reasons[0]} and {reasons[1]}."
        else:
            return f"This movie was recommended because: {reasons[0]}, {reasons[1]}, and {reasons[2]}."

# CLI interface for testing
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Explain movie recommendations")
    parser.add_argument("--session-id", required=True, help="Matching session ID")
    parser.add_argument("--movie-id", type=int, required=True, help="Movie ID to explain")
    parser.add_argument("--user1-id", required=True, help="First user ID")
    parser.add_argument("--user2-id", required=True, help="Second user ID")
    
    args = parser.parse_args()
    
    explainer = RecommendationExplainer()
    db = next(get_db())
    
    try:
        result = explainer.explain_recommendation(
            db, args.session_id, args.movie_id, args.user1_id, args.user2_id
        )
        print(json.dumps(result, indent=2))
    finally:
        db.close() 