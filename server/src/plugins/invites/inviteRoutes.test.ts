import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
});
vi.stubEnv('DATABASE_PATH', ':memory:');
vi.stubEnv('SERVER_NAME', 'Test Server');

import { setupApp, seedOwner, seedRegularUser } from '../../test/helpers.js';

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

    it('should return 404 for non-existent invite', async () => {
      app = await setupApp();
      const { token: ownerToken } = await seedOwner(app);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/invites/non-existent-id',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('INVITE_NOT_FOUND');
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
