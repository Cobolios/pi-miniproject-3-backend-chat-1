/**
 * @file index.ts
 * @description Entry point for the backend chat server. Initializes Express and Socket.io.
 */

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeSocket } from './services/socketService';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001; // Sprint 2: 2 servers (user and chat). Assuming chat uses a different port or deployed separately.

// Parse CORS origins from environment variable or default to '*'
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : '*';

// Middleware
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
  res.send('Chat Server is running');
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
});

// Setup Socket services
initializeSocket(io);

// Start server
server.listen(port, () => {
  console.log(`Chat server listening on port ${port}`);
  console.log(`Local: http://localhost:${port}`);
});

