/**
 * Service for interacting with the MovieMatch algorithm backend
 */

import { Movie } from './movieService';
import { API_BASE_URL } from '../config';

export interface MatchingSession {
  session_id: string;
  user1_id: string;
  user2_id: string;
}

export interface RecommendationsResponse {
  movies: Movie[];
  session_stage: string;
  total_interactions: number;
  mutual_likes: number;
}

export interface FeedbackRequest {
  user_id: string;
  movie_id: number;
  feedback_type: 'like' | 'dislike' | 'skip';
  time_spent_ms?: number;
}

export interface SessionStats {
  session_id: string;
  session_stage: string;
  total_interactions: number;
  mutual_likes: number;
  user1_stats: {
    likes: number;
    dislikes: number;
    skips: number;
  };
  user2_stats: {
    likes: number;
    dislikes: number;
    skips: number;
  };
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  user_id: string;
  genre_preferences: { [genre: string]: number };
  rating_threshold: number;
  year_preference_start: number;
  confidence_score: number;
  total_interactions: number;
}

class MatchingService {
  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Create a new matching session
   */
  async createSession(user1Id: string, user2Id: string): Promise<{ session_id: string }> {
    // Sort user IDs alphabetically to ensure consistent session creation
    // This prevents duplicate sessions when users join in different orders
    const [sortedUser1, sortedUser2] = [user1Id, user2Id].sort();
    
    return this.makeRequest<{ session_id: string }>('/api/matching/sessions', {
      method: 'POST',
      body: JSON.stringify({
        user1_id: sortedUser1,
        user2_id: sortedUser2,
      }),
    });
  }

  /**
   * Get movie recommendations for a session
   */
  async getRecommendations(
    sessionId: string,
    batchSize: number = 20,
    userId: string
  ): Promise<RecommendationsResponse> {
    return this.makeRequest<RecommendationsResponse>(
      `/api/matching/sessions/${sessionId}/recommendations?batch_size=${batchSize}&user_id=${encodeURIComponent(userId)}`
    );
  }

  /**
   * Submit user feedback for a movie
   */
  async submitFeedback(
    sessionId: string,
    feedback: FeedbackRequest
  ): Promise<{ success: boolean; message: string }> {
    return this.makeRequest<{ success: boolean; message: string }>(
      `/api/matching/sessions/${sessionId}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify(feedback),
      }
    );
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<SessionStats> {
    return this.makeRequest<SessionStats>(`/api/matching/sessions/${sessionId}/stats`);
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    return this.makeRequest<UserPreferences>(`/api/matching/users/${userId}/preferences`);
  }

  /**
   * Check if backend is available
   */
  async healthCheck(): Promise<{ status: string; service: string }> {
    return this.makeRequest<{ status: string; service: string }>('/health');
  }
}

export const matchingService = new MatchingService(); 