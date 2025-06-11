from pydantic import BaseModel
from typing import List, Optional
import numpy as np

class Movie(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    release_year: Optional[int] = None
    poster_url: Optional[str] = None
    genres: List[str] = []
    runtime_minutes: Optional[int] = None
    rating: Optional[float] = None
    embedding: Optional[bytes] = None
    watchmode_id: Optional[str] = None

class MovieResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    release_year: Optional[int] = None
    poster_url: Optional[str] = None
    genres: List[str] = []
    runtime_minutes: Optional[int] = None
    rating: Optional[float] = None
    # Exclude embedding and watchmode_id from response

    class Config:
        from_attributes = True  # For SQLAlchemy model compatibility 