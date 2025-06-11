/**
 * Configuration for MovieMatch frontend
 */

// Get the current hostname to determine if we're on the network
const hostname = window.location.hostname;

// If accessing via IP address, use the same IP for backend
// Otherwise use localhost (for development)
export const API_BASE_URL = hostname === 'localhost' || hostname === '127.0.0.1' 
  ? process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'
  : `http://${hostname}:8000`;

export const config = {
  API_BASE_URL,
  // Add other configuration options here
}; 