import axios from 'axios';

// Create an axios instance with the base URL
const api = axios.create({
    baseURL: 'http://127.0.0.1:8000'
});

export interface Movie {
    id: number;
    title: string;
    description: string;
    release_year: number;
    poster_url: string;
    poster?: string;  // For backward compatibility
    genres: string[];  // Will be parsed from JSON
    runtime_minutes: number;
    rating: number;
    year?: number;     // For backward compatibility
    critic_score?: number;  // For backward compatibility
    similarity?: number;  // Used when returning similar movies
}

class MovieService {
    private readonly API_BASE_URL = '/api/movies';  // Use relative URL since we have a proxy

    async getRandomMovies(params: {
        limit?: number;
        year_start?: number;
        year_end?: number;
        minRating?: number;
    } = {}): Promise<Movie[]> {
        try {
            const response = await api.get(`${this.API_BASE_URL}/random`, { params });
            
            if (!response.data || !response.data.movies) {
                console.error('Invalid API response format:', response.data);
                return [];
            }

            const movies = response.data.movies;
            return movies;
        } catch (error) {
            console.error('Error fetching random movies:', error);
            return [];
        }
    }

    async getMovieDetails(movieId: number): Promise<Movie | null> {
        try {
            const response = await api.get(`${this.API_BASE_URL}/${movieId}`);
            
            return {
                ...response.data,
                // genres is already parsed by the backend
                poster: response.data.poster_url,  // For backward compatibility
                year: response.data.release_year   // For backward compatibility
            };
        } catch (error: any) {
            console.error('Error fetching movie details:', {
                message: error.message,
                status: error.response?.status,
                movieId: movieId
            });
            return null;
        }
    }

    async getSimilarMovies(movieId: number, limit: number = 5): Promise<Movie[]> {
        try {
            const response = await api.get(`${this.API_BASE_URL}/${movieId}/similar`, {
                params: { limit }
            });
            
            // The FastAPI endpoint returns { movies: Movie[] }
            return response.data.movies.map((movie: any) => ({
                ...movie,
                // genres is already parsed by the backend
                poster: movie.poster_url,  // For backward compatibility
                year: movie.release_year   // For backward compatibility
            }));
        } catch (error: any) {
            console.error('Error fetching similar movies:', {
                message: error.message,
                status: error.response?.status,
                movieId: movieId
            });
            return [];
        }
    }
}

export const movieService = new MovieService(); 