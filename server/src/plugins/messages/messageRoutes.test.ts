import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

import { setupApp, teardownApp, truncateAll, seedUserWithSession } from '../../test/helpers.js';
import { channels } from '../../db/schema.js';
import { createMessage } from './messageService.js';

describe('GET /api/channels/:channelId/messages', () => {
  let app: FastifyInstance;
  let channelId: string;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await setupApp();
  });

  afterAll(async () => {
    await teardownApp();
  });

  beforeEach(async () => {
    await truncateAll(app.db);
    const [channel] = await app.db.insert(channels).values({ name: 'general', type: 'text' }).returning();
    channelId = channel.id;
    const user = await seedUserWithSession(app, 'testuser');
    userId = user.id;
    accessToken = user.accessToken;
  });

  it('returns paginated messages for a channel', async () => {
    await createMessage(app.db, { channelId, userId, encryptedContent: 'msg1', nonce: 'nonce1' });
    await createMessage(app.db, { channelId, userId, encryptedContent: 'msg2', nonce: 'nonce2' });

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
    await createMessage(app.db, { channelId, userId, encryptedContent: 'encrypted-content', nonce: 'nonce-val' });

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
    expect(msg.content).toBe('encrypted-content');
    expect(msg.nonce).toBe('nonce-val');
  });

  it('respects limit query parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await createMessage(app.db, { channelId, userId, encryptedContent: `msg-${i}`, nonce: `nonce-${i}` });
    }

    const response = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages?limit=2`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = JSON.parse(response.payload);
    expect(body.data).toHaveLength(2);
    expect(body.count).toBe(2);
    // Should have a cursor since there are more messages
    expect(body.cursor).not.toBeNull();
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
    expect(body.cursor).toBeNull();
  });

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for non-existent channel', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/channels/00000000-0000-0000-0000-000000000099/messages',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('CHANNEL_NOT_FOUND');
  });

  it('supports opaque cursor pagination', async () => {
    // Create 5 messages
    for (let i = 0; i < 5; i++) {
      await createMessage(app.db, { channelId, userId, encryptedContent: `msg-${i}`, nonce: `n-${i}` });
    }

    // Fetch first page with limit=3
    const response1 = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages?limit=3`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body1 = JSON.parse(response1.payload);
    expect(body1.data).toHaveLength(3);
    expect(body1.cursor).not.toBeNull();

    // Fetch second page using cursor from first response
    const response2 = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages?limit=3&cursor=${encodeURIComponent(body1.cursor)}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body2 = JSON.parse(response2.payload);
    expect(body2.data).toHaveLength(2);
    expect(body2.cursor).toBeNull(); // No more pages

    // Verify no duplicate messages across pages
    const allIds = [...body1.data.map((m: { messageId: string }) => m.messageId), ...body2.data.map((m: { messageId: string }) => m.messageId)];
    expect(new Set(allIds).size).toBe(5);

    // Verify descending chronological order within and across pages
    const allMessages = [...body1.data, ...body2.data] as { createdAt: string }[];
    for (let i = 1; i < allMessages.length; i++) {
      expect(new Date(allMessages[i].createdAt).getTime())
        .toBeLessThanOrEqual(new Date(allMessages[i - 1].createdAt).getTime());
    }
  });

  it('returns 400 for invalid cursor', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages?cursor=garbage`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('INVALID_CURSOR');
  });
});
