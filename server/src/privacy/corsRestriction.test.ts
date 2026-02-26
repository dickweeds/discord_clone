import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { CORS_ORIGIN } from '../config/corsConfig.js';

/**
 * CORS Restriction: Verifies that CORS is restricted to configured client origin
 * and rejects requests from unknown origins.
 *
 * Uses the shared CORS_ORIGIN config from server/src/config/corsConfig.ts
 * so this test validates the actual app configuration, not an independent copy.
 */

describe('CORS Origin Restriction', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cors, {
      origin: CORS_ORIGIN,
      credentials: true,
    });
    app.get('/api/test', async () => ({ data: { ok: true } }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows requests from configured client origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test',
      headers: { origin: CORS_ORIGIN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(CORS_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not reflect unknown origins in CORS headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test',
      headers: { origin: 'https://evil-site.com' },
    });

    // @fastify/cors with a string origin always returns the configured origin,
    // never reflecting the requesting origin. The browser compares this header
    // against its own origin and blocks the response if they don't match.
    const allowOrigin = response.headers['access-control-allow-origin'];
    expect(allowOrigin).not.toBe('https://evil-site.com');
    expect(allowOrigin).toBe(CORS_ORIGIN);
  });

  it('handles preflight OPTIONS requests correctly for allowed origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/test',
      headers: {
        origin: CORS_ORIGIN,
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(CORS_ORIGIN);
  });

  it('does not reflect unknown origins in preflight response', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/test',
      headers: {
        origin: 'https://malicious.com',
        'access-control-request-method': 'GET',
      },
    });

    const allowOrigin = response.headers['access-control-allow-origin'];
    expect(allowOrigin).not.toBe('https://malicious.com');
    expect(allowOrigin).toBe(CORS_ORIGIN);
  });
});
