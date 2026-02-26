import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

/**
 * CORS Restriction: Verifies that CORS is restricted to configured client origin
 * and rejects requests from unknown origins.
 */

describe('CORS Origin Restriction', () => {
  const ALLOWED_ORIGIN = 'http://localhost:5173';
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cors, {
      origin: ALLOWED_ORIGIN,
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
      headers: { origin: ALLOWED_ORIGIN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects requests from unknown origins via CORS headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test',
      headers: { origin: 'https://evil-site.com' },
    });

    // Fastify still processes the request but does NOT set CORS allow headers
    // The browser enforces the CORS policy based on missing/mismatched headers
    expect(response.headers['access-control-allow-origin']).not.toBe('https://evil-site.com');
  });

  it('handles preflight OPTIONS requests correctly for allowed origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/test',
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('does not set allow-origin for preflight from unknown origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/test',
      headers: {
        origin: 'https://malicious.com',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.headers['access-control-allow-origin']).not.toBe('https://malicious.com');
  });
});
