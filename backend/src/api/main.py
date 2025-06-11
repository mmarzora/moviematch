from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import json
import uuid
from typing import List, Optional, Dict
from pydantic import BaseModel
import os
import sys
import logging
from dotenv import load_dotenv
from datetime import datetime
from .routes import matching, movies, embedding_analysis
from ..config import settings
from ..tools.recommendation_explainer import RecommendationExplainer
from sqlalchemy.orm import Session
from fastapi import Depends
from ..database.db import get_db

# Load environment variables
load_dotenv(dotenv_path='.env')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MovieMatch API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080", "file://"],  # Allow both React dev and local HTML server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Movie(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    release_year: Optional[int] = None
    poster_url: Optional[str] = None
    genres: List[str] = []  # Will be stored as JSON in DB
    runtime_minutes: Optional[int] = None
    rating: Optional[float] = None  # REAL in DB
    watchmode_id: Optional[str] = None  # TEXT in DB
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class MovieList(BaseModel):
    movies: List[Movie]

class MovieSimilarity(BaseModel):
    id: int
    title: str
    rating: Optional[float] = None  # Changed to float to match DB
    release_year: Optional[int] = None
    similarity: float

class CreateSessionRequest(BaseModel):
    user1_id: str
    user2_id: str

class CreateSessionResponse(BaseModel):
    session_id: str

class FeedbackRequest(BaseModel):
    user_id: str
    movie_id: int
    feedback_type: str  # 'like', 'dislike', 'skip'
    time_spent_ms: Optional[int] = None

class FeedbackResponse(BaseModel):
    success: bool
    message: str

app.include_router(matching.router, prefix="/api/matching")
app.include_router(movies.router, prefix="/api/movies")
app.include_router(embedding_analysis.router, prefix="/api/embeddings")

@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "MovieMatch API is running"}

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "moviematch-backend"}


# Add explanation endpoint
@app.get("/api/matching/explain/{session_id}/{movie_id}")
async def explain_recommendation(
    session_id: str,
    movie_id: int,
    user1_id: str = Query(..., description="First user ID"),
    user2_id: str = Query(..., description="Second user ID"),
    db: Session = Depends(get_db)
):
    """Get explanation for why a specific movie was recommended."""
    try:
        explainer = RecommendationExplainer()
        explanation = explainer.explain_recommendation(
            db, session_id, movie_id, user1_id, user2_id
        )
        
        if "error" in explanation:
            raise HTTPException(status_code=404, detail=explanation["error"])
        
        return explanation
    except Exception as e:
        logger.error(f"Error explaining recommendation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to explain recommendation: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=port,
        reload=settings.DEBUG
    ) 
