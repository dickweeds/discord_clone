import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});
vi.mock('../../ws/wsServer.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../ws/wsServer.js')>();
  return {
    ...original,
    broadcastToAll: vi.fn(),
  };
});

import { setupApp, seedUserWithSession, seedOwner, seedRegularUser } from '../../test/helpers.js';
import { channels, messages } from '../../db/schema.js';
import { broadcastToAll } from '../../ws/wsServer.js';

const mockBroadcast = vi.mocked(broadcastToAll);

describe('GET /api/channels', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
    await app.db.insert(channels).values([
      { name: 'general', type: 'text' },
      { name: 'gaming', type: 'voice' },
    ]);
    mockBroadcast.mockClear();
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
    expect(body.data.some((c: { name: string; type: string }) => c.name === 'gaming' && c.type === 'voice')).toBe(true);
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

describe('POST /api/channels', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
    mockBroadcast.mockClear();
  });

  it('creates a text channel with valid owner token', async () => {
    const { token } = await seedOwner(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'new-channel', type: 'text' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.data).toHaveProperty('id');
    expect(body.data.name).toBe('new-channel');
    expect(body.data.type).toBe('text');
    expect(body.data).toHaveProperty('createdAt');
  });

  it('creates a voice channel', async () => {
    const { token } = await seedOwner(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'voice-chat', type: 'voice' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.data.type).toBe('voice');
  });

  it('lowercases and hyphenates channel name', async () => {
    const { token } = await seedOwner(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'My New Channel', type: 'text' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.data.name).toBe('my-new-channel');
  });

  it('broadcasts channel:created WS message on success', async () => {
    const { token } = await seedOwner(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'broadcast-test', type: 'text' },
    });

    expect(response.statusCode).toBe(201);
    expect(mockBroadcast).toHaveBeenCalledOnce();
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'channel:created',
        payload: expect.objectContaining({
          channel: expect.objectContaining({ name: 'broadcast-test', type: 'text' }),
        }),
      }),
      expect.anything(),
    );
  });

  it('returns 400 for duplicate channel name', async () => {
    const { token } = await seedOwner(app);

    await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'unique-channel', type: 'text' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'unique-channel', type: 'text' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('already exists');
  });

  it('returns 403 with non-owner token', async () => {
    const { token } = await seedRegularUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'new-channel', type: 'text' },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 with missing body fields', async () => {
    const { token } = await seedOwner(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 with empty name', async () => {
    const { token } = await seedOwner(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: '', type: 'text' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 with invalid type', async () => {
    const { token } = await seedOwner(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'test', type: 'invalid' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('DELETE /api/channels/:channelId', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
    mockBroadcast.mockClear();
  });

  it('deletes a channel with valid owner token', async () => {
    const { token } = await seedOwner(app);
    const [channel] = await app.db.insert(channels).values({ name: 'to-delete', type: 'text' }).returning();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/channels/${channel.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(204);

    // Verify channel is gone
    const remaining = await app.db.select().from(channels);
    expect(remaining).toHaveLength(0);
  });

  it('broadcasts channel:deleted WS message on success', async () => {
    const { token } = await seedOwner(app);
    const [channel] = await app.db.insert(channels).values({ name: 'to-broadcast-delete', type: 'text' }).returning();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/channels/${channel.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(204);
    expect(mockBroadcast).toHaveBeenCalledOnce();
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'channel:deleted',
        payload: { channelId: channel.id },
      }),
      expect.anything(),
    );
  });

  it('returns 403 with non-owner token', async () => {
    const { token } = await seedRegularUser(app);
    const [channel] = await app.db.insert(channels).values({ name: 'test', type: 'text' }).returning();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/channels/${channel.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent channel', async () => {
    const { token } = await seedOwner(app);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/channels/00000000-0000-0000-0000-000000000099',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('cascades: deletes messages when channel is deleted', async () => {
    const { token, id: ownerId } = await seedOwner(app);
    const [channel] = await app.db.insert(channels).values({ name: 'with-messages', type: 'text' }).returning();

    // Seed messages
    await app.db.insert(messages).values([
      { channel_id: channel.id, user_id: ownerId, encrypted_content: 'msg1', nonce: 'n1' },
      { channel_id: channel.id, user_id: ownerId, encrypted_content: 'msg2', nonce: 'n2' },
    ]);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/channels/${channel.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(204);

    // Verify messages are gone
    const remainingMessages = await app.db.select().from(messages);
    expect(remainingMessages).toHaveLength(0);
  });
});
