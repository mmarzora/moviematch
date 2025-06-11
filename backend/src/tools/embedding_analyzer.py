"""
Movie Embedding Interpretation Tool for MovieMatch Algorithm

This tool provides various methods to interpret and visualize the movie embeddings
used in the MovieMatch recommendation algorithm.
"""

import numpy as np
import json
from typing import List, Dict, Tuple, Optional
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy.orm import Session
from sentence_transformers import SentenceTransformer
import pandas as pd
from collections import defaultdict, Counter
import os

# Set environment variable to avoid OpenMP issues on macOS
os.environ['OMP_NUM_THREADS'] = '1'

from ..models.models import Movie, UserPreference
from ..services.movie_service import movie_service
from ..database.db import get_db

def parse_json_field(val):
    if isinstance(val, str):
        return json.loads(val)
    return val if val else []

class EmbeddingAnalyzer:
    """Tool for analyzing and interpreting movie embeddings."""
    _model = None  # Class-level cache for the model

    def __init__(self):
        self.embedding_dim = 384  # all-MiniLM-L6-v2 dimension
        # Do not load the model here

    @classmethod
    def get_model(cls):
        if cls._model is None:
            from sentence_transformers import SentenceTransformer
            cls._model = SentenceTransformer('all-MiniLM-L6-v2')
        return cls._model
    
    def get_all_embeddings(self, db: Session, limit: Optional[int] = None) -> Tuple[np.ndarray, List[dict]]:
        """Get all movie embeddings and metadata."""
        query = db.query(Movie).filter(Movie.embedding.isnot(None))
        if limit:
            query = query.limit(limit)
            
        movies = query.all()
        
        embeddings = []
        movie_data = []
        
        for movie in movies:
            embedding = movie_service.bytes_to_array(movie.embedding)
            embeddings.append(embedding)
            
            movie_dict = movie.to_dict()
            movie_dict['genres'] = parse_json_field(movie_dict['genres']) if movie_dict['genres'] else []
            movie_data.append(movie_dict)
        
        return np.array(embeddings), movie_data
    
    def analyze_embedding_dimensions(self, db: Session, top_n: int = 10) -> Dict:
        """Analyze which embedding dimensions are most important."""
        embeddings, movie_data = self.get_all_embeddings(db)
        
        if len(embeddings) == 0:
            return {"error": "No embeddings found"}
        
        # Calculate variance for each dimension
        variances = np.var(embeddings, axis=0)
        top_dims = np.argsort(variances)[-top_n:][::-1]
        
        # Analyze correlation with genres
        genre_correlations = self._analyze_genre_correlations(embeddings, movie_data, top_dims)
        
        return {
            "total_movies": len(embeddings),
            "embedding_dimension": embeddings.shape[1],
            "top_varying_dimensions": [
                {
                    "dimension": int(dim),
                    "variance": float(variances[dim]),
                    "genre_correlations": genre_correlations.get(dim, {})
                }
                for dim in top_dims
            ],
            "overall_variance_explained": float(np.sum(variances[top_dims]) / np.sum(variances))
        }
    
    def _analyze_genre_correlations(self, embeddings: np.ndarray, movie_data: List[dict], dimensions: np.ndarray) -> Dict:
        """Analyze correlation between embedding dimensions and genres."""
        correlations = {}
        
        # Get all unique genres
        all_genres = set()
        for movie in movie_data:
            all_genres.update(movie['genres'])
        
        for dim in dimensions:
            dim_values = embeddings[:, dim]
            genre_correlations = {}
            
            for genre in all_genres:
                # Create binary indicator for this genre
                genre_indicator = [1 if genre in movie['genres'] else 0 for movie in movie_data]
                
                if sum(genre_indicator) > 5:  # Only analyze genres with enough movies
                    correlation = np.corrcoef(dim_values, genre_indicator)[0, 1]
                    if not np.isnan(correlation):
                        genre_correlations[genre] = float(correlation)
            
            # Keep only strongest correlations
            if genre_correlations:
                sorted_corr = sorted(genre_correlations.items(), key=lambda x: abs(x[1]), reverse=True)
                correlations[dim] = dict(sorted_corr[:5])
        
        return correlations
    
    def reduce_dimensions(self, db: Session, method: str = "pca", n_components: int = 2) -> Dict:
        """Reduce embedding dimensions for visualization."""
        embeddings, movie_data = self.get_all_embeddings(db)
        
        if len(embeddings) == 0:
            return {"error": "No embeddings found"}
        
        if method.lower() == "pca":
            reducer = PCA(n_components=n_components, random_state=42)
        elif method.lower() == "tsne":
            reducer = TSNE(n_components=n_components, random_state=42, perplexity=min(30, len(embeddings)-1))
        else:
            raise ValueError("Method must be 'pca' or 'tsne'")
        
        reduced_embeddings = reducer.fit_transform(embeddings)
        
        # Prepare data for visualization
        visualization_data = []
        for i, movie in enumerate(movie_data):
            visualization_data.append({
                "id": movie["id"],
                "title": movie["title"],
                "genres": parse_json_field(movie["genres"]),
                "rating": movie.get("rating"),
                "release_year": movie.get("release_year"),
                "x": float(reduced_embeddings[i, 0]),
                "y": float(reduced_embeddings[i, 1]) if n_components > 1 else 0,
                "z": float(reduced_embeddings[i, 2]) if n_components > 2 else 0
            })
        
        result = {
            "method": method,
            "n_components": n_components,
            "total_movies": len(embeddings),
            "movies": visualization_data
        }
        
        if method.lower() == "pca" and hasattr(reducer, 'explained_variance_ratio_'):
            result["explained_variance_ratio"] = reducer.explained_variance_ratio_.tolist()
            result["total_variance_explained"] = float(np.sum(reducer.explained_variance_ratio_))
        
        return result
    
    def cluster_movies(self, db: Session, n_clusters: int = 8) -> Dict:
        """Cluster movies based on embeddings."""
        embeddings, movie_data = self.get_all_embeddings(db)
        
        if len(embeddings) == 0:
            return {"error": "No embeddings found"}
        
        # Perform clustering with explicit parameters to avoid OpenMP issues
        try:
            kmeans = KMeans(
                n_clusters=n_clusters, 
                random_state=42, 
                n_init=10,  # Set explicitly to avoid warning
                max_iter=300,
                algorithm='lloyd'  # Use lloyd algorithm which is more stable
            )
            cluster_labels = kmeans.fit_predict(embeddings)
        except Exception as e:
            return {"error": f"Clustering failed: {str(e)}"}
        
        # Analyze clusters
        clusters = defaultdict(list)
        for i, label in enumerate(cluster_labels):
            movie = movie_data[i].copy()
            movie["cluster"] = int(label)
            clusters[int(label)].append(movie)
        
        # Analyze cluster characteristics
        cluster_analysis = {}
        for cluster_id, movies in clusters.items():
            # Genre distribution
            genre_counter = Counter()
            ratings = []
            years = []
            
            for movie in movies:
                genre_counter.update(movie['genres'])
                if movie.get('rating'):
                    ratings.append(movie['rating'])
                if movie.get('release_year'):
                    years.append(movie['release_year'])
            
            cluster_analysis[cluster_id] = {
                "size": len(movies),
                "top_genres": dict(genre_counter.most_common(5)),
                "avg_rating": float(np.mean(ratings)) if ratings else None,
                "avg_year": float(np.mean(years)) if years else None,
                "sample_movies": [
                    {"id": m["id"], "title": m["title"], "genres": parse_json_field(m["genres"])}
                    for m in movies[:5]
                ]
            }
        
        return {
            "n_clusters": n_clusters,
            "total_movies": len(embeddings),
            "inertia": float(kmeans.inertia_),
            "clusters": dict(clusters),
            "cluster_analysis": cluster_analysis
        }
    
    def analyze_user_embedding(self, db: Session, user_id: str) -> Dict:
        """Analyze a user's learned embedding preferences."""
        user_prefs = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
        
        if not user_prefs or not user_prefs.embedding_vector:
            return {"error": "No embedding found for user"}
        
        user_embedding = movie_service.bytes_to_array(user_prefs.embedding_vector)
        
        # Find most similar movies
        embeddings, movie_data = self.get_all_embeddings(db)
        
        similarities = []
        for i, movie_embedding in enumerate(embeddings):
            similarity = np.dot(user_embedding, movie_embedding) / (
                np.linalg.norm(user_embedding) * np.linalg.norm(movie_embedding)
            )
            similarities.append((float(similarity), movie_data[i]))
        
        # Sort by similarity
        similarities.sort(key=lambda x: x[0], reverse=True)
        
        # Analyze embedding characteristics
        embedding_stats = {
            "norm": float(np.linalg.norm(user_embedding)),
            "mean": float(np.mean(user_embedding)),
            "std": float(np.std(user_embedding)),
            "min": float(np.min(user_embedding)),
            "max": float(np.max(user_embedding)),
            "positive_dimensions": int(np.sum(user_embedding > 0)),
            "negative_dimensions": int(np.sum(user_embedding < 0))
        }
        
        # Find characteristic dimensions
        top_positive_dims = np.argsort(user_embedding)[-10:][::-1]
        top_negative_dims = np.argsort(user_embedding)[:10]
        
        return {
            "user_id": user_id,
            "confidence_score": user_prefs.confidence_score,
            "total_interactions": user_prefs.total_interactions,
            "embedding_stats": embedding_stats,
            "most_similar_movies": [
                {"title": movie["title"], "genres": parse_json_field(movie["genres"]), "similarity": sim}
                for sim, movie in similarities[:10]
            ],
            "least_similar_movies": [
                {"title": movie["title"], "genres": parse_json_field(movie["genres"]), "similarity": sim}
                for sim, movie in similarities[-5:]
            ],
            "top_positive_dimensions": [int(dim) for dim in top_positive_dims],
            "top_negative_dimensions": [int(dim) for dim in top_negative_dims]
        }
    
    def find_embedding_outliers(self, db: Session, threshold: float = 2.0) -> Dict:
        """Find movies with unusual embeddings."""
        embeddings, movie_data = self.get_all_embeddings(db)
        
        if len(embeddings) == 0:
            return {"error": "No embeddings found"}
        
        # Calculate distance from centroid
        centroid = np.mean(embeddings, axis=0)
        distances = [
            np.linalg.norm(embedding - centroid)
            for embedding in embeddings
        ]
        
        # Find outliers
        mean_distance = np.mean(distances)
        std_distance = np.std(distances)
        outlier_threshold = mean_distance + threshold * std_distance
        
        outliers = []
        for i, distance in enumerate(distances):
            if distance > outlier_threshold:
                movie = movie_data[i].copy()
                movie["distance_from_centroid"] = float(distance)
                movie["z_score"] = float((distance - mean_distance) / std_distance)
                outliers.append(movie)
        
        # Sort by distance
        outliers.sort(key=lambda x: x["distance_from_centroid"], reverse=True)
        
        return {
            "total_movies": len(embeddings),
            "threshold": threshold,
            "mean_distance": float(mean_distance),
            "std_distance": float(std_distance),
            "outlier_threshold": float(outlier_threshold),
            "n_outliers": len(outliers),
            "outliers": outliers[:20]  # Top 20 outliers
        }
    
    def compare_embeddings(self, db: Session, movie_id1: int, movie_id2: int) -> Dict:
        """Compare embeddings between two movies."""
        movie1 = db.query(Movie).filter(Movie.id == movie_id1).first()
        movie2 = db.query(Movie).filter(Movie.id == movie_id2).first()
        
        if not movie1 or not movie2:
            return {"error": "One or both movies not found"}
        
        if not movie1.embedding or not movie2.embedding:
            return {"error": "One or both movies missing embeddings"}
        
        emb1 = movie_service.bytes_to_array(movie1.embedding)
        emb2 = movie_service.bytes_to_array(movie2.embedding)
        
        # Calculate various similarity metrics
        cosine_sim = float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2)))
        euclidean_dist = float(np.linalg.norm(emb1 - emb2))
        manhattan_dist = float(np.sum(np.abs(emb1 - emb2)))
        
        # Find most different dimensions
        diff = np.abs(emb1 - emb2)
        most_different_dims = np.argsort(diff)[-10:][::-1]
        most_similar_dims = np.argsort(diff)[:10]
        
        return {
            "movie1": {
                "id": movie1.id,
                "title": movie1.title,
                "genres": parse_json_field(movie1.genres) if movie1.genres else []
            },
            "movie2": {
                "id": movie2.id,
                "title": movie2.title,
                "genres": parse_json_field(movie2.genres) if movie2.genres else []
            },
            "similarity_metrics": {
                "cosine_similarity": cosine_sim,
                "euclidean_distance": euclidean_dist,
                "manhattan_distance": manhattan_dist
            },
            "embedding_analysis": {
                "most_different_dimensions": [int(dim) for dim in most_different_dims],
                "most_similar_dimensions": [int(dim) for dim in most_similar_dims],
                "max_difference": float(np.max(diff)),
                "min_difference": float(np.min(diff)),
                "mean_difference": float(np.mean(diff))
            }
        }
    
    def generate_interpretation_report(self, db: Session) -> Dict:
        """Generate a comprehensive interpretation report."""
        report = {
            "timestamp": pd.Timestamp.now().isoformat(),
            "embedding_model": "all-MiniLM-L6-v2",
            "embedding_dimension": self.embedding_dim
        }
        
        # Basic statistics
        embeddings, movie_data = self.get_all_embeddings(db)
        if len(embeddings) > 0:
            report["basic_stats"] = {
                "total_movies_with_embeddings": len(embeddings),
                "embedding_norm_stats": {
                    "mean": float(np.mean([np.linalg.norm(emb) for emb in embeddings])),
                    "std": float(np.std([np.linalg.norm(emb) for emb in embeddings])),
                    "min": float(np.min([np.linalg.norm(emb) for emb in embeddings])),
                    "max": float(np.max([np.linalg.norm(emb) for emb in embeddings]))
                }
            }
            
            # Dimension analysis
            report["dimension_analysis"] = self.analyze_embedding_dimensions(db, top_n=10)
            
            # Clustering analysis
            report["clustering"] = self.cluster_movies(db, n_clusters=8)
            
            # Outlier analysis
            report["outliers"] = self.find_embedding_outliers(db, threshold=2.0)
            
            # PCA analysis
            report["pca_analysis"] = self.reduce_dimensions(db, method="pca", n_components=10)
        
        return report

