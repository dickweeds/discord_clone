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
import { createMessage } from './messageService.js';

describe('GET /api/channels/:channelId/messages', () => {
  let app: FastifyInstance;
  let channelId: string;
  let userId: string;
  let accessToken: string;

  beforeEach(async () => {
    app = await setupApp();
    const channel = app.db.insert(channels).values({ name: 'general', type: 'text' }).returning().get();
    channelId = channel.id;
    const user = await seedUserWithSession(app, 'testuser');
    userId = user.id;
    accessToken = user.accessToken;
  });

  it('returns paginated messages for a channel', async () => {
    createMessage(app.db, channelId, userId, 'msg1', 'nonce1');
    createMessage(app.db, channelId, userId, 'msg2', 'nonce2');

    const response = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data).toHaveLength(2);
    expect(body.count).toBe(2);
  });

  it('returns messages with correct camelCase fields', async () => {
    createMessage(app.db, channelId, userId, 'encrypted-content', 'nonce-val');

    const response = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = JSON.parse(response.payload);
    const msg = body.data[0];
    expect(msg).toHaveProperty('messageId');
    expect(msg).toHaveProperty('channelId');
    expect(msg).toHaveProperty('authorId');
    expect(msg).toHaveProperty('content');
    expect(msg).toHaveProperty('nonce');
    expect(msg).toHaveProperty('createdAt');
    // Verify encrypted content is passed through
    expect(msg.content).toBe('encrypted-content');
    expect(msg.nonce).toBe('nonce-val');
  });

  it('respects limit query parameter', async () => {
    for (let i = 0; i < 5; i++) {
      createMessage(app.db, channelId, userId, `msg-${i}`, `nonce-${i}`);
    }

    const response = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages?limit=2`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = JSON.parse(response.payload);
    expect(body.data).toHaveLength(2);
    expect(body.count).toBe(2);
  });

  it('returns empty array for channel with no messages', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = JSON.parse(response.payload);
    expect(body.data).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('supports before cursor pagination', async () => {
    createMessage(app.db, channelId, userId, 'first', 'n1');
    createMessage(app.db, channelId, userId, 'second', 'n2');
    const msg3 = createMessage(app.db, channelId, userId, 'third', 'n3');

    const response = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages?before=${msg3.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = JSON.parse(response.payload);
    expect(body.data).toHaveLength(2);
    expect(body.data.every((m: { messageId: string }) => m.messageId !== msg3.id)).toBe(true);
  });
});
