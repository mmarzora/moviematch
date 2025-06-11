const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from the correct path
const envPath = path.join(__dirname, '../../../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const API_KEY = process.env.WATCHMODE_API_KEY;
console.log('API Key loaded:', API_KEY ? 'Yes (length: ' + API_KEY.length + ')' : 'No');

const BASE_URL = 'https://api.watchmode.com/v1';

// Initialize database
const db = new Database(path.join(__dirname, 'movies.db'));

async function fetchMovies(limit = 200) {
    if (!API_KEY) {
        throw new Error('WatchMode API key not found in environment variables');
    }

    try {
        // Fetch titles with good ratings and recent releases first
        const response = await axios.get(`${BASE_URL}/list-titles/`, {
            params: {
                apiKey: API_KEY,
                types: 'movie',
                limit: limit,
                sort_by: 'popularity_desc'
            }
        });

        const movies = response.data.titles;
        console.log(`Fetched ${movies.length} movies from WatchMode API`);

        // Fetch detailed information for each movie
        const detailedMovies = await Promise.all(
            movies.map(async (movie) => {
                try {
                    const detailResponse = await axios.get(`${BASE_URL}/title/${movie.id}/details/`, {
                        params: {
                            apiKey: API_KEY
                        }
                    });
                    return detailResponse.data;
                } catch (error) {
                    console.error(`Failed to fetch details for movie ${movie.id}:`, error.message);
                    return null;
                }
            })
        );

        return detailedMovies.filter(movie => movie !== null);
    } catch (error) {
        console.error('Failed to fetch movies from WatchMode:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function populateMovies() {
    try {
        console.log('Starting movie database population...');
        
        // Prepare the insert statement
        const insert = db.prepare(`
            INSERT INTO movies (
                title, description, release_year, poster_url,
                genres, runtime_minutes, rating, watchmode_id
            ) VALUES (
                @title, @description, @release_year, @poster_url,
                @genres, @runtime_minutes, @rating, @watchmode_id
            )
        `);

        // Begin transaction
        const transaction = db.transaction((movies) => {
            for (const movie of movies) {
                insert.run({
                    title: movie.title,
                    description: movie.plot_overview,
                    release_year: movie.year,
                    poster_url: movie.poster,
                    genres: JSON.stringify(movie.genre_names),
                    runtime_minutes: movie.runtime_minutes,
                    rating: movie.user_rating,
                    watchmode_id: movie.id.toString()
                });
            }
        });

        // Fetch movies from WatchMode API
        console.log('Fetching movies from WatchMode API...');
        const movies = await fetchMovies(200);
        console.log(`Retrieved ${movies.length} movies from API`);

        // Execute transaction
        transaction(movies);
        console.log('Successfully populated database with movies');

        // Log some stats
        const count = db.prepare('SELECT COUNT(*) as count FROM movies').get();
        console.log(`Total movies in database: ${count.count}`);

    } catch (error) {
        console.error('Failed to populate movies:', error);
        process.exit(1);
    }
}

// Run the population
populateMovies(); 