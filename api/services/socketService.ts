/**
 * @file socketService.ts
 * @description Socket.io logic for handling real-time chat events.
 */

import { Server, Socket } from 'socket.io';
import * as admin from 'firebase-admin';
import { verifyToken } from '../middleware/auth';

/**
 * Interface for the Join Room event payload.
 */
interface JoinRoomPayload {
  roomId: string;
  userId: string;
}

/**
 * Interface for the Send Message event payload.
 */
interface SendMessagePayload {
  roomId: string;
  message: string;
  // Sender info might be inferred from the socket or passed in.
  // Based on requirements, we need to identify participants.
  // We will attach sender info to the message when broadcasting.
}

/**
 * Interface for the User in the socket.
 */
interface SocketUser {
  uid: string;
  name?: string;
  email?: string;
  [key: string]: any;
}

// Extend the Socket interface to include user data
declare module 'socket.io' {
  interface Socket {
    user?: SocketUser;
  }
}

/**
 * Initializes the Socket.io server with event handlers.
 * @param {Server} io - The Socket.io server instance.
 */
export const initializeSocket = (io: Server): void => {
  // Middleware for authentication
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      // Verify the token using the auth middleware
      const decodedToken = await verifyToken(token as string);
      
      // Attach user info to the socket
      socket.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email?.split('@')[0] || 'User', // Fallback name
      };

      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}, UserID: ${socket.user?.uid}`);

    /**
     * Handle 'join-room' event.
     * User joins a specific room for chat.
     */
    socket.on('join-room', ({ roomId, userId }: JoinRoomPayload) => {
      console.log(`User ${userId} joining room ${roomId}`);
      socket.join(roomId);
      
      // Optionally notify others in the room (not explicitly required by tasks but good practice)
      // socket.to(roomId).emit('user-joined', { userId, name: socket.user?.name });
    });

    /**
     * Handle 'send-message' event.
     * Broadcasts the message to all users in the room and saves it to Firestore.
     * Requirements: 
     * 1. Socket.io emits to all connected.
     * 2. Save to Firestore for transcription/evidence.
     */
    socket.on('send-message', async ({ roomId, message }: SendMessagePayload) => {
      if (!roomId || !message) {
        return;
      }

      const timestampISO = new Date().toISOString();
      const senderName = socket.user?.name || 'Unknown';
      const senderId = socket.user?.uid;

      const messageData = {
        roomId,
        message,
        senderId,
        senderName,
        timestamp: timestampISO,
      };

      // 1. Real-time Emission (Priority: High)
      // Emit immediately so users see the message without waiting for DB
      io.to(roomId).emit('receive-message', messageData);
      console.log(`Message sent to room ${roomId}: ${message}`);

      // 2. Persistence in Firestore (Priority: Medium - Async)
      // Saves the message for transcription/history (US-15)
      try {
        await admin.firestore()
          .collection('meetings')
          .doc(roomId)
          .collection('chatMessages')
          .add({
            senderId: senderId,
            senderName: senderName,
            content: message, // Mapped to 'content' as requested
            timestamp: admin.firestore.FieldValue.serverTimestamp(), // Server timestamp for sorting
            meetingId: roomId,
            createdAt: timestampISO // Storing ISO string as backup/reference
          });
          
      } catch (error) {
        // Log error but don't crash the socket connection
        console.error(`Error saving message to Firestore for room ${roomId}:`, error);
      }
    });

    /**
     * Handle 'disconnect' event.
     */
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};
