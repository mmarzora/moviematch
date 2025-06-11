import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Movie } from '../services/movieService';
import { sessionService, Session } from '../services/sessionService';
import { 
  matchingService, 
  RecommendationsResponse, 
  UserPreferences 
} from '../services/matchingService';
import { movieService } from '../services/movieService';
import UserHistory from './UserHistory';
import PreferencesComparison from './PreferencesComparison';
import SemanticPreferencesComparison from './SemanticPreferencesComparison';
import RecommendationExplanation from './RecommendationExplanation';
import './SmartMovieMatching.css';

interface SmartMovieMatchingProps {
  session: Session;
  memberId: string;
}

const SmartMovieMatching: React.FC<SmartMovieMatchingProps> = ({ session, memberId }) => {
  // Refs for state management
  const mountedRef = useRef(true);
  const swipeStartTimeRef = useRef<number>(0);
  
  // States
  const [currentMovie, setCurrentMovie] = useState<Movie | null>(null);
  const [movieQueue, setMovieQueue] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [matchFound, setMatchFound] = useState<Movie | null>(null);
  const [isPosterLoading, setIsPosterLoading] = useState(true);
  const [isProcessingSwipe, setIsProcessingSwipe] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showSemanticAnalysis, setShowSemanticAnalysis] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [loadingMatchedMovie, setLoadingMatchedMovie] = useState(false);
  
  // Algorithm-specific states
  const [matchingSessionId, setMatchingSessionId] = useState<string | null>(null);
  const [algorithmState, setAlgorithmState] = useState<RecommendationsResponse | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [algorithmEnabled, setAlgorithmEnabled] = useState(false);
  const [isInitializingSession, setIsInitializingSession] = useState(false);

  // Lock to prevent multiple matching session creations per session
  const creationInProgressRef = useRef<{ [sessionId: string]: boolean }>({});

  const otherMemberId = useMemo(() => 
    session.members.find(id => id !== memberId),
    [session.members, memberId]
  );

  // Add a ref to track previous render state to reduce logging
  const prevRenderStateRef = useRef<string>('');

  // Reset mounted ref
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

  // Initialize matching session when both users are present
  useEffect(() => {
    const initializeMatchingSession = async () => {
      // Debounce: If Firestore already has a matchingSessionId, do not create a new one
      if (session.matchingSessionId) {
        // If our local state is not set, sync it
        if (!matchingSessionId) {
          setMatchingSessionId(session.matchingSessionId);
          setAlgorithmEnabled(true);
        }
        return;
      }
      // Only proceed if we have both users and no session yet
      if (!otherMemberId || isInitializingSession) {
        return;
      }

      console.log('[SessionInit] Checking session state:', {
        otherMemberId: !!otherMemberId,
        sessionMatchingId: session.matchingSessionId,
        localMatchingId: matchingSessionId,
        members: session.members.length
      });

      // If the session already has a matching session ID, use it
      if (session.matchingSessionId && !matchingSessionId) {
        console.log('[SessionInit] Using existing matching session from Firebase:', session.matchingSessionId);
        setMatchingSessionId(session.matchingSessionId);
        setAlgorithmEnabled(true);
        return;
      }

      // If we already have a local matching session ID, we're done
      if (matchingSessionId) {
        return;
      }

      // Ensure both users are in the Firebase session
      if (!session.members.includes(memberId) || !session.members.includes(otherMemberId)) {
        console.log('[SessionInit] Waiting for both users to be in Firebase session');
        return;
      }

      // Only the leader (smallest user ID) should create the matching session
      const [leaderId, followerId] = [memberId, otherMemberId].sort();
      if (memberId !== leaderId) {
        // Not the leader, just wait for Firestore to update
        return;
      }

      // Prevent multiple creations for the same session
      if (creationInProgressRef.current[session.id]) {
        // Already creating a session for this session.id
        return;
      }
      creationInProgressRef.current[session.id] = true;

      setIsInitializingSession(true);

      try {
        console.log('[SessionInit] (Leader) Creating new matching session for:', memberId, 'and', otherMemberId);
        const response = await matchingService.createSession(memberId, otherMemberId);
        const newMatchingSessionId = response.session_id;
        console.log('[SessionInit] Created matching session:', newMatchingSessionId);
        
        // Try to set it in Firebase atomically
        await sessionService.setMatchingSessionIdIfAbsent(session.id, newMatchingSessionId);
        
        // The session update listener will pick up the change and set our local state
        // Don't set local state here to avoid race conditions
        
      } catch (error: any) {
        console.warn('[SessionInit] Algorithm not available, falling back to random movies:', error.message);
        if (mountedRef.current) {
          setAlgorithmEnabled(false);
          setLoading(false);
        }
      } finally {
        if (mountedRef.current) {
          setIsInitializingSession(false);
        }
      }
    };

    initializeMatchingSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, otherMemberId, session.matchingSessionId, matchingSessionId, isInitializingSession, session.members, session.id]);

  // Listen for changes to the Firebase session (including matchingSessionId)
  useEffect(() => {
    if (session.matchingSessionId && session.matchingSessionId !== matchingSessionId) {
      console.log('[SessionInit] Syncing matching session ID from Firebase:', session.matchingSessionId);
      setMatchingSessionId(session.matchingSessionId);
      setAlgorithmEnabled(true);
    }
  }, [session.matchingSessionId, matchingSessionId]);

  // Timeout fallback - if still loading after 15 seconds, fall back to random movies
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        if (mountedRef.current && loading) {
          console.log('[SessionInit] Loading timeout reached, falling back to random movies');
          setAlgorithmEnabled(false);
          setLoading(false);
          setError('Algorithm unavailable - using random movie selection');
        }
      }, 15000);

      return () => clearTimeout(timeout);
    }
  }, [loading, algorithmEnabled]);

  // Load initial recommendations - Memoized to reduce re-renders
  const loadRecommendations = useCallback(async () => {
    if (!matchingSessionId) return;

    try {
      setLoading(true);
      const recommendations = await matchingService.getRecommendations(matchingSessionId, 10, memberId);
      
      if (mountedRef.current) {
        setAlgorithmState(recommendations);
        setMovieQueue(recommendations.movies);
        // Only set currentMovie if it is null and there are movies
        if (currentMovie === null && recommendations.movies.length > 0) {
          console.log('[setCurrentMovie] Setting to first movie from recommendations:', recommendations.movies[0]);
          setCurrentMovie(recommendations.movies[0]);
        }
      }
    } catch (error: any) {
      console.error('Failed to load recommendations:', error);
      setError('Failed to load personalized recommendations');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [matchingSessionId, currentMovie, memberId]);

  // Load recommendations when session is ready
  useEffect(() => {
    if (matchingSessionId && algorithmEnabled) {
      loadRecommendations();
    }
  }, [matchingSessionId, algorithmEnabled, loadRecommendations]);

  // Load session stats periodically - Optimized for stability
  useEffect(() => {
    if (!matchingSessionId) return;

    const loadStats = async () => {
      try {
        const prefs = await matchingService.getUserPreferences(memberId);
        
        if (mountedRef.current) {
          setUserPreferences(prevPrefs => {
            if (JSON.stringify(prevPrefs) !== JSON.stringify(prefs)) {
              return prefs;
            }
            return prevPrefs;
          });
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error);
      }
    };

    loadStats();
    // Increased interval to reduce frequent updates
    const interval = setInterval(loadStats, 30000); // Update every 30 seconds instead of 10
    return () => clearInterval(interval);
  }, [matchingSessionId, memberId]);

  // Handle movie swipe with algorithm feedback
  const handleSwipe = useCallback(async (movieId: number, liked: boolean) => {
    if (isProcessingSwipe || !currentMovie) return;

    setIsProcessingSwipe(true);
    const timeSpent = Date.now() - swipeStartTimeRef.current;

    try {
      // Submit to Firebase first
      await sessionService.updateMovieSwipe(session.id, memberId, movieId, liked);

      // Submit to algorithm if enabled
      if (matchingSessionId && algorithmEnabled) {
        const feedbackType = liked ? 'like' : 'dislike';
        try {
          await matchingService.submitFeedback(matchingSessionId, {
            user_id: memberId,
            movie_id: movieId,
            feedback_type: feedbackType,
            time_spent_ms: timeSpent
          });
        } catch (algorithmError) {
          console.error('[Algorithm] Failed to submit feedback:', algorithmError);
          // Don't throw here - let Firebase save continue even if algorithm fails
        }

        // Load fresh recommendations after feedback
        setTimeout(() => {
          loadRecommendations();
        }, 1000);
      }

      // Move to next movie
      const currentIndex = movieQueue.findIndex(m => m.id === movieId);
      const nextIndex = currentIndex + 1;
      
      if (nextIndex < movieQueue.length) {
        setCurrentMovie(movieQueue[nextIndex]);
      } else {
        setCurrentMovie(null);
        await loadRecommendations();
      }

    } catch (error: any) {
      console.error('Error processing swipe:', error);
      setError('Failed to process swipe');
    } finally {
      setIsProcessingSwipe(false);
    }
  }, [
    isProcessingSwipe, 
    currentMovie, 
    session.id,
    memberId, 
    matchingSessionId, 
    algorithmEnabled,
    movieQueue,
    loadRecommendations
  ]);

  // Handle like button
  const handleLike = useCallback(() => {
    if (currentMovie) {
      handleSwipe(currentMovie.id, true);
    }
  }, [currentMovie, handleSwipe]);

  // Handle dislike button
  const handleDislike = useCallback(() => {
    if (currentMovie) {
      handleSwipe(currentMovie.id, false);
    }
  }, [currentMovie, handleSwipe]);

  // Track time spent viewing each movie
  useEffect(() => {
    if (currentMovie) {
      swipeStartTimeRef.current = Date.now();
    }
  }, [currentMovie]);

  // Check for matches in Firebase - Optimized to reduce re-renders
  const checkForMatches = useCallback(async () => {
    if (!session.matches || session.matches.length === 0) {
      // Only log once when there are no matches, not repeatedly
      return;
    }

    const latestMatchId = session.matches[session.matches.length - 1];
    
    // Check if this user liked the matched movie
    const userHistory = session.userHistory[memberId] || [];
    const userLikedMatch = userHistory.some(h => h.movieId === latestMatchId && h.decision);
    
    // Check if the other user also liked the matched movie
    const otherUserHistory = otherMemberId ? (session.userHistory[otherMemberId] || []) : [];
    const otherUserLikedMatch = otherUserHistory.some(h => h.movieId === latestMatchId && h.decision);
    
    // Only show match modal if:
    // 1. This user liked the movie
    // 2. The other user also liked the movie (mutual like)
    // 3. We haven't already shown this match
    if (userLikedMatch && otherUserLikedMatch && (!matchFound || matchFound.id !== latestMatchId)) {
      console.log('🎉 Match detected!', { 
        movieId: latestMatchId, 
        userLiked: userLikedMatch, 
        otherUserLiked: otherUserLikedMatch,
        memberId,
        otherMemberId 
      });
      
      setLoadingMatchedMovie(true);
      
      try {
        // First try to find the movie in our current queue
        let matchedMovie = movieQueue.find(m => m.id === latestMatchId);
        
        // If not found in queue, try to fetch from algorithm recommendations if available
        if (!matchedMovie && matchingSessionId) {
          try {
            const recommendations = await matchingService.getRecommendations(matchingSessionId, 50, memberId);
            matchedMovie = recommendations.movies.find(m => m.id === latestMatchId);
          } catch (error) {
            console.warn('Could not fetch from algorithm:', error);
          }
        }
        
        // If still not found, use current movie as fallback (shouldn't happen often)
        if (!matchedMovie && currentMovie?.id === latestMatchId) {
          matchedMovie = currentMovie;
        }
        
        // Final fallback: fetch movie details directly from the movie service
        if (!matchedMovie) {
          try {
            console.log('🔍 Fetching movie details from movie service for ID:', latestMatchId);
            const movieFromService = await movieService.getMovieDetails(latestMatchId);
            if (movieFromService) {
              matchedMovie = movieFromService;
            }
          } catch (error) {
            console.warn('Could not fetch movie details from movie service:', error);
          }
        }
        
        if (matchedMovie) {
          console.log('📽️ Showing match modal for movie:', matchedMovie.title);
          console.log('📽️ Movie data:', {
            title: matchedMovie.title,
            poster_url: matchedMovie.poster_url,
            description: matchedMovie.description,
            genres: matchedMovie.genres,
            release_year: matchedMovie.release_year
          });
          setMatchFound(matchedMovie);
        } else {
          console.warn('⚠️ Could not find movie data for match:', latestMatchId);
        }
      } catch (error) {
        console.error('Error retrieving matched movie:', error);
      } finally {
        setLoadingMatchedMovie(false);
      }
    }
  }, [session.matches, session.userHistory, memberId, otherMemberId, matchFound, matchingSessionId, movieQueue, currentMovie]);

  useEffect(() => {
    checkForMatches();
  }, [checkForMatches]);

  // Only log renders when state actually changes
  const currentRenderState = JSON.stringify({
    currentMovie: currentMovie?.title,
    algorithmEnabled,
    matchingSessionId,
    sessionMatches: session.matches?.length || 0,
    userHistoryLength: (session.userHistory[memberId] || []).length
  });

  if (prevRenderStateRef.current !== currentRenderState) {
    console.log('🎬 Rendering SmartMovieMatching with:', { 
      currentMovie: currentMovie?.title, 
      algorithmEnabled, 
      matchingSessionId,
      sessionMatches: session.matches?.length || 0,
      userHistoryLength: (session.userHistory[memberId] || []).length
    });
    prevRenderStateRef.current = currentRenderState;
  }

  if (loading) {
    return (
      <div className="movie-matching">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading personalized recommendations...</p>
          {algorithmEnabled && (
            <small>Powered by MovieMatch Algorithm</small>
          )}
          {/* Debug info */}
          <div style={{ marginTop: '20px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
            Debug: Session ID: {session.id}, Member ID: {memberId}, Other Member: {otherMemberId || 'waiting...'}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="movie-matching">
        <div className="error-container">
          <p className="error-message">{error}</p>
          <button onClick={loadRecommendations} className="retry-button">
            Try Again
          </button>
          {/* Debug info */}
          <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#6c757d' }}>
            Debug: Algorithm enabled: {algorithmEnabled ? 'Yes' : 'No'}, Session: {matchingSessionId || 'None'}
          </div>
        </div>
      </div>
    );
  }

  if (!currentMovie) {
    return (
      <div className="movie-matching">
        <div className="no-movies-container">
          <p>No more movies available</p>
          <button onClick={loadRecommendations} className="retry-button">
            Load More
          </button>
          {/* Debug info */}
          <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#6c757d' }}>
            Debug: Queue length: {movieQueue.length}, Algorithm: {algorithmEnabled ? 'enabled' : 'disabled'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="movie-matching">
      {/* Algorithm Status Bar */}
      {algorithmEnabled && algorithmState && (
        <div className="algorithm-status">
          <div className="status-info">
            <span className={`stage-badge stage-${algorithmState.session_stage}`}>
              {algorithmState.session_stage.toUpperCase()}
            </span>
            <span className="interactions">
              {algorithmState.total_interactions} interactions
            </span>
            {algorithmState.mutual_likes > 0 && (
              <span className="mutual-likes">
                🎯 {algorithmState.mutual_likes} mutual likes
              </span>
            )}
          </div>
          {userPreferences && userPreferences.confidence_score > 0 && (
            <div className="confidence-score">
              Confidence: {(userPreferences.confidence_score * 100).toFixed(0)}%
            </div>
          )}
        </div>
      )}

      {/* Preferences Comparison */}
      {algorithmEnabled && matchingSessionId && otherMemberId && showPreferences && (
        <PreferencesComparison
          user1Id={memberId}
          user2Id={otherMemberId}
          user1Name="You"
          user2Name="Partner"
          matchingSessionId={matchingSessionId}
        />
      )}

      {/* Semantic Preferences Analysis */}
      {algorithmEnabled && matchingSessionId && otherMemberId && showSemanticAnalysis && (
        <SemanticPreferencesComparison
          user1Id={memberId}
          user2Id={otherMemberId}
          user1Name="You"
          user2Name="Partner"
        />
      )}

      {/* Movie Card */}
      <div className="movie-card">
        {isPosterLoading && (
          <div className="poster-loading">
            <div className="loading-spinner"></div>
          </div>
        )}
        
        <img
          src={currentMovie.poster_url || '/placeholder-poster.jpg'}
          alt={`${currentMovie.title} poster`}
          className="movie-poster"
          onLoad={() => setIsPosterLoading(false)}
          onError={() => setIsPosterLoading(false)}
          style={{ display: isPosterLoading ? 'none' : 'block' }}
        />
        
        {/* Why Button - Top Right Corner */}
        {algorithmEnabled && matchingSessionId && otherMemberId && (
          <button
            className="why-button"
            onClick={() => setShowExplanation(true)}
            title="Why was this movie recommended?"
          >
            🤔 Why?
          </button>
        )}
        
        <div className="movie-info">
          <h2 className="movie-title">{currentMovie.title}</h2>
          <div className="movie-meta">
            <span className="movie-year">{currentMovie.release_year}</span>
            <span className="movie-rating">⭐ {currentMovie.rating}</span>
            {currentMovie.runtime_minutes && (
              <span className="movie-runtime">{currentMovie.runtime_minutes}min</span>
            )}
          </div>
          
          {currentMovie.genres && (
            <div className="movie-genres">
              {(Array.isArray(currentMovie.genres) ? currentMovie.genres : JSON.parse(currentMovie.genres)).map((genre: string) => (
                <span key={genre} className="genre-tag">{genre}</span>
              ))}
            </div>
          )}
          
          {currentMovie.description && (
            <p className="movie-description">{currentMovie.description}</p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button
          className="dislike-button"
          onClick={handleDislike}
          disabled={isProcessingSwipe}
        >
          👎 Pass
        </button>
        
        <button
          className="like-button"
          onClick={handleLike}
          disabled={isProcessingSwipe}
        >
          👍 Like
        </button>
      </div>

      {/* Toggle Buttons */}
      <div className="toggle-buttons">
        {algorithmEnabled && otherMemberId && (
          <button
            className="preferences-toggle"
            onClick={() => setShowPreferences(!showPreferences)}
          >
            {showPreferences ? 'Hide Preferences' : 'Show Taste Profiles'}
          </button>
        )}
        
        {algorithmEnabled && otherMemberId && (
          <button
            className="semantic-analysis-toggle"
            onClick={() => setShowSemanticAnalysis(!showSemanticAnalysis)}
          >
            {showSemanticAnalysis ? 'Hide Deep Analysis' : 'Show Deep Analysis'}
          </button>
        )}
        
        <button
          className="history-toggle"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? 'Hide History' : 'Show History'}
        </button>
      </div>

      {/* User History */}
      {showHistory && (
        <UserHistory
          history={session.userHistory[memberId] || []}
          movies={{}} // Empty for now, would need to load movie details
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Match Found Modal */}
      {matchFound && (
        <div className="match-modal-overlay" onClick={() => setMatchFound(null)}>
          <div className="match-modal" onClick={e => e.stopPropagation()}>
            {/* 1. Celebration message */}
            <div className="match-celebration">
              <div className="celebration-text">🎉 IT'S A MATCH! 🎉</div>
              <div className="celebration-subtitle">You both loved this movie!</div>
            </div>

            {/* 2. Movie card (vertical layout) */}
            <div className="matched-movie-card vertical">
              <div className="matched-poster-container">
                <img
                  src={matchFound.poster_url || '/placeholder-poster.jpg'}
                  alt={`${matchFound.title} poster`}
                  className="matched-poster"
                  onError={(e) => {
                    console.log('🖼️ Poster failed to load:', matchFound.poster_url);
                    (e.target as HTMLImageElement).src = '/placeholder-poster.jpg';
                  }}
                  onLoad={() => {
                    console.log('🖼️ Poster loaded successfully:', matchFound.poster_url);
                  }}
                />
              </div>
              <div className="matched-movie-details">
                <h3 className="matched-title">{matchFound.title || 'Unknown Title'}</h3>
                <div className="matched-meta">
                  {matchFound.release_year && (
                    <span className="matched-year">{matchFound.release_year}</span>
                  )}
                  {matchFound.rating && (
                    <span className="matched-rating">⭐ {matchFound.rating}</span>
                  )}
                  {matchFound.runtime_minutes && (
                    <span className="matched-runtime">{matchFound.runtime_minutes}min</span>
                  )}
                </div>
                {matchFound.genres && (
                  <div className="matched-genres">
                    {(Array.isArray(matchFound.genres) 
                      ? matchFound.genres 
                      : JSON.parse(matchFound.genres || '[]')).slice(0, 3).map((genre: string) => (
                      <span key={genre} className="matched-genre-tag">{genre}</span>
                    ))}
                  </div>
                )}
                {matchFound.description && (
                  <p className="matched-description">
                    {matchFound.description.length > 150 
                      ? `${matchFound.description.substring(0, 150)}...` 
                      : matchFound.description}
                  </p>
                )}
              </div>
            </div>

            {/* 3. Continue Swiping button */}
            <div className="match-actions">
              <button 
                className="close-match-button"
                onClick={() => setMatchFound(null)}
              >
                Continue Swiping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Match Modal */}
      {loadingMatchedMovie && (
        <div className="match-modal-overlay">
          <div className="match-modal loading-match">
            <div className="loading-spinner"></div>
            <p>Loading match details...</p>
          </div>
        </div>
      )}
      
      {isProcessingSwipe && (
        <div className="processing-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}

      {/* Recommendation Explanation Modal */}
      {showExplanation && currentMovie && algorithmEnabled && matchingSessionId && otherMemberId && (
        <RecommendationExplanation
          sessionId={matchingSessionId}
          movieId={currentMovie.id}
          user1Id={memberId}
          user2Id={otherMemberId}
          user1Name="You"
          user2Name="Partner"
          onClose={() => setShowExplanation(false)}
        />
      )}
    </div>
  );
};

export default SmartMovieMatching;