import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import './SemanticPreferencesComparison.css';

interface SemanticTheme {
  score: number;
  confidence: number;
  count: number;
}

interface CommonTheme {
  user1_score: number;
  user2_score: number;
  average_score: number;
  compatibility: number;
  strength: number;
}

interface SemanticPreferencesData {
  user_id: string;
  theme_preferences: { [theme: string]: SemanticTheme };
  top_themes: string[];
  sample_similar_movies: Array<{ title: string; similarity: number }>;
}

interface SemanticComparisonData {
  user1_id: string;
  user2_id: string;
  user1_themes: string[];
  user2_themes: string[];
  common_themes: { [theme: string]: CommonTheme };
  semantic_compatibility: number;
  top_common_themes: string[];
  theme_descriptions: { [theme: string]: string };
}

interface SemanticPreferencesComparisonProps {
  user1Id: string;
  user2Id: string;
  user1Name?: string;
  user2Name?: string;
}

const SemanticPreferencesComparison: React.FC<SemanticPreferencesComparisonProps> = ({ 
  user1Id, 
  user2Id, 
  user1Name = "User 1", 
  user2Name = "User 2"
}) => {
  const [user1Data, setUser1Data] = useState<SemanticPreferencesData | null>(null);
  const [user2Data, setUser2Data] = useState<SemanticPreferencesData | null>(null);
  const [comparisonData, setComparisonData] = useState<SemanticComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSemanticPreferences = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('[SemanticPreferencesComparison] Loading semantic preferences for:');
        console.log('  - User 1 ID:', user1Id);
        console.log('  - User 2 ID:', user2Id);

        // Load individual user semantic preferences
        const [user1Response, user2Response, comparisonResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/embeddings/semantic/themes/user/${user1Id}`),
          fetch(`${API_BASE_URL}/api/embeddings/semantic/themes/user/${user2Id}`),
          fetch(`${API_BASE_URL}/api/embeddings/semantic/themes/compare?user1_id=${user1Id}&user2_id=${user2Id}`)
        ]);

        console.log('[SemanticPreferencesComparison] Response status:');
        console.log('  - User 1 response:', user1Response.status, user1Response.statusText);
        console.log('  - User 2 response:', user2Response.status, user2Response.statusText);
        console.log('  - Comparison response:', comparisonResponse.status, comparisonResponse.statusText);

        if (!user1Response.ok || !user2Response.ok || !comparisonResponse.ok) {
          throw new Error('Failed to fetch semantic preferences');
        }

        const [user1Result, user2Result, comparisonResult] = await Promise.all([
          user1Response.json(),
          user2Response.json(),
          comparisonResponse.json()
        ]);

        console.log('[SemanticPreferencesComparison] Loaded data:');
        console.log('  - User 1 themes count:', user1Result.top_themes?.length || 0);
        console.log('  - User 2 themes count:', user2Result.top_themes?.length || 0);
        console.log('  - User 1 confidence:', user1Result.confidence_score);
        console.log('  - User 2 confidence:', user2Result.confidence_score);
        console.log('  - Comparison compatibility:', comparisonResult.semantic_compatibility);

        setUser1Data(user1Result);
        setUser2Data(user2Result);
        setComparisonData(comparisonResult);
      } catch (err: any) {
        console.error('Failed to load semantic preferences:', err);
        setError('Failed to load semantic analysis. Make sure users have rated some movies.');
      } finally {
        setLoading(false);
      }
    };

    loadSemanticPreferences();
  }, [user1Id, user2Id]);

  const formatThemeName = (themeKey: string) => {
    return themeKey
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getThemeIcon = (themeKey: string) => {
    const icons: { [key: string]: string } = {
      'dark_gritty': '🌑',
      'uplifting_feel_good': '☀️',
      'suspenseful_tense': '⚡',
      'mind_bending': '🧠',
      'love_romance': '💕',
      'family_bonds': '👨‍👩‍👧‍👦',
      'friendship_loyalty': '🤝',
      'coming_of_age': '🌱',
      'redemption_transformation': '🦋',
      'good_vs_evil': '⚔️',
      'futuristic_sci_fi': '🚀',
      'historical_period': '🏛️',
      'urban_modern': '🏙️',
      'rural_nature': '🌲',
      'ensemble_cast': '👥',
      'character_study': '🎭',
      'fast_paced_action': '💨',
      'slow_burn': '🕯️',
      'visually_stunning': '🎨',
      'minimalist': '⚪',
      'epic_spectacle': '🎪'
    };
    return icons[themeKey] || '🎬';
  };

  const getCompatibilityColor = (compatibility: number) => {
    if (compatibility >= 0.7) return '#4CAF50';
    if (compatibility >= 0.5) return '#FF9800';
    return '#F44336';
  };

  if (loading) {
    return (
      <div className="semantic-preferences-comparison loading">
        <div className="loading-spinner"></div>
        <p>Analyzing semantic preferences...</p>
        <small>This may take a moment as we analyze your movie taste patterns</small>
      </div>
    );
  }

  if (error) {
    return (
      <div className="semantic-preferences-comparison error">
        <p>{error}</p>
        <small>Users need to rate more movies for semantic analysis</small>
      </div>
    );
  }

  if (!user1Data || !user2Data || !comparisonData) {
    return (
      <div className="semantic-preferences-comparison error">
        <p>No semantic data available</p>
        <small>Rate more movies to enable deep preference analysis</small>
      </div>
    );
  }

  return (
    <div className="semantic-preferences-comparison">
      <div className="semantic-header">
        <h3>🎭 Deep Taste Analysis</h3>
        <div className="semantic-compatibility">
          <span className="semantic-label">Semantic Match:</span>
          <span 
            className="semantic-value"
            style={{ color: getCompatibilityColor(comparisonData.semantic_compatibility) }}
          >
            {(comparisonData.semantic_compatibility * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <div className="users-semantic-comparison">
        {/* User 1 */}
        <div className="user-semantic-preferences">
          <div className="user-semantic-header">
            <h4>{user1Name}</h4>
            <div className="theme-count">
              {user1Data.top_themes.length} themes identified
            </div>
          </div>
          
          <div className="semantic-themes">
            {user1Data.top_themes.slice(0, 5).map(themeKey => {
              const themeData = user1Data.theme_preferences[themeKey];
              if (!themeData) return null;
              
              return (
                <div key={themeKey} className="semantic-theme-item">
                  <div className="theme-header">
                    <span className="theme-icon">{getThemeIcon(themeKey)}</span>
                    <span className="theme-name">{formatThemeName(themeKey)}</span>
                  </div>
                  <div className="theme-bar">
                    <div 
                      className="theme-fill user1"
                      style={{ width: `${themeData.score * 100}%` }}
                    />
                  </div>
                  <div className="theme-stats">
                    <span className="theme-score">{(themeData.score * 100).toFixed(0)}%</span>
                    <span className="theme-confidence">
                      {(themeData.confidence * 100).toFixed(0)}% conf
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {user1Data.sample_similar_movies.length > 0 && (
            <div className="similar-movies">
              <h5>Similar Movies You'd Like:</h5>
              <div className="movie-samples">
                {user1Data.sample_similar_movies.slice(0, 3).map((movie, idx) => (
                  <span key={idx} className="movie-sample">
                    {movie.title} ({(movie.similarity * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="semantic-divider">
          <div className="vs-circle">VS</div>
        </div>

        {/* User 2 */}
        <div className="user-semantic-preferences">
          <div className="user-semantic-header">
            <h4>{user2Name}</h4>
            <div className="theme-count">
              {user2Data.top_themes.length} themes identified
            </div>
          </div>
          
          <div className="semantic-themes">
            {user2Data.top_themes.slice(0, 5).map(themeKey => {
              const themeData = user2Data.theme_preferences[themeKey];
              if (!themeData) return null;
              
              return (
                <div key={themeKey} className="semantic-theme-item">
                  <div className="theme-header">
                    <span className="theme-icon">{getThemeIcon(themeKey)}</span>
                    <span className="theme-name">{formatThemeName(themeKey)}</span>
                  </div>
                  <div className="theme-bar">
                    <div 
                      className="theme-fill user2"
                      style={{ width: `${themeData.score * 100}%` }}
                    />
                  </div>
                  <div className="theme-stats">
                    <span className="theme-score">{(themeData.score * 100).toFixed(0)}%</span>
                    <span className="theme-confidence">
                      {(themeData.confidence * 100).toFixed(0)}% conf
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {user2Data.sample_similar_movies.length > 0 && (
            <div className="similar-movies">
              <h5>Similar Movies You'd Like:</h5>
              <div className="movie-samples">
                {user2Data.sample_similar_movies.slice(0, 3).map((movie, idx) => (
                  <span key={idx} className="movie-sample">
                    {movie.title} ({(movie.similarity * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Semantic Common Ground */}
      {comparisonData.top_common_themes.length > 0 && (
        <div className="semantic-common-ground">
          <h4>🤝 Deep Common Ground</h4>
          <p className="semantic-description">
            Beyond genres, you both share these deeper movie preferences:
          </p>
          
          <div className="common-semantic-themes">
            {comparisonData.top_common_themes.slice(0, 3).map(themeKey => {
              const commonData = comparisonData.common_themes[themeKey];
              const description = comparisonData.theme_descriptions[themeKey];
              
              return (
                <div key={themeKey} className="common-semantic-theme">
                  <div className="common-theme-header">
                    <span className="theme-icon">{getThemeIcon(themeKey)}</span>
                    <div className="theme-info">
                      <span className="theme-name">{formatThemeName(themeKey)}</span>
                      <span className="theme-description">{description}</span>
                    </div>
                  </div>
                  
                  <div className="common-theme-scores">
                    <div className="user-score-comparison">
                      <span className="user1-score">
                        {user1Name}: {(commonData.user1_score * 100).toFixed(0)}%
                      </span>
                      <span className="compatibility-indicator">
                        {(commonData.compatibility * 100).toFixed(0)}% match
                      </span>
                      <span className="user2-score">
                        {user2Name}: {(commonData.user2_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    
                    <div className="strength-bar">
                      <div 
                        className="strength-fill"
                        style={{ 
                          width: `${commonData.strength * 100}%`,
                          backgroundColor: getCompatibilityColor(commonData.compatibility)
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="semantic-insight">
        <p>
          💡 <strong>Insight:</strong> This analysis goes beyond genres to understand your deeper movie preferences - 
          the themes, moods, and storytelling styles that resonate with you both.
        </p>
      </div>
    </div>
  );
};

export default SemanticPreferencesComparison; 