import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.ts';
import env from './env.js';

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

const prisma = globalThis.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

const connectDatabase = async () => {
  await prisma.$connect();
  await checkDatabaseConnection();
};

const disconnectDatabase = async () => {
  await prisma.$disconnect();
};

const checkDatabaseConnection = async () => {
  await prisma.$queryRaw`SELECT 1`;
};

export {
  checkDatabaseConnection,
  connectDatabase,
  disconnectDatabase,
};

export default prisma;