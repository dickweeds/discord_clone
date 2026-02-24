import { describe, it, expect, afterEach, vi } from 'vitest';
import { type FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { buildApp } from './app.js';

describe('Server App', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('should return health check response with database status', async () => {
    app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { status: 'ok', database: 'connected' } });
  });

  it('should return 503 when database is unreachable', async () => {
    app = await buildApp();

    // Replace db.get with a function that throws to simulate DB failure
    const originalGet = app.db.get;
    app.db.get = (() => { throw new Error('DB connection lost'); }) as typeof originalGet;

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unreachable' },
    });

    app.db.get = originalGet;
  });
});
