import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { setupApp, seedUserWithSession } from '../../test/helpers.js';
import { channels } from '../../db/schema.js';

describe('channelRoutes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns channels for authenticated users', async () => {
    app = await setupApp();
    const { accessToken } = await seedUserWithSession(app);
    app.db.insert(channels).values([
      { name: 'general', type: 'text' },
      { name: 'Gaming', type: 'voice' },
    ]).run();

    const response = await app.inject({
      method: 'GET',
      url: '/api/channels',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.count).toBeGreaterThanOrEqual(2);
    expect(body.data.some((c: { name: string; type: string }) => c.name === 'general' && c.type === 'text')).toBe(true);
    expect(body.data.some((c: { name: string; type: string }) => c.name === 'Gaming' && c.type === 'voice')).toBe(true);
  });

  it('returns 401 without auth', async () => {
    app = await setupApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/channels',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });
});
