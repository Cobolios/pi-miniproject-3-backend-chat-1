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

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for development/Sprint 2. Should be restricted in production.
  methods: ['GET', 'POST'],
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
    origin: '*', // Allow the frontend to connect
    methods: ['GET', 'POST'],
  },
});

// Setup Socket services
initializeSocket(io);

// Start server
server.listen(port, () => {
  console.log(`Chat server listening on port ${port}`);
  console.log(`Local: http://localhost:${port}`);
});

