import { prisma } from "#src/config/prisma.js";
import { ApiError } from "#src/utils/ApiError.js";
import { hashPassword, safeUser } from "#src/utils/password.js";

// ── self ─────────────────────────────────────────────

export async function getMe(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found");
  return safeUser(user);
}

export async function updateMe(userId, { name, phone, avatarUrl }) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
    },
  }).catch((err) => {
    if (err.code === "P2025") throw ApiError.notFound("User not found");
    throw err;
  });
  return safeUser(user);
}

// ── admin ────────────────────────────────────────────

export async function listUsers({ page = 1, limit = 20, search = "" }) {
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { items: items.map(safeUser), total, page, limit, pages: Math.ceil(total / limit) };
}

export async function adminCreateUser({ name, email, phone, password, role }) {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw ApiError.conflict("An account with this email already exists");

  // Admin-created accounts skip the email gate — the admin vouches for them.
  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      password: await hashPassword(password),
      role,
      providers: ["local"],
      accountVerified: true,
    },
  });
  return safeUser(user);
}

export async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound("User not found");
  return safeUser(user);
}

export async function adminUpdateUser(id, updates, actorId) {
  if (id === actorId.toString() && updates.role && updates.role !== "admin") {
    throw ApiError.badRequest("You cannot demote yourself");
  }
  const data = {};
  for (const key of ["name", "phone", "role", "isActive"]) {
    if (updates[key] !== undefined) data[key] = updates[key];
  }
  if (updates.isActive === false) data.refreshTokenHash = null; // kick them out

  try {
    const user = await prisma.user.update({ where: { id }, data });
    return safeUser(user);
  } catch (err) {
    if (err.code === "P2025") throw ApiError.notFound("User not found");
    throw err;
  }
}

export async function adminDeleteUser(id, actorId) {
  if (id === actorId.toString()) throw ApiError.badRequest("You cannot delete yourself");
  try {
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    if (err.code === "P2025") throw ApiError.notFound("User not found");
    throw err;
  }
  return { message: "User deleted" };
}
