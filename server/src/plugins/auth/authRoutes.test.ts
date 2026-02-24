import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';

vi.stubEnv('DATABASE_PATH', ':memory:');
vi.stubEnv('JWT_ACCESS_SECRET', 'test-secret-key-for-testing');

import { buildApp } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { hashPassword, generateAccessToken } from './authService.js';
import { users, invites, bans } from '../../db/schema.js';

async function setupApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  runMigrations(app.db);
  return app;
}

async function seedOwner(app: FastifyInstance): Promise<{ id: string; token: string }> {
  const passwordHash = await hashPassword('ownerPass123');
  const owner = app.db.insert(users).values({
    username: 'owner',
    password_hash: passwordHash,
    role: 'owner',
  }).returning().get();
  const token = generateAccessToken({ userId: owner.id, role: 'owner' });
  return { id: owner.id, token };
}

function seedInvite(app: FastifyInstance, createdBy: string, tokenValue = 'valid-invite-token'): string {
  app.db.insert(invites).values({
    token: tokenValue,
    created_by: createdBy,
  }).run();
  return tokenValue;
}

describe('authRoutes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('should register a user with a valid invite', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      seedInvite(app, ownerId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.username).toBe('jordan');
      expect(body.data.role).toBe('user');
      expect(body.data.id).toBeDefined();
      expect(body.data.createdAt).toBeDefined();
    });

    it('should return 400 INVALID_INVITE for invalid invite token', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'nonexistent-token',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INVITE');
    });

    it('should return 400 INVALID_INVITE for revoked invite token', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      seedInvite(app, ownerId, 'revoked-token');
      app.db.update(invites)
        .set({ revoked: true })
        .where(eq(invites.token, 'revoked-token'))
        .run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'revoked-token',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INVITE');
    });

    it('should return 409 USERNAME_TAKEN for duplicate username', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      seedInvite(app, ownerId);

      // Register first user
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      // Try to register with same username
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'differentpass123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('USERNAME_TAKEN');
    });

    it('should return 403 when banned user tries to register', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      seedInvite(app, ownerId);

      // Create a user and ban them
      const bannedHash = await hashPassword('banned123');
      const bannedUser = app.db.insert(users).values({
        username: 'banneduser',
        password_hash: bannedHash,
        role: 'user',
      }).returning().get();

      app.db.insert(bans).values({
        user_id: bannedUser.id,
        banned_by: ownerId,
      }).run();

      // Try to register with the banned username
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'banneduser',
          password: 'newpassword123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('REGISTRATION_BLOCKED');
    });

    it('should return 400 for missing fields', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and return access token', async () => {
      app = await setupApp();
      await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'owner',
          password: 'ownerPass123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.user.username).toBe('owner');
      expect(body.data.user.role).toBe('owner');
    });

    it('should return 401 for wrong password', async () => {
      app = await setupApp();
      await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'owner',
          password: 'wrongPassword',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 401 for nonexistent user', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'nobody',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 403 for banned user', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);

      // Create and ban a user
      const userHash = await hashPassword('userpass123');
      const regularUser = app.db.insert(users).values({
        username: 'banneduser',
        password_hash: userHash,
        role: 'user',
      }).returning().get();

      app.db.insert(bans).values({
        user_id: regularUser.id,
        banned_by: ownerId,
      }).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'banneduser',
          password: 'userpass123',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('ACCOUNT_BANNED');
    });
  });
});
