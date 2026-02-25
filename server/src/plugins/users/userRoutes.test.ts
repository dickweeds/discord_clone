import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { setupApp, seedOwner, seedUserWithSession } from '../../test/helpers.js';

describe('GET /api/users', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
  });

  it('returns user list for authenticated user', async () => {
    await seedOwner(app);
    const { accessToken } = await seedUserWithSession(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.count).toBeGreaterThanOrEqual(2);
  });

  it('returns only safe fields — excludes sensitive data', async () => {
    await seedOwner(app);
    const { accessToken } = await seedUserWithSession(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = JSON.parse(response.payload);
    const user = body.data[0];
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('username');
    expect(user).toHaveProperty('role');
    expect(user).toHaveProperty('createdAt');
    expect(user).not.toHaveProperty('password_hash');
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('public_key');
    expect(user).not.toHaveProperty('publicKey');
    expect(user).not.toHaveProperty('encrypted_group_key');
    expect(user).not.toHaveProperty('encryptedGroupKey');
  });

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
