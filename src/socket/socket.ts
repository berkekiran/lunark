import { Server as SocketIOServer, Socket } from 'socket.io';

interface SocketData {
  userAddress?: string;
}

let ioInstance: SocketIOServer | null = null;

export function initSocket(io: SocketIOServer): void {
  ioInstance = io;

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Get userId from auth
    const userId = socket.handshake.auth?.userId;
    if (userId) {
      console.log(`Socket connected for user: ${userId}`);
    }

    socket.on('authenticate', ({ address }: { address: string }) => {
      const socketData = socket.data as SocketData;
      const normalizedAddress = address.toLowerCase();
      socketData.userAddress = normalizedAddress;
      socket.join(`user:${normalizedAddress}`);
      console.log(`✅ User authenticated and joined room: user:${normalizedAddress} (Socket ID: ${socket.id})`);
      socket.emit('authenticated', { success: true, address: normalizedAddress });
    });

    socket.on('joinChat', ({ chatId, userId }: { chatId: string; userId?: string }) => {
      socket.join(`chat:${chatId}`);
      console.log(`Socket ${socket.id} joined chat: ${chatId}`);
      socket.emit('joinedChat', { chatId });
    });

    socket.on('streamAbort', ({ chatId }: { chatId: string }) => {
      console.log(`Stream abort requested for chat: ${chatId}`);
      // Handle stream abort logic here if needed
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}

export function emitToUser(
  io: SocketIOServer,
  userAddress: string,
  event: string,
  data: any
): void {
  io.to(`user:${userAddress}`).emit(event, data);
}

export function emitToChat(io: SocketIOServer, chatId: string, event: string, data: any): void {
  io.to(`chat:${chatId}`).emit(event, data);
}
