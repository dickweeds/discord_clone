import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.stubEnv('DATABASE_PATH', ':memory:');
vi.stubEnv('JWT_ACCESS_SECRET', 'test-secret-key-for-testing');
vi.stubEnv('SERVER_NAME', 'Test Server');

import { buildApp } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { hashPassword, generateAccessToken } from '../auth/authService.js';
import { users } from '../../db/schema.js';

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

async function seedRegularUser(app: FastifyInstance): Promise<{ id: string; token: string }> {
  const passwordHash = await hashPassword('userPass123');
  const user = app.db.insert(users).values({
    username: 'regular',
    password_hash: passwordHash,
    role: 'user',
  }).returning().get();
  const token = generateAccessToken({ userId: user.id, role: 'user' });
  return { id: user.id, token };
}

describe('inviteRoutes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('POST /api/invites', () => {
    it('should create invite with owner token', async () => {
      app = await setupApp();
      const { token: ownerToken } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.id).toBeDefined();
      expect(body.data.token).toBeDefined();
      expect(body.data.token.length).toBe(43); // base64url of 32 bytes
      expect(body.data.createdAt).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 with non-owner token', async () => {
      app = await setupApp();
      await seedOwner(app);
      const { token: userToken } = await seedRegularUser(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });
  });

  describe('DELETE /api/invites/:id', () => {
    it('should revoke invite with owner token', async () => {
      app = await setupApp();
      const { token: ownerToken } = await seedOwner(app);

      // Create invite first
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const inviteId = createRes.json().data.id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invites/${inviteId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 403 with non-owner token', async () => {
      app = await setupApp();
      await seedOwner(app);
      const { token: userToken } = await seedRegularUser(app);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/invites/some-id',
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/invites/:token/validate', () => {
    it('should validate a valid invite token', async () => {
      app = await setupApp();
      const { token: ownerToken } = await seedOwner(app);

      // Create invite
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const inviteToken = createRes.json().data.token;

      const response = await app.inject({
        method: 'GET',
        url: `/api/invites/${inviteToken}/validate`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.valid).toBe(true);
      expect(body.data.serverName).toBe('Test Server');
    });

    it('should return 400 for invalid token', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites/nonexistent-token/validate',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INVITE');
    });

    it('should return 400 for revoked invite', async () => {
      app = await setupApp();
      const { token: ownerToken } = await seedOwner(app);

      // Create and revoke invite
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const inviteId = createRes.json().data.id;
      const inviteToken = createRes.json().data.token;

      await app.inject({
        method: 'DELETE',
        url: `/api/invites/${inviteId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/invites/${inviteToken}/validate`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INVITE');
    });
  });

  describe('GET /api/invites', () => {
    it('should list all invites with owner token', async () => {
      app = await setupApp();
      const { token: ownerToken } = await seedOwner(app);

      // Create two invites
      await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.count).toBe(2);
    });

    it('should return 401 without auth', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
