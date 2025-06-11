"""
Semantic Theme Analyzer for MovieMatch

This tool analyzes movie embeddings to extract semantic themes and descriptive
patterns that go beyond simple genre classifications.
"""

import numpy as np
import json
from typing import List, Dict, Tuple, Optional
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy.orm import Session
from collections import defaultdict, Counter
import re

from ..models.models import Movie, UserPreference
from ..services.movie_service import movie_service
from ..database.db import get_db

def parse_json_field(val):
    if isinstance(val, str):
        return json.loads(val)
    return val if val else []

class SemanticAnalyzer:
    """Analyzes movie embeddings to extract semantic themes."""
    
    def __init__(self):
        """Initialize the semantic analyzer."""
        self.theme_keywords = {
            # Mood/Atmosphere
            'dark_gritty': ['noir', 'dark', 'gritty', 'violent', 'brutal', 'disturbing'],
            'uplifting_feel_good': ['uplifting', 'heartwarming', 'feel-good', 'inspiring', 'positive'],
            'suspenseful_tense': ['suspense', 'tense', 'thriller', 'edge-of-seat', 'nail-biting'],
            'mind_bending': ['complex', 'cerebral', 'psychological', 'mind-bending', 'thought-provoking'],
            
            # Themes
            'love_romance': ['love', 'romance', 'romantic', 'relationship', 'couple'],
            'family_bonds': ['family', 'father', 'mother', 'son', 'daughter', 'siblings'],
            'friendship_loyalty': ['friendship', 'loyalty', 'brotherhood', 'bond', 'companions'],
            'coming_of_age': ['growing up', 'adolescence', 'youth', 'teenager', 'maturation'],
            'redemption_transformation': ['redemption', 'transformation', 'change', 'second chance'],
            'good_vs_evil': ['hero', 'villain', 'good vs evil', 'battle', 'conflict'],
            
            # Setting/Style
            'futuristic_sci_fi': ['future', 'space', 'alien', 'technology', 'robot', 'ai'],
            'historical_period': ['historical', 'period', 'medieval', 'ancient', 'vintage'],
            'urban_modern': ['city', 'urban', 'modern', 'contemporary', 'metropolitan'],
            'rural_nature': ['rural', 'countryside', 'nature', 'wilderness', 'small town'],
            
            # Narrative Style
            'ensemble_cast': ['ensemble', 'multiple characters', 'interconnected stories'],
            'character_study': ['character study', 'introspective', 'personal journey'],
            'fast_paced_action': ['fast-paced', 'action-packed', 'high-octane', 'adrenaline'],
            'slow_burn': ['slow-burn', 'gradual', 'meditative', 'contemplative'],
            
            # Visual/Artistic
            'visually_stunning': ['visual', 'cinematography', 'beautiful', 'artistic', 'aesthetic'],
            'minimalist': ['minimalist', 'simple', 'understated', 'subtle'],
            'epic_spectacle': ['epic', 'grand', 'spectacular', 'sweeping', 'monumental']
        }
    
    def analyze_movie_themes(self, db: Session, movie_id: int) -> Dict:
        """Analyze themes for a specific movie based on its embedding and metadata."""
        movie = db.query(Movie).filter(Movie.id == movie_id).first()
        if not movie or not movie.embedding:
            return {"error": "Movie not found or no embedding available"}
        
        movie_embedding = movie_service.bytes_to_array(movie.embedding)
        
        # Get movie text for keyword analysis
        movie_text = f"{movie.title} {movie.description or ''}"
        genres = parse_json_field(movie.genres) if movie.genres else []
        
        # Analyze themes using both embedding similarity and keyword matching
        themes = self._extract_themes_from_text(movie_text, genres)
        
        # Add embedding-based theme analysis
        semantic_themes = self._analyze_embedding_themes(db, movie_embedding, movie_id)
        
        return {
            "movie_id": movie_id,
            "title": movie.title,
            "genres": genres,
            "keyword_themes": themes,
            "semantic_themes": semantic_themes,
            "combined_themes": self._combine_theme_scores(themes, semantic_themes)
        }
    
    def analyze_user_semantic_preferences(self, db: Session, user_id: str) -> Dict:
        """Analyze a user's semantic preferences beyond genres."""
        user_prefs = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
        
        if not user_prefs or not user_prefs.embedding_vector:
            return {"error": "No embedding found for user"}
        
        user_embedding = movie_service.bytes_to_array(user_prefs.embedding_vector)
        
        # Find movies most similar to user preferences
        similar_movies = self._find_similar_movies_to_embedding(db, user_embedding, limit=20)
        
        # Analyze themes from these similar movies
        theme_scores = defaultdict(list)
        
        for movie_data in similar_movies:
            movie_themes = self.analyze_movie_themes(db, movie_data['id'])
            if 'combined_themes' in movie_themes:
                for theme, score in movie_themes['combined_themes'].items():
                    theme_scores[theme].append(score * movie_data['similarity'])
        
        # Calculate average theme preferences
        user_theme_preferences = {}
        for theme, scores in theme_scores.items():
            if scores:
                user_theme_preferences[theme] = {
                    'score': float(np.mean(scores)),
                    'confidence': len(scores) / len(similar_movies),
                    'count': len(scores)
                }
        
        # Sort by score and filter significant themes
        significant_themes = {
            theme: data for theme, data in user_theme_preferences.items()
            if data['score'] > 0.3 and data['confidence'] > 0.2
        }
        
        sorted_themes = dict(sorted(significant_themes.items(), key=lambda x: x[1]['score'], reverse=True))
        
        return {
            "user_id": user_id,
            "confidence_score": user_prefs.confidence_score,
            "total_interactions": user_prefs.total_interactions,
            "theme_preferences": sorted_themes,
            "top_themes": list(sorted_themes.keys())[:5],
            "sample_similar_movies": [
                {"title": m["title"], "similarity": m["similarity"]}
                for m in similar_movies[:5]
            ]
        }
    
    def compare_semantic_preferences(self, db: Session, user1_id: str, user2_id: str) -> Dict:
        """Compare semantic preferences between two users."""
        user1_analysis = self.analyze_user_semantic_preferences(db, user1_id)
        user2_analysis = self.analyze_user_semantic_preferences(db, user2_id)
        
        if "error" in user1_analysis or "error" in user2_analysis:
            return {"error": "Could not analyze one or both users"}
        
        user1_themes = user1_analysis.get('theme_preferences', {})
        user2_themes = user2_analysis.get('theme_preferences', {})
        
        # Find common themes
        common_themes = {}
        all_themes = set(user1_themes.keys()) | set(user2_themes.keys())
        
        for theme in all_themes:
            score1 = user1_themes.get(theme, {}).get('score', 0)
            score2 = user2_themes.get(theme, {}).get('score', 0)
            
            if score1 > 0.3 and score2 > 0.3:  # Both users have this theme
                avg_score = (score1 + score2) / 2
                compatibility = 1 - abs(score1 - score2)  # Higher when scores are similar
                
                common_themes[theme] = {
                    'user1_score': score1,
                    'user2_score': score2,
                    'average_score': avg_score,
                    'compatibility': compatibility,
                    'strength': min(score1, score2)  # Conservative estimate
                }
        
        # Sort by compatibility and strength
        sorted_common = dict(sorted(
            common_themes.items(), 
            key=lambda x: x[1]['compatibility'] * x[1]['strength'], 
            reverse=True
        ))
        
        # Calculate overall semantic compatibility
        if common_themes:
            semantic_compatibility = np.mean([
                data['compatibility'] * data['strength'] 
                for data in common_themes.values()
            ])
        else:
            semantic_compatibility = 0
        
        return {
            "user1_id": user1_id,
            "user2_id": user2_id,
            "user1_themes": user1_analysis.get('top_themes', []),
            "user2_themes": user2_analysis.get('top_themes', []),
            "common_themes": sorted_common,
            "semantic_compatibility": semantic_compatibility,
            "top_common_themes": list(sorted_common.keys())[:3],
            "theme_descriptions": self._get_theme_descriptions()
        }
    
    def _extract_themes_from_text(self, text: str, genres: List[str]) -> Dict[str, float]:
        """Extract themes from movie text using keyword matching."""
        text_lower = text.lower()
        themes = {}
        
        for theme, keywords in self.theme_keywords.items():
            score = 0
            for keyword in keywords:
                if keyword in text_lower:
                    score += 1
            
            # Normalize by number of keywords
            if len(keywords) > 0:
                themes[theme] = score / len(keywords)
        
        return themes
    
    def _analyze_embedding_themes(self, db: Session, target_embedding: np.ndarray, movie_id: int) -> Dict[str, float]:
        """Analyze themes based on embedding similarity to theme prototypes."""
        # Get movies with similar embeddings
        similar_movies = self._find_similar_movies_to_embedding(db, target_embedding, limit=10)
        
        # Analyze themes from similar movies
        theme_scores = defaultdict(list)
        
        for movie_data in similar_movies:
            if movie_data['id'] == movie_id:
                continue
                
            movie = db.query(Movie).filter(Movie.id == movie_data['id']).first()
            if movie:
                movie_text = f"{movie.title} {movie.description or ''}"
                genres = parse_json_field(movie.genres) if movie.genres else []
                themes = self._extract_themes_from_text(movie_text, genres)
                
                for theme, score in themes.items():
                    theme_scores[theme].append(score * movie_data['similarity'])
        
        # Calculate weighted average themes
        semantic_themes = {}
        for theme, scores in theme_scores.items():
            if scores:
                semantic_themes[theme] = float(np.mean(scores))
        
        return semantic_themes
    
    def _find_similar_movies_to_embedding(self, db: Session, target_embedding: np.ndarray, limit: int = 10) -> List[Dict]:
        """Find movies most similar to a given embedding."""
        movies = db.query(Movie).filter(Movie.embedding.isnot(None)).all()
        
        similarities = []
        for movie in movies:
            movie_embedding = movie_service.bytes_to_array(movie.embedding)
            similarity = cosine_similarity([target_embedding], [movie_embedding])[0][0]
            
            similarities.append({
                'id': movie.id,
                'title': movie.title,
                'similarity': float(similarity),
                'genres': parse_json_field(movie.genres) if movie.genres else []
            })
        
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        return similarities[:limit]
    
    def _combine_theme_scores(self, keyword_themes: Dict[str, float], semantic_themes: Dict[str, float]) -> Dict[str, float]:
        """Combine keyword and semantic theme scores."""
        all_themes = set(keyword_themes.keys()) | set(semantic_themes.keys())
        combined = {}
        
        for theme in all_themes:
            keyword_score = keyword_themes.get(theme, 0)
            semantic_score = semantic_themes.get(theme, 0)
            
            # Weight semantic similarity higher as it's more reliable
            combined_score = 0.3 * keyword_score + 0.7 * semantic_score
            if combined_score > 0.1:  # Only keep significant themes
                combined[theme] = combined_score
        
        return combined
    
    def _get_theme_descriptions(self) -> Dict[str, str]:
        """Get human-readable descriptions for themes."""
        return {
            'dark_gritty': 'Dark & Gritty - Noir, violent, or disturbing content',
            'uplifting_feel_good': 'Uplifting & Feel-Good - Heartwarming and inspiring stories',
            'suspenseful_tense': 'Suspenseful & Tense - Thriller elements and edge-of-seat moments',
            'mind_bending': 'Mind-Bending - Complex, cerebral, and thought-provoking',
            'love_romance': 'Love & Romance - Romantic relationships and love stories',
            'family_bonds': 'Family Bonds - Family relationships and dynamics',
            'friendship_loyalty': 'Friendship & Loyalty - Strong bonds between friends',
            'coming_of_age': 'Coming of Age - Growth and maturation stories',
            'redemption_transformation': 'Redemption & Transformation - Personal change journeys',
            'good_vs_evil': 'Good vs Evil - Classic hero vs villain conflicts',
            'futuristic_sci_fi': 'Futuristic Sci-Fi - Space, technology, and future settings',
            'historical_period': 'Historical Period - Past eras and historical settings',
            'urban_modern': 'Urban Modern - Contemporary city and metropolitan settings',
            'rural_nature': 'Rural Nature - Countryside and natural environments',
            'ensemble_cast': 'Ensemble Cast - Multiple main characters and storylines',
            'character_study': 'Character Study - Deep character exploration',
            'fast_paced_action': 'Fast-Paced Action - High-energy and adrenaline-filled',
            'slow_burn': 'Slow Burn - Gradual and contemplative pacing',
            'visually_stunning': 'Visually Stunning - Beautiful cinematography and aesthetics',
            'minimalist': 'Minimalist - Simple and understated storytelling',
            'epic_spectacle': 'Epic Spectacle - Grand scale and sweeping narratives'
        }

# CLI interface for testing
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Analyze semantic themes in movies")
    parser.add_argument("--action", choices=[
        "movie", "user", "compare"
    ], default="user", help="Analysis action to perform")
    parser.add_argument("--movie-id", type=int, help="Movie ID to analyze")
    parser.add_argument("--user-id", help="User ID to analyze")
    parser.add_argument("--user-ids", nargs=2, help="Two user IDs to compare")
    
    args = parser.parse_args()
    
    analyzer = SemanticAnalyzer()
    db = next(get_db())
    
    try:
        if args.action == "movie" and args.movie_id:
            result = analyzer.analyze_movie_themes(db, args.movie_id)
        elif args.action == "user" and args.user_id:
            result = analyzer.analyze_user_semantic_preferences(db, args.user_id)
        elif args.action == "compare" and args.user_ids:
            result = analyzer.compare_semantic_preferences(db, args.user_ids[0], args.user_ids[1])
        else:
            result = {"error": "Please provide required arguments for the selected action"}
        
        print(json.dumps(result, indent=2))
        
    finally:
        db.close() 