import sqlite3
import psycopg2
import json
from psycopg2.extras import Json
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env')

# Update these paths and connection strings as needed
SQLITE_DB_PATH = 'backend/src/database/movies.db'
PG_CONN_STR = os.getenv('POSTGRES_DATABASE_URL')

# Connect to SQLite
sqlite_conn = sqlite3.connect(SQLITE_DB_PATH)
sqlite_cur = sqlite_conn.cursor()

# Connect to Supabase/Postgres
pg_conn = psycopg2.connect(PG_CONN_STR)
pg_cur = pg_conn.cursor()

# 1. Migrate actors
sqlite_cur.execute("SELECT id, name, embedding FROM actors")
for row in sqlite_cur.fetchall():
    pg_cur.execute("""
        INSERT INTO actors (id, name, embedding)
        VALUES (%s, %s, %s)
        ON CONFLICT (id) DO NOTHING
    """, row)

# 2. Migrate movies
sqlite_cur.execute("SELECT * FROM movies")
for row in sqlite_cur.fetchall():
    pg_cur.execute("""
        INSERT INTO movies (id, title, description, release_year, poster_url, genres, runtime_minutes, rating, embedding, watchmode_id, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
    """, (
        row[0], row[1], row[2], row[3], row[4],
        Json(json.loads(row[5])) if row[5] else None,
        row[6], row[7], row[8], row[9], row[10], row[11]
    ))

# Commit and close
pg_conn.commit()
pg_cur.close()
pg_conn.close()
sqlite_cur.close()
sqlite_conn.close()