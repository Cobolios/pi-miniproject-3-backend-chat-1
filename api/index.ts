/**
 * Real-time chat server implementation using Socket.IO
 * 
 * This module provides a WebSocket-based chat server that supports:
 * - Multi-room chat functionality
 * - User presence tracking (online/offline)
 * - Room capacity management with configurable limits
 * - Real-time message broadcasting within rooms
 * - CORS configuration for cross-origin requests
 * 
 * @module ChatServer
 * @author Team 5
 * @version 0.1.0
 */

import { Server, type Socket } from "socket.io";
import "dotenv/config";

/**
 * CORS origin configuration for the Socket.IO server.
 * If ORIGIN environment variable is not set, allows any origin (true).
 * Otherwise, parses comma-separated origins from the environment variable.
 * @type {string[] | boolean}
 */
let corsOrigin: string[] | boolean;
if (!process.env.ORIGIN) {
    // If no ORIGIN is defined, allow any origin
    corsOrigin = true;
} else {
    corsOrigin = process.env.ORIGIN
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Socket.IO server instance configured with CORS settings.
 * Handles real-time bidirectional communication between clients.
 * @type {Server}
 */
const io = new Server({
    cors: {
        origin: corsOrigin
    }
});

/**
 * Server port number parsed from the PORT environment variable.
 * @type {number}
 */
const port = Number(process.env.PORT);

/**
 * Maximum number of users allowed per room.
 * Configurable via MAX_USERS_PER_ROOM environment variable.
 * Defaults to 10 if not specified.
 * @type {number}
 * @constant
 */
const MAX_USERS_PER_ROOM = Number(process.env.MAX_USERS_PER_ROOM) || 10;

io.listen(port);
console.log(`Server is running on port ${port}`);
console.log(`Maximum users per room: ${MAX_USERS_PER_ROOM}`);

/**
 * Represents an online user connected to the chat server.
 * @typedef {Object} OnlineUser
 * @property {string} socketId - Unique socket identifier for the connection
 * @property {string} userId - User identifier
 * @property {string} roomId - Room identifier the user is currently in
 */

/**
 * Payload structure for chat messages sent by clients.
 * @typedef {Object} ChatMessagePayload
 * @property {string} userId - Identifier of the user sending the message
 * @property {string} message - The message content
 * @property {string} [timestamp] - Optional ISO timestamp for the message
 * @property {string} [roomId] - Optional room identifier (can be inferred from sender)
 */

type OnlineUser = { socketId: string; userId: string; roomId: string };
type ChatMessagePayload = {
  userId: string;
  message: string;
  timestamp?: string;
  roomId?: string;
};

/**
 * Array storing all currently online users across all rooms.
 * Updated in real-time as users connect, disconnect, and change rooms.
 * @type {OnlineUser[]}
 */
let onlineUsers: OnlineUser[] = [];

/**
 * Handles new client connections to the Socket.IO server.
 * Sets up event listeners for room management, user registration, messaging, and disconnection.
 * @event connection
 * @param {Socket} socket - The socket instance representing the client connection
 */
io.on("connection", (socket: Socket) => {
    console.log("A user connected with id: ", socket.id);

    /**
     * Handles a client request to join a specific chat room.
     * Validates user and room IDs, checks room capacity limits, and manages user state.
     * Emits room:error if validation fails or room is full.
     * Emits room:joined on successful join and usersOnline to all room members.
     * @event joinRoom
     * @param {Object} data - Join room request data
     * @param {string} data.userId - User identifier
     * @param {string} data.roomId - Room identifier to join
     */
    socket.on("joinRoom", (data: { userId: string; roomId: string }) => {
        const { userId, roomId } = data;

        if (!userId || !roomId) {
            socket.emit("room:error", { message: "userId and roomId are required" });
            return;
        }

        // Check if user is already in this room
        const existingUser = onlineUsers.find(user => user.socketId === socket.id);
        const isAlreadyInRoom = existingUser?.roomId === roomId;

        // If not in the room, check the limit before joining
        if (!isAlreadyInRoom) {
            const roomUsers = onlineUsers.filter(user => user.roomId === roomId);
            const currentRoomSize = roomUsers.length;

            if (currentRoomSize >= MAX_USERS_PER_ROOM) {
                socket.emit("room:error", {
                    message: `Room is full. Maximum ${MAX_USERS_PER_ROOM} users allowed.`,
                    roomId: roomId,
                    currentUsers: currentRoomSize,
                    maxUsers: MAX_USERS_PER_ROOM
                });
                console.log(
                    `User ${userId} tried to join room ${roomId} but it's full (${currentRoomSize}/${MAX_USERS_PER_ROOM})`
                );
                return;
            }
        }

        // Leave previous room if it exists and is different
        if (existingUser && existingUser.roomId && existingUser.roomId !== roomId) {
            socket.leave(existingUser.roomId);
        }

        // Join the new room (Socket.IO creates the room automatically if it doesn't exist)
        socket.join(roomId);

        // Update or add user
        const existingUserIndex = onlineUsers.findIndex(
            user => user.socketId === socket.id
        );

        if (existingUserIndex !== -1) {
            onlineUsers[existingUserIndex] = { socketId: socket.id, userId, roomId };
        } else if (!onlineUsers.some(user => user.userId === userId && user.roomId === roomId)) {
            onlineUsers.push({ socketId: socket.id, userId, roomId });
        } else {
            onlineUsers = onlineUsers.map(user =>
                user.userId === userId && user.roomId === roomId 
                    ? { socketId: socket.id, userId, roomId } 
                    : user
            );
        }

        // Emit user list only to users in the same room
        const updatedRoomUsers = onlineUsers.filter(user => user.roomId === roomId);
        io.to(roomId).emit("usersOnline", updatedRoomUsers);

        // Confirm to the user that they joined successfully
        socket.emit("room:joined", {
            roomId: roomId,
            currentUsers: updatedRoomUsers.length,
            maxUsers: MAX_USERS_PER_ROOM
        });

        console.log(
            `User ${userId} joined room ${roomId}. Room now has ${updatedRoomUsers.length}/${MAX_USERS_PER_ROOM} users`
        );
    });

    /**
     * Registers a new user or updates an existing user's information.
     * Updates the online users list and broadcasts the updated list to relevant clients.
     * If the user is in a room, only broadcasts to that room; otherwise broadcasts to all clients.
     * @event newUser
     * @param {string} userId - User identifier to register or update
     */
    socket.on("newUser", (userId: string) => {
        if (!userId) {
            return;
        }

        const existingUserIndex = onlineUsers.findIndex(
            user => user.socketId === socket.id
        );

        if (existingUserIndex !== -1) {
            // Keep existing roomId if already has one
            const existingRoomId = onlineUsers[existingUserIndex].roomId || "";
            onlineUsers[existingUserIndex] = { 
                socketId: socket.id, 
                userId, 
                roomId: existingRoomId 
            };
        } else if (!onlineUsers.some(user => user.userId === userId)) {
            onlineUsers.push({ socketId: socket.id, userId, roomId: "" });
        } else {
            onlineUsers = onlineUsers.map(user =>
                user.userId === userId 
                    ? { socketId: socket.id, userId, roomId: user.roomId || "" } 
                    : user
            );
        }

        // If user has a roomId, emit only to that room
        const user = onlineUsers.find(u => u.socketId === socket.id);
        if (user && user.roomId) {
            const roomUsers = onlineUsers.filter(u => u.roomId === user.roomId);
            io.to(user.roomId).emit("usersOnline", roomUsers);
        } else {
            io.emit("usersOnline", onlineUsers);
        }
    });

    /**
     * Handles client disconnection events.
     * Removes the user from the online users list and notifies remaining users.
     * If the user was in a room, updates that room's user list; otherwise updates the global list.
     * @event disconnect
     */
    socket.on("disconnect", () => {
        const disconnectedUser = onlineUsers.find(user => user.socketId === socket.id);
        
        if (disconnectedUser && disconnectedUser.roomId) {
            // Leave the room
            socket.leave(disconnectedUser.roomId);
            
            // Remove user from the list
            onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
            
            // Notify room users about the update
            const roomUsers = onlineUsers.filter(user => user.roomId === disconnectedUser.roomId);
            io.to(disconnectedUser.roomId).emit("usersOnline", roomUsers);
            
            console.log(
                `User ${disconnectedUser.userId} disconnected from room ${disconnectedUser.roomId}. Room now has ${roomUsers.length} users`
            );
        } else {
            onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
            io.emit("usersOnline", onlineUsers);
            console.log(
                "A user disconnected with id: ",
                socket.id,
                " there are now ",
                onlineUsers.length,
                " online users"
            );
        }
    });

    /**
     * Handles incoming chat messages from clients.
     * Validates message content, determines the target room, and broadcasts the message
     * to all users in the same room. Automatically adds timestamp if not provided.
     * @event chat:message
     * @param {ChatMessagePayload} payload - Message payload containing user ID, message content, and optional metadata
     */
    socket.on("chat:message", (payload: ChatMessagePayload) => {
    const trimmedMessage = payload?.message?.trim();

    if (!trimmedMessage) {
      return;
    }

    const sender =
      onlineUsers.find(user => user.socketId === socket.id) ?? null;

    // Determine roomId: from payload, from sender, or use socket's current room
    const roomId = payload.roomId || sender?.roomId;
    
    if (!roomId) {
      console.log("Warning: Message sent without roomId");
      return;
    }

    const outgoingMessage = {
      userId: payload.userId || sender?.userId || socket.id,
      message: trimmedMessage,
      timestamp: payload.timestamp ?? new Date().toISOString(),
      roomId: roomId
    };

    // Send message only to users in the same room
    io.to(roomId).emit("chat:message", outgoingMessage);
    console.log(
      `Relayed chat message from ${outgoingMessage.userId} in room ${roomId}: ${outgoingMessage.message}`
    );
  });


});










