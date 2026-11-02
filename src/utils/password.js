import bcrypt from "bcrypt";
import { env } from "#src/config/env.js";

export const hashPassword = (plain) => bcrypt.hash(plain, env.bcryptRounds);
export const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

// Strip secrets before a user object ever leaves the API.
export function safeUser(user) {
  if (!user) return user;
  const safe = { ...user };
  delete safe.password;
  delete safe.refreshTokenHash;
  delete safe.passwordResetTokenHash;
  return safe;
}
