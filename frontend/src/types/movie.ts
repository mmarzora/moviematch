export interface Movie {
  id: number;
  title: string;
  description: string;
  release_year: number;
  poster_url: string;
  genres: string[];
  runtime_minutes: number;
  rating: number;
  watchmode_id?: string;
  created_at?: string;
  updated_at?: string;
} 