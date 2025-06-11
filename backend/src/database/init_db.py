import sqlite3
from pathlib import Path

# Get the absolute path to the database file
DB_PATH = Path(__file__).parent / 'movies.db'

def init_db():
    """Initialize the database with the required schema."""
    print(f"Initializing database at {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute('PRAGMA journal_mode = WAL')
    
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            release_year INTEGER,
            poster_url TEXT,
            genres TEXT,  -- Stored as JSON array
            runtime_minutes INTEGER,
            rating REAL,  -- e.g., IMDB rating
            embedding BLOB,  -- Store as binary
            watchmode_id TEXT,  -- to track source API ID
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);
        CREATE INDEX IF NOT EXISTS idx_movies_release_year ON movies(release_year);
    ''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully")

if __name__ == "__main__":
    init_db() 