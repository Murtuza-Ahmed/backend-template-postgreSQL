import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import { checkDatabaseConnection } from './config/database.js';
import { httpLogger, logger } from './config/logger.js';
import {
  errorMiddleware,
  notFoundHandler,
} from './middlewares/error.middleware.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(httpLogger);

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    environment: env.NODE_ENV,
    uptime: process.uptime(),
  });
});

app.get('/health/ready', async (_req, res) => {
  try {
    await checkDatabaseConnection();

    res.status(200).json({
      success: true,
      status: 'ready',
      database: 'connected',
    });
  } catch (error) {
    logger.error('Database readiness check failed:', error.message);

    res.status(503).json({
      success: false,
      status: 'not_ready',
      database: 'disconnected',
    });
  }
});

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Backend template is running.',
    app: env.APP_NAME,
    environment: env.NODE_ENV,
  });
});

app.use(notFoundHandler);
app.use(errorMiddleware);

export default app;
