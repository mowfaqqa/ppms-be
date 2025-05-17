import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import { verifyToken } from "../utils/jwt.utils";
import logger from "../config/logger";

// Socket.io instance
let io: SocketIOServer;

// User socket mapping: userId -> socketId
const userSockets: Map<string, string[]> = new Map();

// Initialize WebSocket server
export const initializeSocketServer = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || "*",
      methods: ["GET", "POST"],
    },
  });

  // Authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication token is required"));
      }

      const decoded = verifyToken(token);

      // Attach user data to socket
      socket.data.user = {
        userId: decoded.userId,
        role: decoded.role,
      };

      next();
    } catch (error) {
      logger.error("Socket authentication error:", error);
      next(new Error("Authentication failed"));
    }
  });

  // Connection handler
  io.on("connection", (socket) => {
    const userId = socket.data.user.userId;

    logger.info(`User ${userId} connected to socket ${socket.id}`);

    // Add socket to user mapping
    if (userSockets.has(userId)) {
      userSockets.get(userId)?.push(socket.id);
    } else {
      userSockets.set(userId, [socket.id]);
    }

    // Handle joining rooms
    socket.on("join:project", (projectId: string) => {
      socket.join(`project:${projectId}`);
      logger.info(`User ${userId} joined room project:${projectId}`);
    });

    socket.on("join:task", (taskId: string) => {
      socket.join(`task:${taskId}`);
      logger.info(`User ${userId} joined room task:${taskId}`);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      logger.info(`User ${userId} disconnected from socket ${socket.id}`);

      // Remove socket from user mapping
      const userSocketIds = userSockets.get(userId) || [];
      const updatedSocketIds = userSocketIds.filter((id) => id !== socket.id);

      if (updatedSocketIds.length === 0) {
        userSockets.delete(userId);
      } else {
        userSockets.set(userId, updatedSocketIds);
      }
    });
  });

  logger.info("WebSocket server initialized");

  return io;
};

// Send notification to specific user
export const sendNotificationToUser = (userId: string, notification: any) => {
  if (!io) {
    logger.error("Socket.io not initialized");
    return;
  }

  const socketIds = userSockets.get(userId);

  if (socketIds && socketIds.length > 0) {
    socketIds.forEach((socketId) => {
      io.to(socketId).emit("notification", notification);
    });
    logger.info(`Notification sent to user ${userId}`);
  }
};

// Send update to project room
export const sendProjectUpdate = (
  projectId: string,
  updateType: string,
  data: any
) => {
  if (!io) {
    logger.error("Socket.io not initialized");
    return;
  }

  io.to(`project:${projectId}`).emit("project:update", {
    type: updateType,
    data,
  });

  logger.info(`Project update (${updateType}) sent to project:${projectId}`);
};

// Send update to task room
export const sendTaskUpdate = (
  taskId: string,
  updateType: string,
  data: any
) => {
  if (!io) {
    logger.error("Socket.io not initialized");
    return;
  }

  io.to(`task:${taskId}`).emit("task:update", {
    type: updateType,
    data,
  });

  logger.info(`Task update (${updateType}) sent to task:${taskId}`);
};

// Send message to project chat
export const sendProjectChatMessage = (
  projectId: string,
  message: {
    userId: string;
    userName: string;
    content: string;
    timestamp: Date;
  }
) => {
  if (!io) {
    logger.error("Socket.io not initialized");
    return;
  }

  io.to(`project:${projectId}`).emit("project:chat", message);

  logger.info(`Chat message sent to project:${projectId}`);
};

// Get current active users in a project room
export const getActiveProjectUsers = (projectId: string): number => {
  if (!io) {
    logger.error("Socket.io not initialized");
    return 0;
  }

  const room = io.sockets.adapter.rooms.get(`project:${projectId}`);
  return room ? room.size : 0;
};

export default {
  initializeSocketServer,
  sendNotificationToUser,
  sendProjectUpdate,
  sendTaskUpdate,
  sendProjectChatMessage,
  getActiveProjectUsers,
};
