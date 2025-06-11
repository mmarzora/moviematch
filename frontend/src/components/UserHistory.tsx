import React from 'react';
import { UserSwipeHistory } from '../services/sessionService';
import { Movie } from '../services/movieService';
import './UserHistory.css';

interface UserHistoryProps {
  history: UserSwipeHistory[];
  movies: { [key: number]: Movie };
  onClose: () => void;
}

const UserHistory: React.FC<UserHistoryProps> = ({ history, movies, onClose }) => {
  return (
    <div className="user-history">
      <div className="user-history-header">
        <h2>Your Swipe History</h2>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      <div className="history-list">
        {history.length === 0 ? (
          <p className="no-history">No swipes yet!</p>
        ) : (
          history
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((entry) => {
              const movie = movies[entry.movieId];
              if (!movie) return null;

              return (
                <div key={`${entry.movieId}-${entry.timestamp}`} className="history-item">
                  <div className="movie-poster">
                    {movie.poster_url ? (
                      <img src={movie.poster_url} alt={movie.title} />
                    ) : (
                      <div className="poster-placeholder">No Poster</div>
                    )}
                  </div>
                  <div className="movie-info">
                    <h3>{movie.title}</h3>
                    <p className="year">{movie.release_year}</p>
                    <div className={`decision ${entry.decision ? 'liked' : 'passed'}`}>
                      {entry.decision ? '👍 Liked' : '👎 Passed'}
                    </div>
                    <p className="timestamp">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
};

export default UserHistory; 