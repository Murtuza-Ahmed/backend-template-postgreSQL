// Seed: creates the first admin account. Run with:  npx prisma db seed
// Credentials come from .env (ADMIN_EMAIL / ADMIN_PASSWORD) with safe defaults.
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "#src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.log(`Seed: admin ${email} already exists — skipping`);
} else {
  await prisma.user.create({
    data: {
      name: "Admin",
      email,
      password: await bcrypt.hash(password, 12),
      role: "admin",
      providers: ["local"],
      accountVerified: true,
    },
  });
  console.log(`Seed: admin created → ${email} / ${password}`);
  if (password === "ChangeMe123!") {
    console.warn("⚠️  Default admin password in use — change ADMIN_PASSWORD in .env and re-seed");
  }
}

await prisma.$disconnect();
