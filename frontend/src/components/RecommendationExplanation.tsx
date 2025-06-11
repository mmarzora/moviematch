import React, { useState, useEffect } from 'react';
import './RecommendationExplanation.css';

interface ExplanationData {
  movie_id: number;
  movie_title: string;
  session_stage: string;
  primary_explanation: string;
  why_this_movie: string[];
  detailed_breakdown: {
    genre_compatibility: {
      match_quality: string;
      explanation: string;
      combined_score: number;
      best_matching_genres: string[];
      user1_genre_scores: Record<string, number>;
      user2_genre_scores: Record<string, number>;
    };
    semantic_similarity: {
      similarity_quality: string;
      explanation: string;
      combined_similarity: number;
      user1_similarity: number;
      user2_similarity: number;
    };
    algorithm_stage: {
      stage: string;
      description: string;
      focus: string;
      weights: {
        genre: number;
        embedding: number;
        diversity: number;
      };
    };
    confidence_factors: {
      overall_confidence: string;
      confidence_explanation: string;
    };
  };
  user_context: {
    user1_interactions: number;
    user2_interactions: number;
    user1_confidence: number;
    user2_confidence: number;
  };
}

interface RecommendationExplanationProps {
  sessionId: string;
  movieId: number;
  user1Id: string;
  user2Id: string;
  user1Name?: string;
  user2Name?: string;
  onClose?: () => void;
}

