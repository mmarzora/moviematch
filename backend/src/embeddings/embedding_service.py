import numpy as np
from sentence_transformers import SentenceTransformer
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

class MovieEmbeddingService:
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        self.model = SentenceTransformer(model_name)

    def _get_movie_text(self, movie: Movie) -> str:
        features = []
        if movie.title:
            features.append(movie.title)
        if movie.description:
            features.append(movie.description)
        if movie.genres:
            genres = parse_json_field(movie.genres) if movie.genres else []
            features.extend(genres)
        return " ".join(features)

    def generate_embedding(self, movie: Movie) -> np.ndarray:
        text = self._get_movie_text(movie)
        return self.model.encode(text)

    def update_all_embeddings(self):
        for db in get_db():
            movies = db.query(Movie).filter(Movie.embedding == None).all()
            logger.info(f"Generating embeddings for {len(movies)} movies")
            for movie in movies:
                embedding = self.generate_embedding(movie)
                movie.embedding = embedding.tobytes()
                db.commit()
                logger.info(f"Updated embedding for movie: {movie.title}")

    def find_similar_movies(self, movie_id: int, limit: int = 5) -> list:
        for db in get_db():
            # Get the embedding for our target movie
            movie = db.query(Movie).filter(Movie.id == movie_id, Movie.embedding != None).first()
            if not movie:
                logger.warning(f"No embedding found for movie {movie_id}")
                return []
            target_embedding = np.frombuffer(movie.embedding)
            # Get all other movies and their embeddings
            movies = db.query(Movie).filter(Movie.id != movie_id, Movie.embedding != None).all()
            similarities = []
            for m in movies:
                embedding = np.frombuffer(m.embedding)
                similarity = np.dot(target_embedding, embedding) / (
                    np.linalg.norm(target_embedding) * np.linalg.norm(embedding)
                )
                similarities.append({
                    'id': m.id,
                    'title': m.title,
                    'rating': float(m.rating) if m.rating is not None else None,
                    'release_year': m.release_year,
                    'similarity': float(similarity)
                })
            similarities.sort(key=lambda x: x['similarity'], reverse=True)
            return similarities[:limit]

if __name__ == "__main__":
    # Example usage
    embedding_service = MovieEmbeddingService()
    
    # Update all embeddings
    embedding_service.update_all_embeddings()
    
    # Find similar movies for a specific movie
    similar = embedding_service.find_similar_movies(1)
    print("Similar movies:", similar) 