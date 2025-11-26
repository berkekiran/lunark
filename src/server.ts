import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { corsOptions, securityConfig, paths } from './config/app';
import { adminRoutes } from './routes/admin';
import { statusRoutes } from './routes/status';
import { userRoutes } from './routes/user';
import { contactsRoutes } from './routes/contacts';
import { historyRoutes } from './routes/history';
import { chatRoutes } from './routes/chat';
import { messageRoutes } from './routes/message';
import usageRoutes from './routes/usage';
import paymentRoutes from './routes/payment';
import blockchainRoutes from './routes/blockchain';
import { waitlistRoutes } from './routes/waitlist';
import { initSocket } from './socket/socket';
import { errorHandler, notFoundHandler } from './middleware/error';

export class HTTPServer {
  public app: Application;
  public server: any;
  public io: SocketIOServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: corsOptions,
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocket();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors(corsOptions));
    this.app.use(hpp());
    this.app.use(express.json({ limit: securityConfig.bodyLimit }));
    this.app.use(express.urlencoded({ extended: true, limit: securityConfig.bodyLimit }));

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Too many requests from this IP',
    });
    this.app.use(limiter);
  }

  private setupRoutes(): void {
    this.app.get(paths.api.health, (req, res) => {
      res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    this.app.use(paths.api.admin, adminRoutes);
    this.app.use(paths.api.status, statusRoutes);
    this.app.use(paths.api.user, userRoutes);
    this.app.use(paths.api.contacts, contactsRoutes);
    this.app.use(paths.api.history, historyRoutes);
    this.app.use(paths.api.chat, chatRoutes);
    this.app.use(paths.api.message, messageRoutes);
    this.app.use(paths.api.usage, usageRoutes);
    this.app.use(paths.api.payment, paymentRoutes);
    this.app.use(paths.api.waitlist, waitlistRoutes);
    this.app.use('/api', blockchainRoutes);

    // Error handlers (must be last)
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  private setupSocket(): void {
    initSocket(this.io);
  }

  public listen(port: number): void {
    this.server.listen(port, () => {
      console.log(`🚀 Lunark AI server running on port ${port}`);
      console.log(`📡 Socket.IO server ready`);
    });
  }

  public async close(): Promise<void> {
    return new Promise(resolve => {
      this.server.close(() => {
        console.log('Server closed');
        resolve();
      });
    });
  }
}
