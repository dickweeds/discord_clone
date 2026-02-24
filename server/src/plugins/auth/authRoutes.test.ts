import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { setupApp, seedOwner, seedInvite } from '../../test/helpers.js';
import { hashPassword, generateRefreshToken, hashToken } from './authService.js';
import { users, bans, invites, sessions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

async function loginUser(app: FastifyInstance, username: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  return response.json().data;
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
    it('should login with valid credentials and return access + refresh tokens', async () => {
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
      expect(body.data.refreshToken).toBeDefined();
      expect(body.data.user.username).toBe('owner');
      expect(body.data.user.role).toBe('owner');
    });

    it('should normalize username on login (trim + lowercase)', async () => {
      app = await setupApp();
      await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: '  Owner  ',
          password: 'ownerPass123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.user.username).toBe('owner');
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

    it('should return 403 for banned user (ban checked before password)', async () => {
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

    it('should create a session in the database on login', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');
      const tokenHash = hashToken(loginData.refreshToken);

      const session = app.db.select().from(sessions)
        .where(eq(sessions.refresh_token_hash, tokenHash)).get();
      expect(session).toBeDefined();
      expect(session!.user_id).toBe(loginData.user.id);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return new token pair with valid refresh token', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: loginData.refreshToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
      // New tokens should be different from old ones
      expect(body.data.refreshToken).not.toBe(loginData.refreshToken);
    });

    it('should rotate tokens (old refresh token becomes invalid after use)', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');
      const oldRefreshToken = loginData.refreshToken;

      // First refresh should succeed
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: oldRefreshToken },
      });
      expect(response1.statusCode).toBe(200);

      // Second refresh with the same (old) token should fail
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: oldRefreshToken },
      });
      expect(response2.statusCode).toBe(401);
      expect(response2.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should return 401 for invalid refresh token', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'not-a-valid-jwt' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should return 401 for expired session', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);

      // Create a refresh token and session manually with expired date
      const refreshToken = generateRefreshToken({ userId: ownerId, role: 'owner' });
      const tokenHash = hashToken(refreshToken);
      app.db.insert(sessions).values({
        user_id: ownerId,
        refresh_token_hash: tokenHash,
        expires_at: new Date(Date.now() - 1000), // expired
      }).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should not require auth middleware (public route)', async () => {
      app = await setupApp();

      // Call refresh without Authorization header — should get 401 from our handler, not from middleware
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'some-token' },
      });

      // Should get INVALID_REFRESH_TOKEN (our endpoint), not UNAUTHORIZED (middleware)
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should return 400 for missing refreshToken field', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 204 and delete the session', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${loginData.accessToken}` },
        payload: { refreshToken: loginData.refreshToken },
      });

      expect(response.statusCode).toBe(204);

      // Verify session was deleted
      const tokenHash = hashToken(loginData.refreshToken);
      const session = app.db.select().from(sessions)
        .where(eq(sessions.refresh_token_hash, tokenHash)).get();
      expect(session).toBeUndefined();
    });

    it('should return 204 even if session not found (idempotent)', async () => {
      app = await setupApp();
      const { token: ownerToken } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { refreshToken: 'nonexistent-refresh-token-value' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 401 without auth (requires access token)', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refreshToken: 'some-token' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('should invalidate the refresh token after logout', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');

      // Logout
      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${loginData.accessToken}` },
        payload: { refreshToken: loginData.refreshToken },
      });

      // Try to refresh with the now-deleted session's token
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: loginData.refreshToken },
      });

      expect(refreshResponse.statusCode).toBe(401);
      expect(refreshResponse.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });
});
