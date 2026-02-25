import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { setupApp, seedUserWithSession } from '../../test/helpers.js';
import { channels } from '../../db/schema.js';

describe('GET /api/channels', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
    // Seed channels
    app.db.insert(channels).values([
      { name: 'general', type: 'text' },
      { name: 'Gaming', type: 'voice' },
    ]).run();
  });

  it('returns channel list for authenticated user', async () => {
    const { accessToken } = await seedUserWithSession(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/channels',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.count).toBe(2);
    expect(body.data.some((c: { name: string; type: string }) => c.name === 'general' && c.type === 'text')).toBe(true);
    expect(body.data.some((c: { name: string; type: string }) => c.name === 'Gaming' && c.type === 'voice')).toBe(true);
  });

  it('returns channels with correct camelCase fields', async () => {
    const { accessToken } = await seedUserWithSession(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/channels',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = JSON.parse(response.payload);
    const channel = body.data[0];
    expect(channel).toHaveProperty('id');
    expect(channel).toHaveProperty('name');
    expect(channel).toHaveProperty('type');
    expect(channel).toHaveProperty('createdAt');
    expect(channel).not.toHaveProperty('created_at');
  });

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/channels',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