const RecommendationExplanation: React.FC<RecommendationExplanationProps> = ({
  sessionId,
  movieId,
  user1Id,
  user2Id,
  user1Name = "You",
  user2Name = "Partner",
  onClose
}) => {
  const [explanation, setExplanation] = useState<ExplanationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetailed, setShowDetailed] = useState(false);

  useEffect(() => {
    const fetchExplanation = async () => {
      try {
        setLoading(true);
        
        // Dynamic API URL configuration
        const getAPIBaseURL = () => {
          if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
              return 'http://localhost:8000';
            } else {
              // Use the network IP for cross-device access
              return 'http://192.168.1.13:8000';
            }
          }
          return 'http://localhost:8000';
        };

        const response = await fetch(
          `${getAPIBaseURL()}/api/matching/explain/${sessionId}/${movieId}?user1_id=${user1Id}&user2_id=${user2Id}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch explanation');
        }

        const data = await response.json();
        setExplanation(data);
      } catch (err: any) {
        console.error('Error fetching explanation:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchExplanation();
  }, [sessionId, movieId, user1Id, user2Id]);

  if (loading) {
    return (
      <div className="explanation-modal">
        <div className="explanation-content">
          <div className="explanation-loading">
            <div className="loading-spinner"></div>
            <p>Analyzing recommendation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !explanation) {
    return (
      <div className="explanation-modal">
        <div className="explanation-content">
          <div className="explanation-header">
            <h3>Explanation Not Available</h3>
            {onClose && <button className="close-btn" onClick={onClose}>×</button>}
          </div>
          <p>Unable to explain this recommendation: {error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const { detailed_breakdown } = explanation;

  return (
    <div className="explanation-modal">
      <div className="explanation-content">
        <div className="explanation-header">
          <h3>🤔 Why "{explanation.movie_title}"?</h3>
          {onClose && <button className="close-btn" onClick={onClose}>×</button>}
        </div>

        {/* Stage Badge */}
        <div className={`stage-indicator stage-${explanation.session_stage}`}>
          <span className="stage-label">{explanation.session_stage.toUpperCase()}</span>
          <span className="stage-description">
            {detailed_breakdown.algorithm_stage.description}
          </span>
        </div>

        {/* Primary Explanation */}
        <div className="primary-explanation">
          <h4>📝 Main Reason</h4>
          <p className="explanation-text">{explanation.primary_explanation}</p>
        </div>

        {/* Key Reasons */}
        {explanation.why_this_movie.length > 0 && (
          <div className="key-reasons">
            <h4>🎯 Key Factors</h4>
            <ul className="reasons-list">
              {explanation.why_this_movie.map((reason, index) => (
                <li key={index} className="reason-item">
                  <span className="reason-bullet">•</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Genre Compatibility */}
        <div className="compatibility-section">
          <h4>🎭 Genre Match</h4>
          <div className={`compatibility-card ${detailed_breakdown.genre_compatibility.match_quality}`}>
            <div className="compatibility-header">
              <span className="quality-badge">{detailed_breakdown.genre_compatibility.match_quality}</span>
              <span className="score">{(detailed_breakdown.genre_compatibility.combined_score * 100).toFixed(0)}%</span>
            </div>
            <p>{detailed_breakdown.genre_compatibility.explanation}</p>
            
            {/* Individual User Genre Scores */}
            <div className="user-scores-breakdown">
              <h5>📊 Individual Genre Scores</h5>
              <div className="user-scores-grid">
                <div className="user-score-section">
                  <h6>{user1Name}</h6>
                  <div className="genre-scores">
                    {Object.entries(detailed_breakdown.genre_compatibility.user1_genre_scores).map(([genre, score]) => (
                      <div key={genre} className="genre-score-item">
                        <span className="genre-name">{genre}</span>
                        <div className="score-bar">
                          <div 
                            className="score-fill user1-score" 
                            style={{ width: `${(score as number) * 100}%` }}
                          ></div>
                        </div>
                        <span className="score-value">{((score as number) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="user-average">
                    Average: {(Object.values(detailed_breakdown.genre_compatibility.user1_genre_scores).reduce((a: number, b: any) => a + b, 0) / Object.keys(detailed_breakdown.genre_compatibility.user1_genre_scores).length * 100).toFixed(0)}%
                  </div>
                </div>
                
                <div className="user-score-section">
                  <h6>{user2Name}</h6>
                  <div className="genre-scores">
                    {Object.entries(detailed_breakdown.genre_compatibility.user2_genre_scores).map(([genre, score]) => (
                      <div key={genre} className="genre-score-item">
                        <span className="genre-name">{genre}</span>
                        <div className="score-bar">
                          <div 
                            className="score-fill user2-score" 
                            style={{ width: `${(score as number) * 100}%` }}
                          ></div>
                        </div>
                        <span className="score-value">{((score as number) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="user-average">
                    Average: {(Object.values(detailed_breakdown.genre_compatibility.user2_genre_scores).reduce((a: number, b: any) => a + b, 0) / Object.keys(detailed_breakdown.genre_compatibility.user2_genre_scores).length * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              
              {/* Scoring Formula Explanation */}
              <div className="scoring-formula">
                <h6>🧮 How the Score is Calculated</h6>
                <div className="formula-breakdown">
                  {(() => {
                    const user1Avg = Object.values(detailed_breakdown.genre_compatibility.user1_genre_scores).reduce((a: number, b: any) => a + b, 0) / Object.keys(detailed_breakdown.genre_compatibility.user1_genre_scores).length;
                    const user2Avg = Object.values(detailed_breakdown.genre_compatibility.user2_genre_scores).reduce((a: number, b: any) => a + b, 0) / Object.keys(detailed_breakdown.genre_compatibility.user2_genre_scores).length;
                    const minScore = Math.min(user1Avg, user2Avg);
                    const avgScore = (user1Avg + user2Avg) / 2;
                    
                    return (
                      <>
                        <div className="formula-step">
                          <span className="step-label">Step 1:</span>
                          <span className="step-content">Calculate each user's average preference for movie genres</span>
                        </div>
                        <div className="formula-values">
                          <span>{user1Name}: {(user1Avg * 100).toFixed(0)}%</span>
                          <span>{user2Name}: {(user2Avg * 100).toFixed(0)}%</span>
                        </div>
                        
                        <div className="formula-step">
                          <span className="step-label">Step 2:</span>
                          <span className="step-content">Apply dual-user compatibility formula:</span>
                        </div>
                        <div className="formula-equation">
                          Final Score = 70% × min({(user1Avg * 100).toFixed(0)}%, {(user2Avg * 100).toFixed(0)}%) + 30% × avg({(user1Avg * 100).toFixed(0)}%, {(user2Avg * 100).toFixed(0)}%)
                        </div>
                        <div className="formula-calculation">
                          = 70% × {(minScore * 100).toFixed(0)}% + 30% × {(avgScore * 100).toFixed(0)}%
                          = <strong>{(detailed_breakdown.genre_compatibility.combined_score * 100).toFixed(0)}%</strong>
                        </div>
                        
                        <div className="formula-explanation">
                          <strong>Why this formula?</strong> We use 70% minimum to ensure both users are satisfied, plus 30% average to avoid being too conservative.
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {detailed_breakdown.genre_compatibility.best_matching_genres.length > 0 && (
              <div className="matching-genres">
                <strong>Best matches:</strong> {detailed_breakdown.genre_compatibility.best_matching_genres.join(', ')}
              </div>
            )}
          </div>
        </div>

        {/* Semantic Similarity */}
        <div className="compatibility-section">
          <h4>🧠 Taste Similarity</h4>
          <div className={`compatibility-card ${detailed_breakdown.semantic_similarity.similarity_quality}`}>
            <div className="compatibility-header">
              <span className="quality-badge">{detailed_breakdown.semantic_similarity.similarity_quality}</span>
              <span className="score">{(detailed_breakdown.semantic_similarity.combined_similarity * 100).toFixed(0)}%</span>
            </div>
            <p>{detailed_breakdown.semantic_similarity.explanation}</p>
            
            {/* Individual User Similarity Scores */}
            {detailed_breakdown.semantic_similarity.user1_similarity !== 0.5 && detailed_breakdown.semantic_similarity.user2_similarity !== 0.5 && (
              <div className="user-scores-breakdown">
                <h5>📊 Individual Similarity Scores</h5>
                <div className="similarity-breakdown-grid">
                  <div className="similarity-user">
                    <span className="user-label">{user1Name}</span>
                    <div className="similarity-bar">
                      <div 
                        className="similarity-fill user1-similarity" 
                        style={{ width: `${detailed_breakdown.semantic_similarity.user1_similarity * 100}%` }}
                      ></div>
                    </div>
                    <span className="similarity-value">{(detailed_breakdown.semantic_similarity.user1_similarity * 100).toFixed(0)}%</span>
                  </div>
                  
                  <div className="similarity-user">
                    <span className="user-label">{user2Name}</span>
                    <div className="similarity-bar">
                      <div 
                        className="similarity-fill user2-similarity" 
                        style={{ width: `${detailed_breakdown.semantic_similarity.user2_similarity * 100}%` }}
                      ></div>
                    </div>
                    <span className="similarity-value">{(detailed_breakdown.semantic_similarity.user2_similarity * 100).toFixed(0)}%</span>
                  </div>
                </div>
                
                {/* Semantic Scoring Formula */}
                <div className="scoring-formula">
                  <h6>🧮 Semantic Similarity Calculation</h6>
                  <div className="formula-breakdown">
                    {(() => {
                      const user1Sim = detailed_breakdown.semantic_similarity.user1_similarity;
                      const user2Sim = detailed_breakdown.semantic_similarity.user2_similarity;
                      const minSim = Math.min(user1Sim, user2Sim);
                      const avgSim = (user1Sim + user2Sim) / 2;
                      
                      return (
                        <>
                          <div className="formula-step">
                            <span className="step-label">Step 1:</span>
                            <span className="step-content">Calculate cosine similarity between movie embedding and each user's taste vector</span>
                          </div>
                          <div className="formula-values">
                            <span>{user1Name}: {(user1Sim * 100).toFixed(0)}%</span>
                            <span>{user2Name}: {(user2Sim * 100).toFixed(0)}%</span>
                          </div>
                          
                          <div className="formula-step">
                            <span className="step-label">Step 2:</span>
                            <span className="step-content">Apply same dual-user formula:</span>
                          </div>
                          <div className="formula-equation">
                            Combined = 70% × min({(user1Sim * 100).toFixed(0)}%, {(user2Sim * 100).toFixed(0)}%) + 30% × avg({(user1Sim * 100).toFixed(0)}%, {(user2Sim * 100).toFixed(0)}%)
                          </div>
                          <div className="formula-calculation">
                            = 70% × {(minSim * 100).toFixed(0)}% + 30% × {(avgSim * 100).toFixed(0)}%
                            = <strong>{(detailed_breakdown.semantic_similarity.combined_similarity * 100).toFixed(0)}%</strong>
                          </div>
                          
                          <div className="formula-explanation">
                            <strong>What's this?</strong> This measures how similar the movie's "semantic fingerprint" is to what you both typically enjoy, going beyond just genres.
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Confidence Level */}
        <div className="confidence-section">
          <h4>📊 Algorithm Confidence</h4>
          <div className={`confidence-card confidence-${detailed_breakdown.confidence_factors.overall_confidence}`}>
            <span className="confidence-level">{detailed_breakdown.confidence_factors.overall_confidence} confidence</span>
            <p>{detailed_breakdown.confidence_factors.confidence_explanation}</p>
          </div>
        </div>

        {/* Detailed Breakdown Toggle */}
        <div className="detailed-toggle">
          <button 
            className="toggle-detailed-btn"
            onClick={() => setShowDetailed(!showDetailed)}
          >
            {showDetailed ? '📊 Hide Technical Details' : '🔍 Show Technical Details'}
          </button>
        </div>

        {/* Technical Details */}
        {showDetailed && (
          <div className="technical-details">
            <h4>🔧 Technical Breakdown</h4>
            
            <div className="tech-section">
              <h5>Algorithm Stage: {explanation.session_stage}</h5>
              <p><strong>Focus:</strong> {detailed_breakdown.algorithm_stage.focus}</p>
              <p><strong>Total Interactions:</strong> {explanation.user_context.user1_interactions + explanation.user_context.user2_interactions}</p>
            </div>

            {/* Overall Score Calculation */}
            <div className="tech-section">
              <h5>🎯 Overall Recommendation Score</h5>
              <div className="overall-score-breakdown">
                {(() => {
                  const weights = detailed_breakdown.algorithm_stage.weights;
                  const genreScore = detailed_breakdown.genre_compatibility.combined_score;
                  const semanticScore = detailed_breakdown.semantic_similarity.combined_similarity;
                  const overallScore = (weights.genre * genreScore) + (weights.embedding * semanticScore);
                  
                  return (
                    <>
                      <div className="score-components">
                        <div className="score-component">
                          <span className="component-label">🎭 Genre Match</span>
                          <div className="component-calculation">
                            {(weights.genre * 100).toFixed(0)}% × {(genreScore * 100).toFixed(0)}% = <strong>{(weights.genre * genreScore * 100).toFixed(1)}%</strong>
                          </div>
                        </div>
                        
                        <div className="score-component">
                          <span className="component-label">🧠 Semantic Similarity</span>
                          <div className="component-calculation">
                            {(weights.embedding * 100).toFixed(0)}% × {(semanticScore * 100).toFixed(0)}% = <strong>{(weights.embedding * semanticScore * 100).toFixed(1)}%</strong>
                          </div>
                        </div>
                        
                        <div className="score-component">
                          <span className="component-label">🎲 Diversity Factor</span>
                          <div className="component-calculation">
                            {(weights.diversity * 100).toFixed(0)}% × Random = <strong>{(weights.diversity * 100).toFixed(1)}%</strong>
                          </div>
                        </div>
                      </div>
                      
                      <div className="final-score-calculation">
                        <div className="final-formula">
                          <strong>Final Score = {(weights.genre * genreScore * 100).toFixed(1)}% + {(weights.embedding * semanticScore * 100).toFixed(1)}% + {(weights.diversity * 100).toFixed(1)}% = {(overallScore * 100).toFixed(1)}%</strong>
                        </div>
                        <div className="stage-explanation">
                          <strong>Stage Weights ({explanation.session_stage}):</strong> Genre {(weights.genre * 100).toFixed(0)}% | Semantic {(weights.embedding * 100).toFixed(0)}% | Diversity {(weights.diversity * 100).toFixed(0)}%
                        </div>
                      </div>
                      
                      <div className="score-visualization">
                        <div className="score-bar-container">
                          <div className="score-bar-label">Overall Compatibility</div>
                          <div className="score-bar-full">
                            <div 
                              className="score-bar-fill overall-score" 
                              style={{ width: `${overallScore * 100}%` }}
                            ></div>
                          </div>
                          <div className="score-bar-value">{(overallScore * 100).toFixed(1)}%</div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="tech-section">
              <h5>User Confidence Scores</h5>
              <div className="user-confidence">
                <div className="confidence-bar">
                  <span>{user1Name}: {(explanation.user_context.user1_confidence * 100).toFixed(0)}%</span>
                  <div className="confidence-progress">
                    <div 
                      className="confidence-fill" 
                      style={{ width: `${explanation.user_context.user1_confidence * 100}%` }}
                    ></div>
                  </div>
                </div>
                <div className="confidence-bar">
                  <span>{user2Name}: {(explanation.user_context.user2_confidence * 100).toFixed(0)}%</span>
                  <div className="confidence-progress">
                    <div 
                      className="confidence-fill" 
                      style={{ width: `${explanation.user_context.user2_confidence * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecommendationExplanation;