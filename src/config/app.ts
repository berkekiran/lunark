import { CorsOptions } from 'cors';

export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4545;

export const corsOptions: CorsOptions = {
  origin: process.env.APP_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-user-id'],
  maxAge: 600,
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
};

export const securityConfig = {
  bodyLimit: '2mb',
};

export const paths = {
  api: {
    root: '/api',
    admin: '/api/admin',
    chat: '/api/chat',
    message: '/api/message',
    status: '/api/status',
    task: '/api/task',
    document: '/api/document',
    graph: '/api/graph',
    usage: '/api/usage',
    payment: '/api/payment',
    user: '/api/user',
    history: '/api/history',
    contacts: '/contacts',
    waitlist: '/api/waitlist',
    health: '/health',
  },
};
