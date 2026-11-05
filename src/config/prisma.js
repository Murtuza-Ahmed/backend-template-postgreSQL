import { PrismaClient } from "#src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import logger from "#src/utils/logger.js";

// Prisma 7 requires a driver adapter — the connection string is passed
// here, not to the PrismaClient constructor. (server.js loads env.js
// first, so DATABASE_URL is already available at module load.)
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Singleton — one client per process. In dev, reuse across hot reloads
// so nodemon doesn't exhaust the connection pool.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function connectDB() {
  try {
    await prisma.$connect();
    logger.info("✅ PostgreSQL connected");
  } catch (err) {
    logger.error("❌ PostgreSQL connection failed:", err.message);
    process.exit(1);
  }
}
