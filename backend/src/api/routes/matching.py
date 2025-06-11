"""
API endpoints for the MovieMatch matching service.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ...database.db import get_db
from ...services.matching_service import matching_service
from ...models.models import MatchingSession, UserFeedback

router = APIRouter()

# Request/Response models
class CreateSessionRequest(BaseModel):
    user1_id: str
    user2_id: str

class CreateSessionResponse(BaseModel):
    session_id: str

class GetRecommendationsResponse(BaseModel):
    movies: List[dict]
    session_stage: str
    total_interactions: int
    mutual_likes: int

class FeedbackRequest(BaseModel):
    user_id: str
    movie_id: int
    feedback_type: str  # 'like', 'dislike', 'skip'
    time_spent_ms: Optional[int] = None

class FeedbackResponse(BaseModel):
    success: bool
    message: str

@router.post("/sessions", response_model=CreateSessionResponse)
def create_session(
    request: CreateSessionRequest,
    db: Session = Depends(get_db)
):
    """Create a new matching session for two users."""
    try:
        session_id = matching_service.create_session(
            db, request.user1_id, request.user2_id
        )
        return CreateSessionResponse(session_id=session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions/{session_id}/recommendations", response_model=GetRecommendationsResponse)
def get_recommendations(
    session_id: str,
    user_id: str,
    batch_size: int = 20,
    db: Session = Depends(get_db)
):
    """Get movie recommendations for a session and user."""
    try:
        # Get recommendations for the requesting user
        movies = matching_service.get_recommendations(db, session_id, user_id, batch_size)
        
        # Get session info
        session = db.query(MatchingSession).filter(MatchingSession.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return GetRecommendationsResponse(
            movies=movies,
            session_stage=session.session_stage,
            total_interactions=session.total_interactions,
            mutual_likes=session.mutual_likes
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sessions/{session_id}/feedback", response_model=FeedbackResponse)
def submit_feedback(
    session_id: str,
    request: FeedbackRequest,
    db: Session = Depends(get_db)
):
    """Submit user feedback for a movie."""
    try:
        # Validate feedback type
        if request.feedback_type not in ['like', 'dislike', 'skip']:
            raise HTTPException(
                status_code=400, 
                detail="Invalid feedback type. Must be 'like', 'dislike', or 'skip'"
            )
        
        # Process feedback
        matching_service.process_feedback(
            db,
            session_id,
            request.user_id,
            request.movie_id,
            request.feedback_type,
            request.time_spent_ms
        )
        
        return FeedbackResponse(
            success=True,
            message="Feedback processed successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions/{session_id}/stats")
def get_session_stats(
    session_id: str,
    db: Session = Depends(get_db)
):
    """Get session statistics."""
    try:
        
        # Get session
        session = db.query(MatchingSession).filter(MatchingSession.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get feedback stats
        feedback_stats = db.query(UserFeedback).filter(
            UserFeedback.session_id == session_id
        ).all()
        
        user1_stats = {'likes': 0, 'dislikes': 0, 'skips': 0}
        user2_stats = {'likes': 0, 'dislikes': 0, 'skips': 0}
        
        for feedback in feedback_stats:
            user_stats = user1_stats if feedback.user_id == session.user1_id else user2_stats
            if feedback.feedback_type == 'like':
                user_stats['likes'] += 1
            elif feedback.feedback_type == 'dislike':
                user_stats['dislikes'] += 1
            else:
                user_stats['skips'] += 1
        
        return {
            'session_id': session_id,
            'session_stage': session.session_stage,
            'total_interactions': session.total_interactions,
            'mutual_likes': session.mutual_likes,
            'user1_stats': user1_stats,
            'user2_stats': user2_stats,
            'created_at': session.created_at.isoformat(),
            'updated_at': session.updated_at.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/preferences")
def get_user_preferences(
    user_id: str,
    db: Session = Depends(get_db)
):
    """Get user preferences."""
    try:
        preferences = matching_service._get_user_preferences(db, user_id)
        
        # Convert numpy array to list for JSON serialization
        if preferences['embedding_vector'] is not None:
            preferences['embedding_vector'] = preferences['embedding_vector'].tolist()
        
        return preferences
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 