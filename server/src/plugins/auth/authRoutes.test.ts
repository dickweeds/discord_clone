import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { setupApp, seedOwner, seedInvite } from '../../test/helpers.js';
import { hashPassword } from './authService.js';
import { users, bans, invites } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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
      expect(body.data.user.username).toBe('jordan');
      expect(body.data.user.role).toBe('user');
      expect(body.data.user.id).toBeDefined();
      expect(body.data.user.createdAt).toBeDefined();
    });

    it('should normalize username by trimming and lowercasing', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      seedInvite(app, ownerId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: '  Jordan  ',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.user.username).toBe('jordan');
    });

    it('should revoke invite token after successful registration', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      seedInvite(app, ownerId);

      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      // Verify invite is now revoked
      const invite = app.db.select().from(invites)
        .where(eq(invites.token, 'valid-invite-token')).get();
      expect(invite!.revoked).toBe(true);

      // Trying to use the same invite again should fail
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'anotheruser',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INVITE');
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
      seedInvite(app, ownerId, 'invite-1');
      seedInvite(app, ownerId, 'invite-2');

      // Register first user (revokes invite-1)
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'invite-1',
        },
      });

      // Try to register with same username using invite-2
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'differentpass123',
          inviteToken: 'invite-2',
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

    it('should return 400 for password exceeding 72 characters', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      seedInvite(app, ownerId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'a'.repeat(73),
          inviteToken: 'valid-invite-token',
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
