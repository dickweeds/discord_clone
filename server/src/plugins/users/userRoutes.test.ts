import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { setupApp, seedOwner, seedRegularUser, seedUserWithSession } from '../../test/helpers.js';

describe('userRoutes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns users with safe fields only', async () => {
    app = await setupApp();
    await seedOwner(app);
    await seedRegularUser(app, 'member-a');
    const { accessToken } = await seedUserWithSession(app, 'member-b');

    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.count).toBeGreaterThanOrEqual(3);

    const first = body.data[0] as Record<string, unknown>;
    expect(first.id).toBeDefined();
    expect(first.username).toBeDefined();
    expect(first.role).toBeDefined();
    expect(first.createdAt).toBeDefined();
    expect(first.passwordHash).toBeUndefined();
    expect(first.password_hash).toBeUndefined();
    expect(first.publicKey).toBeUndefined();
    expect(first.public_key).toBeUndefined();
    expect(first.encryptedGroupKey).toBeUndefined();
    expect(first.encrypted_group_key).toBeUndefined();
  });

  it('returns 401 without auth', async () => {
    app = await setupApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });
});
