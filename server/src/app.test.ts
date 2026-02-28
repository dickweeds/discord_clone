import { describe, it, expect, afterEach, vi } from 'vitest';
import { type FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

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

    // Trigger onReady hooks (including SELECT 1 health check) before mocking
    await app.ready();

    // Replace db.execute with a function that throws to simulate DB failure
    const originalExecute = app.db.execute;
    app.db.execute = (() => { throw new Error('DB connection lost'); }) as unknown as typeof originalExecute;

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unreachable' },
    });

    app.db.execute = originalExecute;
  });
});
