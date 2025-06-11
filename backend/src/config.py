"""
Configuration management for the MovieMatch backend.
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings

# Base directory of the backend package
BASE_DIR = Path(__file__).parent

# Database directory
DB_DIR = BASE_DIR / "database"
DB_DIR.mkdir(parents=True, exist_ok=True)  # Ensure directory exists
DB_PATH = DB_DIR / "movies.db"

class Settings(BaseSettings):
    """Application settings."""
    
    # API Settings
    API_V1_PREFIX: str = "/api"
    PROJECT_NAME: str = "MovieMatch"
    DEBUG: bool = True
    
    # CORS Settings
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    
    # Database Settings
    DATABASE_URL: str = f"sqlite:///{DB_PATH}"
    
    # Model Settings
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    
    # Legacy WatchMode Settings (optional)
    WATCHMODE_API_KEY: str | None = None
    REACT_APP_WATCHMODE_API_KEY: str | None = None
    REACT_APP_USE_MOCK_DATA: bool | None = None
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"  # Allow extra fields in case we have other env vars

# Global settings instance
settings = Settings() 