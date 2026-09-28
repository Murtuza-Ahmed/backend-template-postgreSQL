# Backend Template

A production-oriented Node.js + Express backend foundation for building secure and scalable REST APIs.

## Phase 1 — Foundation

This phase establishes the project bootstrap, centralized environment handling, Express app startup, health checks, and graceful shutdown behavior.

### Included

- Express application bootstrap
- Centralized configuration with fail-fast validation
- Health check endpoint
- Graceful shutdown hooks
- Security headers and CORS support
- Basic structured logging setup
- Clean project scripts for local startup

### Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Then visit:

- http://localhost:5000/
- http://localhost:5000/health

### Notes

- The configuration layer is the only place that reads environment variables.
- Missing required values stop the application at startup with a clear error.
- This repository intentionally keeps authentication, RBAC, and business modules out of the foundation phases.

## Database Setup

This project uses PostgreSQL through Prisma 7. Install PostgreSQL locally and create the development database before starting the API.

1. Install PostgreSQL.
2. Create a database, for example `backend_template_dev`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` to the PostgreSQL connection string.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Generate the Prisma client:

   ```bash
   npm run prisma:generate
   ```

6. Create and apply the development migration:

   ```bash
   npm run prisma:migrate -- --name init
   ```

7. Run the idempotent seed:

   ```bash
   npm run prisma:seed
   ```

8. Start the development server:

   ```bash
   npm run dev
   ```

9. Verify application health at `http://localhost:5000/health`.
10. Verify PostgreSQL readiness at `http://localhost:5000/health/ready`.

The API does not start when PostgreSQL is unavailable. Prisma Studio is available with:

```bash
npm run prisma:studio
```

## Database Architecture

This template uses PostgreSQL with Prisma as the data-access layer. The current domain model keeps the foundation simple and reusable while preparing for future user and RBAC features.

```text
User
 │
 ▼
UserRole
 │
 ▼
Role
 │
 ▼
RolePermission
 │
 ▼
Permission
```

### Models

- `User`: stores the core account record, including `name`, unique `email`, `passwordHash`, `status`, and optional verification/login timestamps.
- `Role`: defines reusable application roles such as `SUPER_ADMIN`, `ADMIN`, and `USER`.
- `Permission`: defines generic permissions such as `USER_READ`, `ROLE_CREATE`, and `PERMISSION_MANAGE`.
- `UserRole`: explicit many-to-many join table linking users to roles.
- `RolePermission`: explicit many-to-many join table linking roles to permissions.
- `SystemSetting`: keeps the project’s existing configuration key/value records intact.

### Relationships

- `User ↔ Role` is modeled through `UserRole`.
- `Role ↔ Permission` is modeled through `RolePermission`.
- The join tables are explicit and enforce uniqueness with composite primary keys, preventing duplicate assignments.

### Migration and seed workflow

```bash
npx prisma validate
npx prisma generate
npx prisma migrate dev --name <migration_name>
npx prisma db seed
```

The seed is idempotent and creates the default roles and permissions without creating any admin user account or authentication credentials.

> Authentication, authorization, JWT, refresh tokens, OTP, email verification, and password reset are planned for later phases and are intentionally not implemented in this repository state.

## Error Handling

The application uses a centralized error pipeline for controllers and services:

- `ApiError` represents expected application errors with a status, code, and optional details.
- `asyncHandler` forwards rejected async controller promises to Express error middleware.
- The global error middleware maps `ApiError`, Zod validation errors, and common Prisma errors to safe responses.
- `error-codes.js` contains reusable application-level error codes.

Error responses use this format:

```json
{
  "success": false,
  "message": "Resource not found",
  "code": "RESOURCE_NOT_FOUND",
  "details": null
}
```

For example, a controller can throw an application error without formatting the response itself:

```js
throw new ApiError(404, 'Resource not found', 'RESOURCE_NOT_FOUND');
```

In development, unexpected errors are logged with useful diagnostic information after sensitive values are redacted. In production, clients receive generic safe messages and never receive stack traces, credentials, database URLs, tokens, or other internal details.
