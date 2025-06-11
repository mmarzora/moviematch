"""
FastAPI endpoints for embedding analysis and interpretation.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
import json

from ...database.db import get_db
from ...tools.embedding_analyzer import EmbeddingAnalyzer
from ...tools.semantic_analyzer import SemanticAnalyzer

router = APIRouter(tags=["embeddings"])

@router.get("/analyze/dimensions")
def analyze_dimensions(
    top_n: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Analyze embedding dimensions and their correlations with genres."""
    analyzer = EmbeddingAnalyzer()
    result = analyzer.analyze_embedding_dimensions(db, top_n=top_n)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/analyze/clusters")
def analyze_clusters(
    n_clusters: int = Query(8, ge=2, le=20),
    db: Session = Depends(get_db)
):
    """Cluster movies based on embeddings."""
    analyzer = EmbeddingAnalyzer()
    result = analyzer.cluster_movies(db, n_clusters=n_clusters)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/analyze/reduction")
def reduce_dimensions(
    method: str = Query("pca", regex="^(pca|tsne)$"),
    n_components: int = Query(2, ge=2, le=3),
    limit: Optional[int] = Query(None, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Reduce embedding dimensions for visualization."""
    analyzer = EmbeddingAnalyzer()
    
    # Temporarily set limit for faster processing
    if limit:
        analyzer.get_all_embeddings = lambda db, lim=limit: analyzer.get_all_embeddings(db, limit=lim)
    
    result = analyzer.reduce_dimensions(db, method=method, n_components=n_components)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/analyze/outliers")
def analyze_outliers(
    threshold: float = Query(2.0, ge=1.0, le=5.0),
    db: Session = Depends(get_db)
):
    """Find movies with unusual embeddings."""
    analyzer = EmbeddingAnalyzer()
    result = analyzer.find_embedding_outliers(db, threshold=threshold)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/analyze/user/{user_id}")
def analyze_user_embedding(
    user_id: str,
    db: Session = Depends(get_db)
):
    """Analyze a user's learned embedding preferences."""
    analyzer = EmbeddingAnalyzer()
    result = analyzer.analyze_user_embedding(db, user_id)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/analyze/compare/{movie_id1}/{movie_id2}")
def compare_movie_embeddings(
    movie_id1: int,
    movie_id2: int,
    db: Session = Depends(get_db)
):
    """Compare embeddings between two movies."""
    analyzer = EmbeddingAnalyzer()
    result = analyzer.compare_embeddings(db, movie_id1, movie_id2)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/analyze/report")
def generate_interpretation_report(
    db: Session = Depends(get_db)
):
    """Generate a comprehensive embedding interpretation report."""
    analyzer = EmbeddingAnalyzer()
    result = analyzer.generate_interpretation_report(db)
    
    return result

@router.get("/visualization/data")
def get_visualization_data(
    method: str = Query("pca", regex="^(pca|tsne)$"),
    limit: int = Query(100, ge=10, le=500),
    db: Session = Depends(get_db)
):
    """Get data for embedding visualization."""
    analyzer = EmbeddingAnalyzer()
    
    # Get reduced dimensions for visualization
    reduction_result = analyzer.reduce_dimensions(db, method=method, n_components=2)
    
    if "error" in reduction_result:
        raise HTTPException(status_code=404, detail=reduction_result["error"])
    
    movies = reduction_result["movies"][:limit]
    
    # Group by primary genre for coloring
    genre_groups = {}
    for movie in movies:
        primary_genre = movie["genres"][0] if movie["genres"] else "Unknown"
        if primary_genre not in genre_groups:
            genre_groups[primary_genre] = []
        genre_groups[primary_genre].append(movie)
    
    return {
        "method": method,
        "total_movies": len(movies),
        "movies": movies,
        "genre_groups": genre_groups,
        "unique_genres": list(genre_groups.keys()),
        "explained_variance": reduction_result.get("explained_variance_ratio", [])
    } 
    
    return result

@router.get("/semantic/themes/user/{user_id}")
def get_user_semantic_themes(
    user_id: str,
    db: Session = Depends(get_db)
):
    """Get semantic themes for a specific user based on their embedding preferences."""
    analyzer = SemanticAnalyzer()
    result = analyzer.analyze_user_semantic_preferences(db, user_id)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/semantic/themes/movie/{movie_id}")
def get_movie_semantic_themes(
    movie_id: int,
    db: Session = Depends(get_db)
):
    """Get semantic themes for a specific movie."""
    analyzer = SemanticAnalyzer()
    result = analyzer.analyze_movie_themes(db, movie_id)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/semantic/themes/compare")
def compare_user_semantic_themes(
    user1_id: str = Query(..., description="First user ID"),
    user2_id: str = Query(..., description="Second user ID"),
    db: Session = Depends(get_db)
):
    """Compare semantic themes between two users."""
    analyzer = SemanticAnalyzer()
    result = analyzer.compare_semantic_preferences(db, user1_id, user2_id)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/user/{user_id}")
def analyze_user_embedding(
    user_id: str,
    db: Session = Depends(get_db)
):
    """Analyze a user's learned embedding preferences."""
    analyzer = EmbeddingAnalyzer()
    result = analyzer.analyze_user_embedding(db, user_id)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/compare/movies")
def compare_movie_embeddings(
    movie_id1: int = Query(..., description="First movie ID"),
    movie_id2: int = Query(..., description="Second movie ID"),
    db: Session = Depends(get_db)
):
    """Compare embeddings between two movies."""
    analyzer = EmbeddingAnalyzer()
    result = analyzer.compare_embeddings(db, movie_id1, movie_id2)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/report")
def generate_interpretation_report(
    db: Session = Depends(get_db)
):
    """Generate a comprehensive embedding interpretation report."""
    analyzer = EmbeddingAnalyzer()
    result = analyzer.generate_interpretation_report(db)
    
    return result 