# CLI interface for testing
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Analyze movie embeddings")
    parser.add_argument("--action", choices=[
        "dimensions", "cluster", "reduce", "outliers", "report"
    ], default="report", help="Analysis action to perform")
    parser.add_argument("--user-id", help="User ID for user embedding analysis")
    parser.add_argument("--movie-ids", nargs=2, type=int, help="Two movie IDs to compare")
    parser.add_argument("--method", choices=["pca", "tsne"], default="pca", help="Dimensionality reduction method")
    parser.add_argument("--n-clusters", type=int, default=8, help="Number of clusters")
    
    args = parser.parse_args()
    
    analyzer = EmbeddingAnalyzer()
    db = next(get_db())
    
    try:
        if args.action == "dimensions":
            result = analyzer.analyze_embedding_dimensions(db)
        elif args.action == "cluster":
            result = analyzer.cluster_movies(db, n_clusters=args.n_clusters)
        elif args.action == "reduce":
            result = analyzer.reduce_dimensions(db, method=args.method)
        elif args.action == "outliers":
            result = analyzer.find_embedding_outliers(db)
        elif args.action == "report":
            result = analyzer.generate_interpretation_report(db)
        elif args.user_id:
            result = analyzer.analyze_user_embedding(db, args.user_id)
        elif args.movie_ids:
            result = analyzer.compare_embeddings(db, args.movie_ids[0], args.movie_ids[1])
        else:
            result = analyzer.generate_interpretation_report(db)
        
        print(json.dumps(result, indent=2))
        
    finally:
        db.close() 