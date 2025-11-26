import 'dotenv/config';
import { HTTPServer } from './server';
import { PORT } from './config/app';
import db from './db/client';

const server = new HTTPServer();

const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');

  try {
    await server.close();
    await db.$disconnect();
    console.log('✅ Cleanup complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  shutdown();
});

server.listen(PORT);
