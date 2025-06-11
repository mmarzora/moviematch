import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Movie, movieService } from '../services/movieService';
import { sessionService, Session } from '../services/sessionService';
import UserHistory from './UserHistory';
import './MovieMatching.css';

// Extend the Movie interface for additional fields we need
interface ExtendedMovie extends Movie {
  overview?: string;  // Alias for description
  critic_score?: number;  // Optional critic score
  similarity?: number;
  poster?: string;  // For backward compatibility
  year?: number;    // For backward compatibility
}

interface MovieMatchingProps {
  session: Session;
  memberId: string;
}

const MovieMatching: React.FC<MovieMatchingProps> = ({ session, memberId }) => {
  // Refs for state management
  const mountedRef = React.useRef(true);
  const processingRef = React.useRef(false);
  const lastFetchRef = React.useRef<number>(0);
  
  // States
  const [currentMovie, setCurrentMovie] = useState<ExtendedMovie | null>(null);
  const [moviesList, setMoviesList] = useState<ExtendedMovie[]>([]);
  const [moviesCache, setMoviesCache] = useState<{ [key: number]: Movie }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [matchFound, setMatchFound] = useState<Movie | null>(null);
  const [processedMatches, setProcessedMatches] = useState<Set<number>>(new Set());
  const [isPosterLoading, setIsPosterLoading] = useState(true);
  const [isProcessingSwipe, setIsProcessingSwipe] = useState(false);

  const otherMemberId = useMemo(() => 
    session.members.find(id => id !== memberId),
    [session.members, memberId]
  );

  // Reset mounted ref on every render
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Clear error state after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          setError(null);
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Update cache with new movie
  const updateMovieCache = useCallback((movie: Movie) => {
    if (mountedRef.current) {
      setMoviesCache(prev => ({
        ...prev,
        [movie.id]: movie
      }));
    }
  }, []);

  const fetchMoviesList = useCallback(async () => {
    const fetchId = Date.now();
    lastFetchRef.current = fetchId;

    try {
      // Get all viewed movies from session history
      const viewedMovies = new Set(session.viewedMovies || []);
      const userHistory = session.userHistory[memberId] || [];
      userHistory.forEach(h => viewedMovies.add(h.movieId));

      // Fetch more movies than we need to account for filtering
      const response = await movieService.getRandomMovies({
        year_start: 2020,
        limit: 50,  // Increased limit to ensure we have enough after filtering
        minRating: 6.0
      });

      // Always update state if we have a valid response and this is the latest fetch
      // Don't check mountedRef.current here since component might have remounted
      if (lastFetchRef.current === fetchId && response.length > 0) {
        // Filter out viewed movies and duplicates
        const newMovies = response.filter(movie => !viewedMovies.has(movie.id));

        // Update moviesList state with new movies
        setMoviesList(prevList => {
          const updatedList = [...prevList, ...newMovies];
          return updatedList;
        });

        // Update cache
        response.forEach(movie => updateMovieCache(movie));
      }
      
      return response;
    } catch (error) {
      console.error('Error fetching movies:', error);
      return [];
    }
  }, [session.viewedMovies, session.userHistory, memberId, updateMovieCache]);

  const getNextUnwatchedMovie = useCallback(async (movies: Movie[], excludeMovieId?: number): Promise<Movie | null> => {
    // Get all viewed movies from session
    const viewedMovies = new Set(session.viewedMovies || []);
    const userHistory = session.userHistory[memberId] || [];
    userHistory.forEach(h => viewedMovies.add(h.movieId));

    // Also exclude the current movie being swiped
    if (excludeMovieId) {
      viewedMovies.add(excludeMovieId);
    }

    // Find first unwatched movie
    const nextMovie = movies.find(movie => {
      const isUnwatched = !viewedMovies.has(movie.id);
      return isUnwatched;
    });
    
    if (!nextMovie && movies.length > 0) {
      // If no unwatched movie found but we have movies, fetch more
      const newMovies = await fetchMoviesList();
      const foundMovie = newMovies.find(movie => !viewedMovies.has(movie.id));
      return foundMovie || null;
    }
    
    return nextMovie || null;
  }, [memberId, session.viewedMovies, session.userHistory, fetchMoviesList]);

  // Effect to detect matches from session updates
  useEffect(() => {
    const checkForNewMatches = async () => {
      if (!otherMemberId || !session.matches) return;

      // Check all unprocessed matches
      const newMatches = session.matches.filter(matchId => !processedMatches.has(matchId));
      
      // Convert to array for iteration
      for (const matchId of Array.from(newMatches)) {
        // Check if this match involves the current user's previous like
        const userHistory = session.userHistory[memberId] || [];
        const otherUserHistory = session.userHistory[otherMemberId] || [];
        
        const userLiked = userHistory.some(h => h.movieId === matchId && h.decision);
        const otherUserLiked = otherUserHistory.some(h => h.movieId === matchId && h.decision);

        if (userLiked && otherUserLiked) {
          // Load movie details if not in cache
          let matchedMovie = moviesCache[matchId];
          if (!matchedMovie) {
            try {
              const movie = await movieService.getMovieDetails(matchId);
              if (movie && mountedRef.current) {
                updateMovieCache(movie);
                matchedMovie = movie;
              }
            } catch (error) {
              console.error('Failed to load match movie details:', error);
              continue;
            }
          }

          if (matchedMovie && mountedRef.current) {
            setMatchFound(matchedMovie);
            setProcessedMatches(prev => new Set([...prev, matchId]));
            break; // Show one match at a time
          }
        }
      }
    };

    checkForNewMatches();
  }, [session.matches, session.userHistory, memberId, otherMemberId, moviesCache, updateMovieCache, processedMatches]);

  const getNextMovie = useCallback(async (excludeMovieId?: number): Promise<ExtendedMovie | null> => {
    try {
      // First try to get from current list, excluding the current movie
      let nextMovie = await getNextUnwatchedMovie(moviesList, excludeMovieId);
      
      // If no unwatched movies in current list, fetch new ones
      if (!nextMovie) {
        const fetchStartTime = Date.now();
        const newMovies = await fetchMoviesList();
        
        // Only use the new movies if no other fetch has happened
        if (mountedRef.current && lastFetchRef.current === fetchStartTime && newMovies.length > 0) {
          nextMovie = await getNextUnwatchedMovie(newMovies, excludeMovieId);
        }
      }

      // Preload the poster if available
      if (nextMovie?.poster_url) {
        const img = new Image();
        img.src = nextMovie.poster_url;
      }

      return nextMovie;
    } catch (error) {
      console.error('Error getting next movie:', error);
      return null;
    }
  }, [moviesList, getNextUnwatchedMovie, fetchMoviesList]);

  const handlePosterLoad = useCallback(() => {
    if (mountedRef.current) {
      setIsPosterLoading(false);
    }
  }, []);

  const handlePosterError = useCallback(() => {
    if (mountedRef.current) {
      setIsPosterLoading(false);
    }
  }, []);

  const handleSwipe = useCallback(async (liked: boolean) => {
    if (processingRef.current || !currentMovie) {
      return;
    }

    try {
      processingRef.current = true;
      if (mountedRef.current) {
        setIsProcessingSwipe(true);
        setIsPosterLoading(true);
        setError(null); // Clear any previous errors
      }

      const currentMovieId = currentMovie.id;
      
      // First, get the next movie before updating Firebase
      const nextMovie = await getNextMovie(currentMovieId);
      
      // Then update Firebase
      await sessionService.updateMovieSwipe(session.id, memberId, currentMovieId, liked);

      // Finally, update the UI if component is still mounted
      if (mountedRef.current) {
        if (nextMovie) {
          setCurrentMovie(nextMovie);
          // Remove swiped movie from list to prevent showing it again
          setMoviesList(prev => prev.filter(m => m.id !== currentMovieId));
        } else {
          setError('No more movies available.');
        }
      }
    } catch (err: any) {
      if (mountedRef.current) {
        console.error('Error processing swipe:', err);
        setError(`Failed to process your choice: ${err.message}`);
      }
    } finally {
      if (mountedRef.current) {
        processingRef.current = false;
        setIsProcessingSwipe(false);
      }
    }
  }, [currentMovie, session.id, memberId, getNextMovie]);

  const handleButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>, liked: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Store current scroll position
    const currentScrollY = window.scrollY;
    
    // Handle the swipe
    handleSwipe(liked);
    
    // Restore scroll position immediately
    window.scrollTo(0, currentScrollY);
  }, [handleSwipe]);

  // Initial movie load
  useEffect(() => {
    let isMounted = true;
    const initializeMovies = async () => {
      try {
        if (isMounted) {
          setLoading(true);
          setError(null);
        }

        const response = await fetchMoviesList();
        
        if (isMounted) {
          if (!response || response.length === 0) {
            setError('No movies available. Please try again.');
          }
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error initializing movies:', error);
          setError('Failed to load movies. Please try refreshing.');
          setLoading(false);
        }
      }
    };

    initializeMovies();
    return () => {
      isMounted = false;
    };
  }, [fetchMoviesList]);

  // Set the first unwatched movie when moviesList changes and currentMovie is null
  useEffect(() => {
    const initializeCurrentMovie = async () => {
      if (!loading && !currentMovie && moviesList.length > 0) {
        const firstMovie = await getNextMovie();
        if (mountedRef.current) {
          if (firstMovie) {
            setCurrentMovie(firstMovie);
            setError(null);
          } else {
            setError('No unwatched movies available.');
          }
        }
      } else if (!loading && !currentMovie && moviesList.length === 0) {
        setError('No movies available.');
      }
    };

    initializeCurrentMovie();
  }, [moviesList, loading, currentMovie, getNextMovie]);

  // Loading and error states
  if (loading) {
    return (
      <div className="movie-loading">
        <div className="loading-spinner"></div>
        <p>Loading movies...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="movie-error">
        <p>{error}</p>
        <button 
          onClick={() => {
            setLoading(true);
            setError(null);
            fetchMoviesList().then(() => setLoading(false));
          }}
          className="retry-button"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!currentMovie) {
    return (
      <div className="movie-error">
        <p>No movies available.</p>
        <button 
          onClick={() => {
            setLoading(true);
            setError(null);
            fetchMoviesList().then(() => setLoading(false));
          }}
          className="retry-button"
        >
          Refresh Movies
        </button>
      </div>
    );
  }

  return (
    <div className="movie-matching">
      <div className="session-info">
        <div className="member-info">
          <p className="member-id">Your ID: <span className="id">{memberId.slice(0, 8)}...</span></p>
          <p className="session-id">Session: {session.code}</p>
          {otherMemberId && (
            <p className="other-member">
              Paired with: <span className="id">
                {otherMemberId.slice(0, 8)}...
              </span>
            </p>
          )}
          <button 
            className="history-button"
            onClick={() => setShowHistory(true)}
          >
            View History
          </button>
        </div>
      </div>

      {matchFound && (
        <div className="match-overlay">
          <div className="match-content">
            <h2>It's a Match! 🎉</h2>
            <p>You both liked "{matchFound.title}"</p>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMatchFound(null);
                if (currentMovie) {
                  handleSwipe(false); // Move to next movie only if we're stuck on current
                }
              }}
            >
              Continue Swiping
            </button>
          </div>
        </div>
      )}

      <div className="movie-card">
        <div className="movie-poster-container">
          {currentMovie.poster_url ? (
            <>
              <img 
                key={`${currentMovie.id}-${Date.now()}`}
                src={currentMovie.poster_url} 
                alt={currentMovie.title} 
                className={`movie-poster ${isPosterLoading ? 'hidden' : ''}`}
                onLoad={handlePosterLoad}
                onError={handlePosterError}
              />
              {isPosterLoading && (
                <div className="poster-loading">
                  <div className="loading-spinner"></div>
                </div>
              )}
            </>
          ) : (
            <div className="movie-poster-placeholder">
              No poster available
            </div>
          )}
        </div>

        <div className="movie-info">
          <h2>{currentMovie.title}</h2>
          <p className="year">{currentMovie.release_year}</p>
          <p className="rating">Rating: {Math.round(currentMovie.rating * 10)}%</p>
          <p className="overview">{currentMovie.description}</p>
        </div>

        <div className="swipe-buttons">
          <button 
            type="button"
            className="swipe-button dislike" 
            onClick={(e) => handleButtonClick(e, false)}
            disabled={isProcessingSwipe}
          >
            👎 Pass
          </button>
          <button 
            type="button"
            className="swipe-button like" 
            onClick={(e) => handleButtonClick(e, true)}
            disabled={isProcessingSwipe}
          >
            👍 Like
          </button>
        </div>
      </div>

      {showHistory && (
        <UserHistory
          history={session.userHistory[memberId] || []}
          movies={moviesCache}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};

export default MovieMatching; 