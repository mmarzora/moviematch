"""
SQLAlchemy models for the MovieMatch backend.
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Float, DateTime, LargeBinary, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from ..database.db import Base

class Movie(Base):
    """Movie model."""
    
    __tablename__ = "movies"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    description = Column(Text)
    release_year = Column(Integer, index=True)
    poster_url = Column(String)
    genres = Column(String)  # JSON array stored as string
    runtime_minutes = Column(Integer)
    rating = Column(Float)
    embedding = Column(LargeBinary)
    watchmode_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self) -> dict:
        """Convert model to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "release_year": self.release_year,
            "poster_url": self.poster_url,
            "genres": self.genres,  # Will be parsed as JSON by the API
            "runtime_minutes": self.runtime_minutes,
            "rating": self.rating,
            "watchmode_id": self.watchmode_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

class UserPreference(Base):
    """User preference model for storing learned preferences."""
    
    __tablename__ = "user_preferences"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)  # Firebase user ID
    genre_preferences = Column(String)  # JSON string of genre weights
    embedding_vector = Column(LargeBinary)  # Learned preference vector in embedding space
    confidence_score = Column(Float, default=0.0)  # Confidence in preferences (0-1)
    total_interactions = Column(Integer, default=0)  # Number of movies rated
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MatchingSession(Base):
    """Matching session model for tracking couple sessions."""
    
    __tablename__ = "matching_sessions"
    
    id = Column(String, primary_key=True, index=True)  # Session ID
    user1_id = Column(String, nullable=False)  # Firebase user ID
    user2_id = Column(String, nullable=False)  # Firebase user ID
    session_preferences = Column(String)  # JSON of learned session preferences
    # embedding_center = Column(LargeBinary)  # Current session preference center
    total_interactions = Column(Integer, default=0)
    mutual_likes = Column(Integer, default=0)  # Movies both users liked
    session_stage = Column(String, default="exploration")  # exploration, learning, convergence
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class UserFeedback(Base):
    """User feedback model for tracking movie interactions."""
    
    __tablename__ = "user_feedback"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("matching_sessions.id"), nullable=False)
    user_id = Column(String, nullable=False)
    movie_id = Column(Integer, ForeignKey("movies.id"), nullable=False)
    feedback_type = Column(String, nullable=False)  # like, dislike, skip
    time_spent_ms = Column(Integer)  # Time spent viewing the card
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    movie = relationship("Movie")
    session = relationship("MatchingSession") 