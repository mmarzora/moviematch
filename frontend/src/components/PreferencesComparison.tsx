import React, { useEffect, useState } from 'react';
import { matchingService, UserPreferences } from '../services/matchingService';
import './PreferencesComparison.css';

interface PreferencesComparisonProps {
  user1Id: string;
  user2Id: string;
  user1Name?: string;
  user2Name?: string;
  matchingSessionId: string;
}

const PreferencesComparison: React.FC<PreferencesComparisonProps> = ({ 
  user1Id, 
  user2Id, 
  user1Name = "User 1", 
  user2Name = "User 2",
  matchingSessionId 
}) => {
  const [user1Prefs, setUser1Prefs] = useState<UserPreferences | null>(null);
  const [user2Prefs, setUser2Prefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setLoading(true);
        
        console.log('[PreferencesComparison] Loading preferences for:');
        console.log('  - User 1 ID:', user1Id);
        console.log('  - User 2 ID:', user2Id);
        
        const [prefs1, prefs2] = await Promise.all([
          matchingService.getUserPreferences(user1Id),
          matchingService.getUserPreferences(user2Id)
        ]);
        
        console.log('[PreferencesComparison] Loaded preferences:');
        console.log('  - User 1 preferences:', prefs1);
        console.log('  - User 2 preferences:', prefs2);
        
        setUser1Prefs(prefs1);
        setUser2Prefs(prefs2);
        setError(null);
      } catch (err: any) {
        console.error('Failed to load user preferences:', err);
        setError('Failed to load preferences');
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, [user1Id, user2Id]);

  const getTopGenres = (preferences: { [genre: string]: number }, limit: number = 5) => {
    return Object.entries(preferences)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit);
  };

  const calculateCompatibility = () => {
    if (!user1Prefs || !user2Prefs || 
        Object.keys(user1Prefs.genre_preferences).length === 0 || 
        Object.keys(user2Prefs.genre_preferences).length === 0) {
      return 0;
    }

    const genres1 = user1Prefs.genre_preferences;
    const genres2 = user2Prefs.genre_preferences;
    
    // Get all genres from both users
    const allGenres = new Set([...Object.keys(genres1), ...Object.keys(genres2)]);
    
    let similarity = 0;
    let count = 0;
    
    for (const genre of allGenres) {
      const score1 = genres1[genre] || 0;
      const score2 = genres2[genre] || 0;
      
      // Calculate similarity (inverse of absolute difference)
      const diff = Math.abs(score1 - score2);
      similarity += (1 - diff);
      count++;
    }
    
    return count > 0 ? (similarity / count) * 100 : 0;
  };

  const getCompatibilityColor = (compatibility: number) => {
    if (compatibility >= 70) return '#4CAF50';
    if (compatibility >= 50) return '#FF9800';
    return '#F44336';
  };

  if (loading) {
    return (
      <div className="preferences-comparison loading">
        <div className="loading-spinner"></div>
        <p>Loading preferences...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="preferences-comparison error">
        <p>{error}</p>
      </div>
    );
  }

  const compatibility = calculateCompatibility();

  return (
    <div className="preferences-comparison">
      <div className="comparison-header">
        <h3>🎭 Taste Profiles</h3>
        <div className="compatibility-score">
          <span className="compatibility-label">Compatibility:</span>
          <span 
            className="compatibility-value"
            style={{ color: getCompatibilityColor(compatibility) }}
          >
            {compatibility.toFixed(0)}%
          </span>
        </div>
      </div>

      <div className="users-comparison">
        {/* User 1 */}
        <div className="user-preferences">
          <div className="user-header">
            <h4>{user1Name}</h4>
            <div className="user-stats">
              <span className="interactions">
                {user1Prefs?.total_interactions || 0} interactions
              </span>
              <span className="confidence">
                {((user1Prefs?.confidence_score || 0) * 100).toFixed(0)}% confidence
              </span>
            </div>
          </div>
          
          <div className="genre-preferences">
            {user1Prefs && Object.keys(user1Prefs.genre_preferences).length > 0 ? (
              getTopGenres(user1Prefs.genre_preferences).map(([genre, score]) => (
                <div key={genre} className="preference-item">
                  <span className="genre-name">{genre}</span>
                  <div className="preference-bar">
                    <div 
                      className="preference-fill user1"
                      style={{ width: `${score * 100}%` }}
                    />
                  </div>
                  <span className="preference-score">{(score * 100).toFixed(0)}%</span>
                </div>
              ))
            ) : (
              <p className="no-preferences">No preferences learned yet</p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="comparison-divider">
          <div className="vs-circle">VS</div>
        </div>

        {/* User 2 */}
        <div className="user-preferences">
          <div className="user-header">
            <h4>{user2Name}</h4>
            <div className="user-stats">
              <span className="interactions">
                {user2Prefs?.total_interactions || 0} interactions
              </span>
              <span className="confidence">
                {((user2Prefs?.confidence_score || 0) * 100).toFixed(0)}% confidence
              </span>
            </div>
          </div>
          
          <div className="genre-preferences">
            {user2Prefs && Object.keys(user2Prefs.genre_preferences).length > 0 ? (
              getTopGenres(user2Prefs.genre_preferences).map(([genre, score]) => (
                <div key={genre} className="preference-item">
                  <span className="genre-name">{genre}</span>
                  <div className="preference-bar">
                    <div 
                      className="preference-fill user2"
                      style={{ width: `${score * 100}%` }}
                    />
                  </div>
                  <span className="preference-score">{(score * 100).toFixed(0)}%</span>
                </div>
              ))
            ) : (
              <div className="no-preferences">
                <p>No preferences learned yet</p>
                <small>Partner needs to like/dislike movies to build their taste profile</small>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Common Preferences */}
      {user1Prefs && user2Prefs && compatibility > 0 && (
        <div className="common-preferences">
          <h4>🤝 Common Ground</h4>
          <div className="common-genres">
            {getTopGenres(user1Prefs.genre_preferences, 10)
              .filter(([genre1]) => 
                getTopGenres(user2Prefs.genre_preferences, 10)
                  .some(([genre2]) => genre1 === genre2)
              )
              .slice(0, 3)
              .map(([genre]) => {
                const score1 = user1Prefs.genre_preferences[genre] || 0;
                const score2 = user2Prefs.genre_preferences[genre] || 0;
                const avgScore = (score1 + score2) / 2;
                
                return (
                  <div key={genre} className="common-genre">
                    <span className="genre-name">{genre}</span>
                    <div className="user-scores">
                      <span className="user1-score">{(score1 * 100).toFixed(0)}%</span>
                      <span className="separator">•</span>
                      <span className="user2-score">{(score2 * 100).toFixed(0)}%</span>
                    </div>
                    <div className="avg-score">
                      Avg: {(avgScore * 100).toFixed(0)}%
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreferencesComparison; 