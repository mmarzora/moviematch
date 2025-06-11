const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');
const dotenv = require('dotenv');

// Add this block to log the .env path
const envPath = path.join(__dirname, '../../../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const API_KEY = process.env.WATCHMODE_API_KEY;
const BASE_URL = 'https://api.watchmode.com/v1';
const db = new Database(path.join(__dirname, 'movies.db'));

// 1. Create actors table if it doesn't exist
// id: WatchMode person id, name: actor name, embedding: BLOB
// You can add more fields if needed

db.exec(`
    CREATE TABLE IF NOT EXISTS actors (
        id INTEGER PRIMARY KEY,
        name TEXT,
        embedding BLOB
    );
`);

// Create actor_movie table if it doesn't exist
// This table links actors to movies

db.exec(`
    CREATE TABLE IF NOT EXISTS actor_movie (
        actor_id INTEGER,
        movie_id INTEGER,
        PRIMARY KEY (actor_id, movie_id)
    );
`);

// 2. Get all movies with embeddings
const movies = db.prepare('SELECT id, title, embedding, watchmode_id FROM movies WHERE embedding IS NOT NULL').all();

const actorEmbeddings = {}; // { actor_id: { name, embeddings: [Float32Array, ...] } }

async function fetchCast(watchmode_id) {
    try {
        console.log('Fetching cast for movie:', watchmode_id);
        const url = `${BASE_URL}/title/${watchmode_id}/cast-crew/`;
        const response = await axios.get(url, { params: { apiKey: API_KEY } } );
        const allPeople = response.data;
        const cast = allPeople.filter(person => person.type === 'Cast' && person.order <= 5);
        // console.log(cast);
        return cast || [];
    } catch (err) {
        console.error(`Failed to fetch cast for movie ${watchmode_id}:`, err.message);
        return [];
    }
}

function parseEmbedding(buffer) {
    // Convert Buffer to Float32Array
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
}

function averageEmbeddings(arrays) {
    if (arrays.length === 0) return null;
    const length = arrays[0].length;
    const avg = new Float32Array(length);
    for (const arr of arrays) {
        for (let i = 0; i < length; i++) {
            avg[i] += arr[i];
        }
    }
    for (let i = 0; i < length; i++) {
        avg[i] /= arrays.length;
    }
    return avg;
}

(async () => {
    for (const movie of movies) {
        // Check if this movie already has actor_movie entries
        const existing = db.prepare('SELECT 1 FROM actor_movie WHERE movie_id = ? LIMIT 1').get(movie.id);
        if (existing) {
            console.log(`Skipping movie ${movie.id} (${movie.title}) - already in actor_movie table.`);
            continue;
        }
        const embedding = parseEmbedding(movie.embedding);
        const cast = await fetchCast(movie.watchmode_id);

        for (const actor of cast) {
            // Insert into actor_movie table, avoiding duplicates
            db.prepare('INSERT OR IGNORE INTO actor_movie (actor_id, movie_id) VALUES (?, ?)')
              .run(actor.id, movie.id);
            if (!actorEmbeddings[actor.id]) {
                actorEmbeddings[actor.id] = { name: actor.full_name, embeddings: [] };
            }
            actorEmbeddings[actor.id].embeddings.push(embedding);
        }
    }

    // 3. Calculate average embedding and insert into actors table
    const insert = db.prepare('INSERT OR REPLACE INTO actors (id, name, embedding) VALUES (?, ?, ?)');
    let count = 0;
    for (const [actor_id, { name, embeddings }] of Object.entries(actorEmbeddings)) {
        const avg = averageEmbeddings(embeddings);
        if (avg) {
            insert.run(actor_id, name, Buffer.from(avg.buffer));
            count++;
        }
    }
    console.log(`Populated actors table with ${count} actors.`);
    process.exit(0);
})(); 