"""
Movie API routes for the MovieMatch backend.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...database.db import get_db
from ...services.movie_service import movie_service
from ...schemas.movie import MovieResponse, MovieList

router = APIRouter()

@router.get("/random", response_model=MovieList)
async def get_random_movies(
    limit: int = 20,
    year_start: Optional[int] = None,
    minRating: Optional[float] = None,
    db: Session = Depends(get_db)
):
    """Get random movies with optional filters."""
    movies = movie_service.get_random_movies(
        db=db,
        limit=limit,
        year_start=year_start,
        min_rating=minRating
    )
    return {"movies": movies}

@router.get("/{movie_id}", response_model=MovieResponse)
async def get_movie(movie_id: int, db: Session = Depends(get_db)):
    """Get details for a specific movie."""
    movie = movie_service.get_movie(db=db, movie_id=movie_id)
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
    return movie

@router.get("/{movie_id}/similar", response_model=MovieList)
async def get_similar_movies(
    movie_id: int,
    limit: int = 5,
    db: Session = Depends(get_db)
):
    """Get similar movies based on embedding similarity."""
    movies = movie_service.get_similar_movies(
        db=db,
        movie_id=movie_id,
        limit=limit
    )
    if not movies:
        raise HTTPException(status_code=404, detail="Movie not found or has no similar movies")
    return {"movies": movies} 