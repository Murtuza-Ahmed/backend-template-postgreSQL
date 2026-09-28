import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import prisma from '../../src/config/database.js';

describe('database architecture', () => {
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.rolePermission.deleteMany(),
      prisma.userRole.deleteMany(),
      prisma.user.deleteMany(),
      prisma.role.deleteMany(),
      prisma.permission.deleteMany(),
    ]);
  });

  afterEach(async () => {
    await prisma.$transaction([
      prisma.rolePermission.deleteMany(),
      prisma.userRole.deleteMany(),
      prisma.user.deleteMany(),
      prisma.role.deleteMany(),
      prisma.permission.deleteMany(),
    ]);
  });

  it('creates a user', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Test User',
        email: 'test.user@example.com',
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
      },
    });

    expect(user).to.include({
      name: 'Test User',
      email: 'test.user@example.com',
      status: 'ACTIVE',
    });
    expect(user.id).to.be.a('string');
  });

  it('creates a role', async () => {
    const role = await prisma.role.create({
      data: {
        name: 'ADMIN',
        description: 'Administrator role',
      },
    });

    expect(role).to.include({
      name: 'ADMIN',
      description: 'Administrator role',
    });
    expect(role.id).to.be.a('string');
  });

  it('creates a permission', async () => {
    const permission = await prisma.permission.create({
      data: {
        name: 'USER_READ',
        description: 'Read users',
      },
    });

    expect(permission).to.include({
      name: 'USER_READ',
      description: 'Read users',
    });
    expect(permission.id).to.be.a('string');
  });

  it('assigns a role to a user and rejects duplicates', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Role User',
        email: 'role.user@example.com',
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
      },
    });

    const role = await prisma.role.create({
      data: {
        name: 'USER',
        description: 'Standard user role',
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
      },
    });

    try {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });
      throw new Error('Expected duplicate user-role assignment to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect(String(error.message)).to.match(/Unique|duplicate|P2002|already exists/i);
    }
  });

  it('assigns a permission to a role and rejects duplicates', async () => {
    const role = await prisma.role.create({
      data: {
        name: 'ADMIN',
        description: 'Administrator role',
      },
    });

    const permission = await prisma.permission.create({
      data: {
        name: 'ROLE_READ',
        description: 'Read roles',
      },
    });

    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });

    try {
      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
      throw new Error('Expected duplicate role-permission assignment to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect(String(error.message)).to.match(/Unique|duplicate|P2002|already exists/i);
    }
  });

  it('retrieves user and role relationships through join tables', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Relationship User',
        email: 'relationship.user@example.com',
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
      },
    });

    const role = await prisma.role.create({
      data: {
        name: 'SUPER_ADMIN',
        description: 'Super administrator role',
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
      },
    });

    const userWithRoles = await prisma.user.findUnique({
      where: { id: user.id },
      include: { roles: { include: { role: true } } },
    });

    expect(userWithRoles.roles).to.have.lengthOf(1);
    expect(userWithRoles.roles[0].role.name).to.equal('SUPER_ADMIN');

    const roleWithUsers = await prisma.role.findUnique({
      where: { id: role.id },
      include: { users: { include: { user: true } } },
    });

    expect(roleWithUsers.users).to.have.lengthOf(1);
    expect(roleWithUsers.users[0].user.email).to.equal('relationship.user@example.com');
  });

  it('retrieves role and permission relationships through join tables', async () => {
    const role = await prisma.role.create({
      data: {
        name: 'ADMIN',
        description: 'Administrator role',
      },
    });

    const permission = await prisma.permission.create({
      data: {
        name: 'PERMISSION_MANAGE',
        description: 'Manage permissions',
      },
    });

    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });

    const roleWithPermissions = await prisma.role.findUnique({
      where: { id: role.id },
      include: { permissions: { include: { permission: true } } },
    });

    expect(roleWithPermissions.permissions).to.have.lengthOf(1);
    expect(roleWithPermissions.permissions[0].permission.name).to.equal('PERMISSION_MANAGE');

    const permissionWithRoles = await prisma.permission.findUnique({
      where: { id: permission.id },
      include: { roles: { include: { role: true } } },
    });

    expect(permissionWithRoles.roles).to.have.lengthOf(1);
    expect(permissionWithRoles.roles[0].role.name).to.equal('ADMIN');
  });
});
