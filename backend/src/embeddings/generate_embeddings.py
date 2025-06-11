from sentence_transformers import SentenceTransformer
import numpy as np
import json
import logging
from sqlalchemy.orm import Session
from moviematch.backend.src.database.db import get_db
from moviematch.backend.src.models.models import Movie

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def parse_json_field(val):
    if isinstance(val, str):
        return json.loads(val)
    return val if val else []

class MovieEmbeddings:
    def __init__(self, model_name='all-MiniLM-L6-v2'):
        """Initialize the embedding generator with a model."""
        self.model = SentenceTransformer(model_name)

    def _get_movie_text(self, title: str, description: str, genres: list) -> str:
        """Combine movie features into a single text for embedding."""
        features = []
        if title:
            features.append(title)
        if description:
            features.append(description)
        if genres:
            features.extend(genres)
        return " ".join(features)

    def generate_embedding(self, text: str) -> np.ndarray:
        """Generate embedding for a single text."""
        return self.model.encode(text)

    def update_movie_embedding(self, db: Session, movie: Movie):
        """Update the embedding for a single movie using SQLAlchemy session."""
        try:
            genres = parse_json_field(movie.genres) if movie.genres else []
            text = self._get_movie_text(movie.title, movie.description, genres)
            if not text.strip():
                logger.warning(f"No text to generate embedding for movie {movie.id}")
                return
            embedding = self.generate_embedding(text)
            movie.embedding = embedding.tobytes()
            db.commit()
            logger.info(f"Updated embedding for movie {movie.id}: {movie.title}")
        except Exception as e:
            logger.error(f"Error updating embedding for movie {movie.id}: {e}")

    def update_all_embeddings(self):
        """Update embeddings for all movies in the database using SQLAlchemy."""
        for db in get_db():
            movies = db.query(Movie).filter(Movie.embedding == None).all()
            logger.info(f"Generating embeddings for {len(movies)} movies...")
            for movie in movies:
                self.update_movie_embedding(db, movie)

    def find_similar_movies(self, movie_id: int, limit: int = 5) -> list:
        """Find similar movies based on embedding similarity."""
        with self.connect_db() as conn:
            # Get the embedding for our target movie
            result = conn.execute(
                "SELECT embedding FROM movies WHERE id = ? AND embedding IS NOT NULL",
                (movie_id,)
            ).fetchone()
            
            if not result:
                logger.warning(f"No embedding found for movie {movie_id}")
                return []
                
            target_embedding = np.frombuffer(result[0])
            
            # Get all other movies and their embeddings
            movies = conn.execute("""
                SELECT id, title, embedding, rating, release_year 
                FROM movies 
                WHERE id != ? AND embedding IS NOT NULL
            """, (movie_id,)).fetchall()
            
            # Calculate similarities
            similarities = []
            for movie in movies:
                embedding = np.frombuffer(movie['embedding'])
                similarity = np.dot(target_embedding, embedding) / (
                    np.linalg.norm(target_embedding) * np.linalg.norm(embedding)
                )
                
                similarities.append({
                    'id': movie['id'],
                    'title': movie['title'],
                    'rating': float(movie['rating']) if movie['rating'] is not None else None,
                    'release_year': movie['release_year'],
                    'similarity': float(similarity)
                })
            
            # Sort by similarity and return top matches
            similarities.sort(key=lambda x: x['similarity'], reverse=True)
            return similarities[:limit]

if __name__ == "__main__":
    # Create embeddings for all movies
    embedder = MovieEmbeddings()
    embedder.update_all_embeddings() 