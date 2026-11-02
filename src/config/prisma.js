import { PrismaClient } from "@prisma/client";
import logger from "#src/utils/logger.js";

// Singleton — one client per process. In dev, reuse across hot reloads
// so nodemon doesn't exhaust the connection pool.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

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
