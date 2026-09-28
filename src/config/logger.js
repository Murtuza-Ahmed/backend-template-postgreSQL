import morgan from 'morgan';
import env from './env.js';

const logFormat = env.NODE_ENV === 'production' ? 'combined' : 'dev';

const httpLogger = morgan(logFormat);

const logger = {
  info: (...args) => console.info('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
};

export { httpLogger, logger };
