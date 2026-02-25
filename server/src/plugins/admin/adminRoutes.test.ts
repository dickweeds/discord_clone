import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { setupApp, seedOwner, seedRegularUser, seedInvite } from '../../test/helpers.js';
import { bans } from '../../db/schema.js';
import { verifyPassword } from '../auth/authService.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

describe('adminRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
  });

  describe('POST /api/admin/kick/:userId', () => {
    it('returns 204 with owner token', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/kick/${user.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 403 with non-owner token', async () => {
      const user = await seedRegularUser(app);
      const user2 = await seedRegularUser(app, 'regular2');

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/kick/${user2.id}`,
        headers: { authorization: `Bearer ${user.token}` },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 400 when owner tries to kick themselves', async () => {
      const owner = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/kick/${owner.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('INVALID_ACTION');
    });

    it('returns 404 for non-existent user', async () => {
      const owner = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/kick/non-existent-id',
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/admin/ban/:userId', () => {
    it('returns 204 with owner token', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/ban/${user.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 403 with non-owner token', async () => {
      const user = await seedRegularUser(app);
      const user2 = await seedRegularUser(app, 'regular2');

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/ban/${user2.id}`,
        headers: { authorization: `Bearer ${user.token}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 400 when owner tries to ban themselves', async () => {
      const owner = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/ban/${owner.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('INVALID_ACTION');
    });

    it('returns 404 for non-existent user', async () => {
      const owner = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/ban/non-existent-id',
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 when user is already banned', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);

      // Ban the user first
      await app.inject({
        method: 'POST',
        url: `/api/admin/ban/${user.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      // Try to ban again
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/ban/${user.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('ALREADY_BANNED');
    });

    it('banned user cannot login', async () => {
      const owner = await seedOwner(app);
      await seedRegularUser(app);

      // Ban the user via admin route
      const usersResult = app.db.select().from(users).where(eq(users.username, 'regular')).get();
      await app.inject({
        method: 'POST',
        url: `/api/admin/ban/${usersResult!.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      // Try to login as banned user
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'regular', password: 'userPass123' },
      });

      expect(loginResponse.statusCode).toBe(403);
      const body = JSON.parse(loginResponse.payload);
      expect(body.error.code).toBe('ACCOUNT_BANNED');
    });

    it('banned user cannot register with same username', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);
      const inviteToken = seedInvite(app, owner.id);

      // Ban the user
      await app.inject({
        method: 'POST',
        url: `/api/admin/ban/${user.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      // Try to register with the banned username
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { username: 'regular', password: 'newPass12345', inviteToken },
      });

      expect(registerResponse.statusCode).toBe(403);
      const body = JSON.parse(registerResponse.payload);
      expect(body.error.code).toBe('REGISTRATION_BLOCKED');
    });
  });

  describe('POST /api/admin/unban/:userId', () => {
    it('returns 204 with owner token', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);

      // Ban the user first
      app.db.insert(bans).values({ user_id: user.id, banned_by: owner.id }).run();

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/unban/${user.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 403 with non-owner token', async () => {
      const user = await seedRegularUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/unban/${user.id}`,
        headers: { authorization: `Bearer ${user.token}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 for non-existent ban', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/unban/${user.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/admin/reset-password/:userId', () => {
    it('returns 200 and temporaryPassword with owner token', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/reset-password/${user.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.temporaryPassword).toBeTruthy();
      expect(typeof body.data.temporaryPassword).toBe('string');

      // Verify the temporary password actually works
      const updatedUser = app.db.select().from(users).where(eq(users.id, user.id)).get();
      const isValid = await verifyPassword(body.data.temporaryPassword, updatedUser!.password_hash);
      expect(isValid).toBe(true);
    });

    it('returns 403 with non-owner token', async () => {
      const user = await seedRegularUser(app);
      const user2 = await seedRegularUser(app, 'regular2');

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/reset-password/${user2.id}`,
        headers: { authorization: `Bearer ${user.token}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 400 when owner tries to reset own password', async () => {
      const owner = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/reset-password/${owner.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('INVALID_ACTION');
    });

    it('returns 404 for non-existent user', async () => {
      const owner = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/reset-password/non-existent-id',
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/admin/bans', () => {
    it('returns ban list with owner token', async () => {
      const owner = await seedOwner(app);
      const user1 = await seedRegularUser(app, 'banned1');
      const user2 = await seedRegularUser(app, 'banned2');

      app.db.insert(bans).values([
        { user_id: user1.id, banned_by: owner.id },
        { user_id: user2.id, banned_by: owner.id },
      ]).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/bans',
        headers: { authorization: `Bearer ${owner.token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.count).toBe(2);
      expect(body.data.some((b: { username: string }) => b.username === 'banned1')).toBe(true);
      expect(body.data.some((b: { username: string }) => b.username === 'banned2')).toBe(true);
    });

    it('returns 403 with non-owner token', async () => {
      const user = await seedRegularUser(app);

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/bans',
        headers: { authorization: `Bearer ${user.token}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
