/**
 * SmartTicket Client Configuration
 * This file centralizes the API URL so it can be changed for production.
 */

// In production, Vercel will provide VITE_API_URL. Locally it falls back to localhost.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

console.log(`[SmartTicket] Using API at: ${API_URL}`);
