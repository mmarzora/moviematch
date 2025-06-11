"""
Pydantic schemas for movie data validation.
"""

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

class MovieBase(BaseModel):
    """Base movie schema."""
    title: str
    description: Optional[str] = None
    release_year: Optional[int] = None
    poster_url: Optional[str] = None
    genres: List[str] = Field(default_factory=list)
    runtime_minutes: Optional[int] = None
    rating: Optional[float] = None
    watchmode_id: Optional[str] = None

class MovieResponse(MovieBase):
    """Movie response schema."""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class MovieList(BaseModel):
    """List of movies response schema."""
    movies: List[MovieResponse]

    class Config:
        from_attributes = True 