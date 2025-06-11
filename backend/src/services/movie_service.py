import json
import numpy as np
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from sentence_transformers import SentenceTransformer
import logging

from ..models.models import Movie
from ..config import settings
# from ..database.db import get_db

def parse_json_field(val):
    if isinstance(val, str):
        return json.loads(val)
    return val if val else []

class MovieService:
    """Service for movie-related operations."""
    _model = None  # Class-level cache for the model

    def __init__(self):
        pass  # Do not load the model here

    @classmethod
    def get_model(cls):
        if cls._model is None:
            from sentence_transformers import SentenceTransformer
            from ..config import settings
            cls._model = SentenceTransformer(settings.EMBEDDING_MODEL)
        return cls._model

    def get_movie_embedding(self, title: str, description: str, genres: List[str]) -> bytes:
        """Generate embedding for a movie based on its metadata."""
        text = f"{title} {description} {' '.join(genres)}"
        model = self.get_model()
        embedding = model.encode([text])[0]
        return embedding.tobytes()
    
    def bytes_to_array(self, embedding_bytes: bytes) -> np.ndarray:
        """Convert bytes back to numpy array."""
        return np.frombuffer(embedding_bytes, dtype=np.float32)
    
    def get_random_movies(
        self, 
        db: Session, 
        limit: int = 20, 
        year_start: Optional[int] = None,
        min_rating: Optional[float] = None
    ) -> List[dict]:
        """Get random movies with optional filters."""
        logger = logging.getLogger(__name__)
        # Log the database connection info
        try:
            db_bind = db.get_bind()
            logger.info(f"SQLAlchemy DB bind: {db_bind}")
        except Exception as e:
            logger.warning(f"Could not get DB bind: {e}")
        query = db.query(Movie)
        logger.info(f"Initial movie count: {query.count()}")
        if year_start:
            query = query.filter(Movie.release_year >= year_start)
            logger.info(f"Applied year_start filter: {year_start}")
        if min_rating:
            query = query.filter(Movie.rating >= min_rating)
            logger.info(f"Applied min_rating filter: {min_rating}")
        # Log the SQL query being executed
        try:
            logger.info(f"SQL Query: {str(query.statement.compile(compile_kwargs={'literal_binds': True}))}")
        except Exception as e:
            logger.warning(f"Could not log SQL query: {e}")
        # Get total count for random sampling
        total = query.count()
        logger.info(f"Filtered movie count: {total}")
        if total == 0:
            logger.warning("No movies found after applying filters.")
            return []
        # Get random movies
        movies = query.order_by(func.random()).limit(limit).all()
        logger.info(f"Returning {len(movies)} movies.")
        # Convert to dictionaries and parse genres
        result = []
        for movie in movies:
            movie_dict = movie.to_dict()
            movie_dict['genres'] = parse_json_field(movie_dict['genres'])
            result.append(movie_dict)
        return result
    
    def get_movie(self, db: Session, movie_id: int) -> Optional[dict]:
        """Get a specific movie by ID."""
        movie = db.query(Movie).filter(Movie.id == movie_id).first()
        if not movie:
            return None
            
        movie_dict = movie.to_dict()
        movie_dict['genres'] = parse_json_field(movie_dict['genres'])
        return movie_dict
    
    def get_similar_movies(self, db: Session, movie_id: int, limit: int = 5) -> List[dict]:
        """Get similar movies based on embedding similarity."""
        # Get source movie
        source_movie = db.query(Movie).filter(Movie.id == movie_id).first()
        if not source_movie or not source_movie.embedding:
            return []
            
        source_embedding = self.bytes_to_array(source_movie.embedding)
        
        # Get all other movies
        movies = db.query(Movie).filter(Movie.id != movie_id).all()
        
        # Calculate similarities
        similarities = []
        for movie in movies:
            if not movie.embedding:
                continue
                
            movie_dict = movie.to_dict()
            movie_dict['genres'] = parse_json_field(movie_dict['genres'])
            
            target_embedding = self.bytes_to_array(movie.embedding)
            similarity = np.dot(source_embedding, target_embedding) / (
                np.linalg.norm(source_embedding) * np.linalg.norm(target_embedding)
            )
            similarities.append((similarity, movie_dict))
        
        # Sort by similarity and return top N
        similarities.sort(key=lambda x: x[0], reverse=True)
        return [movie for _, movie in similarities[:limit]]

# Global service instance
movie_service = MovieService() 