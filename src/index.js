import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import env from './config/env.js';
import { logger } from './config/logger.js';

let server;
let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Shutting down gracefully...`);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      logger.info('HTTP server closed.');
    }

    await disconnectDatabase();
    logger.info('Database connection closed.');
    process.exitCode = 0;
  } catch (error) {
    logger.error('Graceful shutdown failed:', error.message);
    process.exitCode = 1;
  }
};

const startServer = async () => {
  try {
    await connectDatabase();
    logger.info('Database connection established.');

    server = app.listen(env.PORT, () => {
      logger.info(`${env.APP_NAME} started on port ${env.PORT}`);
    });
  } catch (error) {
    logger.error('Database connection failed. Server will not start:', error.message);
    await disconnectDatabase();
    process.exitCode = 1;
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await startServer();

export { server };
