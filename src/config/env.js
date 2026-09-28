import dotenv from 'dotenv';

dotenv.config();

function requiredEnv(name) {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),
  APP_NAME: process.env.APP_NAME || 'backend-template',

  DATABASE_URL: requiredEnv('DATABASE_URL'),

  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
};

export default env;
