# 🎬 MovieMatch: AI-Powered Movie Recommendation System

> **A sophisticated dual-user movie recommendation engine that learns preferences in real-time and finds perfect matches for movie nights.**

![MovieMatch Demo](https://via.placeholder.com/800x400/667eea/ffffff?text=MovieMatch+Demo)

## 🌟 Overview

MovieMatch is an advanced recommendation system that combines cutting-edge machine learning with real-time collaborative filtering to help users discover movies they'll love together. Unlike traditional recommendation systems, MovieMatch is designed for **two users simultaneously**, learning their individual preferences while optimizing for mutual compatibility.

### ✨ Key Features

- 🤖 **Multi-Stage AI Algorithm**: Exploration → Learning → Convergence phases
- 👥 **Dual-User Optimization**: Finds movies both users will enjoy
- 🎯 **Real-Time Learning**: Adapts to user preferences with each swipe
- 📊 **Advanced Analytics**: Embedding analysis and preference visualization
- 🔥 **Live Matching**: Instant notifications when both users like the same movie
- 📱 **Modern UI**: Beautiful, responsive React interface
- ⚡ **High Performance**: FastAPI backend with optimized embeddings

## 🧠 The Algorithm

### Three-Stage Learning Process

#### 🔍 **Stage 1: Exploration (0-10 interactions)**
- **Goal**: Discover user preferences across diverse genres
- **Strategy**: Present variety of movies to map taste landscape
- **Learning**: Build initial preference vectors from user feedback

#### 📚 **Stage 2: Learning (10-30 interactions)**
- **Goal**: Refine understanding and find compatibility zones
- **Strategy**: Balance between exploitation and exploration
- **Learning**: Update embeddings using gradient-based optimization

#### 🎯 **Stage 3: Convergence (30+ interactions)**
- **Goal**: Fine-tune recommendations for maximum satisfaction
- **Strategy**: Focus on high-confidence matches
- **Learning**: Precise preference modeling with anti-overfitting

### 🔬 Technical Implementation

#### Embedding-Based Recommendations
```python
# 384-dimensional vectors using all-MiniLM-L6-v2
movie_embedding = sentence_transformer.encode(
    f"{movie.title} {movie.description} {' '.join(movie.genres)}"
)

# Dual-user scoring (actual implementation)
user1_sim = cosine_similarity(movie_embedding, user1_embedding)
user2_sim = cosine_similarity(movie_embedding, user2_embedding)
combined_score = 0.7 * min(user1_sim, user2_sim) + 0.3 * np.mean([user1_sim, user2_sim])
# Normalize from [-1, 1] to [0, 1]
dual_score = (combined_score + 1) / 2
```

**Why this formula?**
- The score prioritizes the lower of the two users' similarities (to ensure both users are satisfied), but adds a smaller average component to avoid being too conservative.

#### Hybrid Scoring System
- **Content-Based**: Movie embeddings + user preference vectors
- **Compatibility**: Mutual preference optimization

#### Anti-Overfitting Strategies
- **Diversity Injection**: Prevents recommendation bubbles
- **Confidence Thresholding**: Avoids overconfident predictions
- **Exploration Decay**: Gradual shift from exploration to exploitation

## 🚀 Deployment

### Backend (Render + Supabase)
- The FastAPI backend is deployed on [Render](https://render.com/).
- The backend connects to a [Supabase](https://supabase.com/) PostgreSQL database for persistent storage and user/session management.
- All API requests from the frontend are routed to the Render backend URL.

#### Environment Variables (Render Backend)
Set these in your Render dashboard:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase service role or anon key
- `DATABASE_URL`: (If using Supabase Postgres directly)
- Any other secrets required by your backend (e.g., JWT secret, CORS origins)

#### Example Render Build & Start Commands
```
# Build command
pip install -r requirements.txt

# Start command
uvicorn src.api.main:app --host 0.0.0.0 --port 10000
```

### Frontend
- The frontend is configured to use the Render backend URL for all API calls.
- Update your frontend `.env` or `config.ts` to point to the Render backend endpoint (e.g., `https://your-backend.onrender.com`).

## 🏛️ Architecture (updated)

- **Frontend** (React) → **Backend** (FastAPI on Render) → **Database** (Supabase)
- All persistent data (users, sessions, ratings, movies) is stored in Supabase.
- The backend no longer uses SQLite or local DB files.

## 🔧 Configuration (updated)

- Ensure your backend is configured to use Supabase. Example (in `config.py` or as env vars):
  ```python
  SUPABASE_URL = os.getenv('SUPABASE_URL')
  SUPABASE_KEY = os.getenv('SUPABASE_KEY')
  # ...
  ```
- Remove or ignore any references to `movies.db` or local SQLite files.

## 🎮 How to Use

### For Users

1. **Create/Join Session**: Start a new movie matching session
2. **Invite Partner**: Share session code with your movie buddy
3. **Start Swiping**: Rate movies with ❤️ (Like) or ❌ (Pass)
4. **Get Matches**: Celebrate when you both like the same movie! 🎉
5. **View Profiles**: See your evolving taste preferences
6. **Watch Together**: Enjoy your perfectly matched movie

### Session Flow
```
🔄 Create Session → 👥 Join Partner → 🎬 Rate Movies → 💖 Find Matches → 🍿 Watch Together
```

## 📊 Analytics & Insights

### Embedding Visualization

Access the powerful analytics dashboard:

1. **Start the backend server**
2. **Open `embedding_visualizer.html`** in your browser
3. **Explore movie relationships** in 2D/3D space
4. **Analyze clusters** and discover patterns
5. **Find outliers** and unique movies

### Available Analytics

- **📈 Dimension Analysis**: Most important embedding features
- **🎭 Movie Clustering**: Semantic groupings of films
- **📍 Outlier Detection**: Unique movies that don't fit patterns
- **👤 User Profiles**: Individual preference evolution
- **🔗 Compatibility Analysis**: User similarity metrics

### API Endpoints

#### Core Recommendation Engine
```http
POST /api/v1/matching/sessions/create          # Create new session
GET  /api/v1/matching/sessions/{id}/stats      # Session statistics
POST /api/v1/matching/users/{id}/rate          # Submit movie rating
GET  /api/v1/matching/users/{id}/preferences   # User taste profile
```

#### Advanced Analytics
```http
GET /api/embeddings/analyze/dimensions         # Embedding dimension analysis
GET /api/embeddings/analyze/clusters           # Movie clustering
GET /api/embeddings/analyze/outliers           # Unusual movies
GET /api/embeddings/visualization/data         # Data for visualizations
```

## 🔧 Configuration

### Algorithm Parameters
```python
EXPLORATION_THRESHOLD = 10      # Interactions before learning phase
LEARNING_THRESHOLD = 30         # Interactions before convergence
DIVERSITY_FACTOR = 0.3          # Exploration vs exploitation balance
COMPATIBILITY_WEIGHT = 0.4      # Dual-user optimization strength
```

### Performance Tuning
```python
EMBEDDING_BATCH_SIZE = 32       # Batch processing for embeddings
CACHE_SIZE = 1000              # Movie recommendation cache
POLLING_INTERVAL = 30          # Real-time update frequency (seconds)
```

## 🎯 Advanced Features

### 🔮 Smart Recommendation Engine

- **Genre Balancing**: Prevents over-recommendation of single genres

### 🚀 Real-Time Features

- **Live Session Sync**: Instant updates across devices
- **Match Celebrations**: Animated notifications for mutual likes
- **Progress Tracking**: Algorithm confidence and learning progress
- **Session History**: Previous matches and session statistics

### 📱 User Experience

- **Swipe Interface**: Tinder-like movie browsing
- **Smart Loading**: Preload next movies for smooth experience
- **Preference Visualization**: See your taste profile evolve
- **Match History**: Track all your successful movie matches

## 🙏 Acknowledgments

- **Sentence Transformers**: For powerful embedding models
- **FastAPI**: For the blazing-fast backend framework
- **React**: For the beautiful user interface
- **Firebase**: For real-time synchronization
- **scikit-learn**: For machine learning tools

## 🐛 Troubleshooting (updated)

### Common Issues

**Backend not connecting to database?**
- Double-check your Supabase credentials and Render environment variables.
- Ensure your Supabase database is running and accessible from Render.

**Backend not starting?**
```bash
# Check if running from correct directory
cd backend
python -m src.api.main
```

---

**Made with ❤️ for movie lovers everywhere** 🍿🎬✨ 