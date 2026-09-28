import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

const roles = [
  { name: 'SUPER_ADMIN', description: 'Full platform access' },
  { name: 'ADMIN', description: 'Administrator access for platform management' },
  { name: 'USER', description: 'Standard application user' },
];

const permissions = [
  { name: 'USER_READ', description: 'Read user records' },
  { name: 'USER_CREATE', description: 'Create user records' },
  { name: 'USER_UPDATE', description: 'Update user records' },
  { name: 'USER_DELETE', description: 'Delete user records' },
  { name: 'ROLE_READ', description: 'Read roles' },
  { name: 'ROLE_CREATE', description: 'Create roles' },
  { name: 'ROLE_UPDATE', description: 'Update roles' },
  { name: 'ROLE_DELETE', description: 'Delete roles' },
  { name: 'PERMISSION_READ', description: 'Read permissions' },
  { name: 'PERMISSION_MANAGE', description: 'Create and manage permissions' },
];

const rolePermissionMap = {
  SUPER_ADMIN: permissions.map((permission) => permission.name),
  ADMIN: [
    'USER_READ',
    'USER_CREATE',
    'USER_UPDATE',
    'USER_DELETE',
    'ROLE_READ',
    'ROLE_CREATE',
    'ROLE_UPDATE',
    'ROLE_DELETE',
    'PERMISSION_READ',
  ],
  USER: ['USER_READ', 'ROLE_READ', 'PERMISSION_READ'],
};

const seedDatabase = async () => {
  await prisma.systemSetting.upsert({
    where: { key: 'app.name' },
    update: {},
    create: {
      key: 'app.name',
      value: 'backend-template',
    },
  });

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: { description: permission.description },
      create: permission,
    });
  }

  const storedRoles = await prisma.role.findMany({
    select: { id: true, name: true },
  });
  const storedPermissions = await prisma.permission.findMany({
    select: { id: true, name: true },
  });

  for (const [roleName, permissionNames] of Object.entries(rolePermissionMap)) {
    const role = storedRoles.find((entry) => entry.name === roleName);

    if (!role) continue;

    const permissionIds = permissionNames
      .map((permissionName) => {
        const permission = storedPermissions.find((entry) => entry.name === permissionName);
        return permission ? permission.id : null;
      })
      .filter(Boolean);

    if (permissionIds.length === 0) continue;

    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }

  console.log('Seed completed successfully.');
};

try {
  await seedDatabase();
} catch (error) {
  console.error('Seed failed', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

