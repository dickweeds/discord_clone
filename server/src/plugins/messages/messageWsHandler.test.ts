import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { setupApp, seedRegularUser } from '../../test/helpers.js';
import { channels, messages } from '../../db/schema.js';
import { clearHandlers, routeMessage } from '../../ws/wsRouter.js';
import { registerMessageHandlers } from './messageWsHandler.js';
import { eq } from 'drizzle-orm';

function createMockSocket(readyState = 1) {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState,
    OPEN: 1,
  } as unknown as import('ws').WebSocket;
}

describe('messageWsHandler', () => {
  let app: FastifyInstance;
  let channelId: string;
  let userId: string;
  let clients: Map<string, import('ws').WebSocket>;

  beforeEach(async () => {
    clearHandlers();
    app = await setupApp();
    const channel = app.db.insert(channels).values({ name: 'general', type: 'text' }).returning().get();
    channelId = channel.id;
    const user = await seedRegularUser(app, 'sender');
    userId = user.id;

    clients = new Map();
    registerMessageHandlers(clients, app.db);
  });

  it('stores message and broadcasts text:receive on valid text:send', () => {
    const senderWs = createMockSocket();
    const receiverWs = createMockSocket();
    clients.set(userId, senderWs);
    clients.set('other-user', receiverWs);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'encrypted-blob', nonce: 'nonce-value' },
      id: 'temp-123',
    });

    routeMessage(senderWs, raw, userId, { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as import('fastify').FastifyBaseLogger);

    // Message stored in DB
    const stored = app.db.select().from(messages).where(eq(messages.channel_id, channelId)).all();
    expect(stored).toHaveLength(1);
    expect(stored[0].encrypted_content).toBe('encrypted-blob');
    expect(stored[0].nonce).toBe('nonce-value');
    expect(stored[0].user_id).toBe(userId);

    // Both clients receive broadcast
    expect(senderWs.send).toHaveBeenCalledOnce();
    expect(receiverWs.send).toHaveBeenCalledOnce();

    // Verify payload structure
    const sent = JSON.parse((receiverWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent.type).toBe('text:receive');
    expect(sent.payload.messageId).toBe(stored[0].id);
    expect(sent.payload.channelId).toBe(channelId);
    expect(sent.payload.authorId).toBe(userId);
    expect(sent.payload.content).toBe('encrypted-blob');
    expect(sent.payload.nonce).toBe('nonce-value');
    expect(sent.payload.createdAt).toBeDefined();

    // tempId passed through in message.id
    expect(sent.id).toBe('temp-123');
  });

  it('closes connection on missing channelId', () => {
    const ws = createMockSocket();
    clients.set(userId, ws);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { content: 'blob', nonce: 'nonce' },
    });

    routeMessage(ws, raw, userId, { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as import('fastify').FastifyBaseLogger);
    expect(ws.close).toHaveBeenCalledWith(4002, 'Missing or invalid channelId');
  });

  it('closes connection on missing content', () => {
    const ws = createMockSocket();
    clients.set(userId, ws);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, nonce: 'nonce' },
    });

    routeMessage(ws, raw, userId, { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as import('fastify').FastifyBaseLogger);
    expect(ws.close).toHaveBeenCalledWith(4002, 'Missing or invalid content');
  });

  it('closes connection on missing nonce', () => {
    const ws = createMockSocket();
    clients.set(userId, ws);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'blob' },
    });

    routeMessage(ws, raw, userId, { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as import('fastify').FastifyBaseLogger);
    expect(ws.close).toHaveBeenCalledWith(4002, 'Missing or invalid nonce');
  });

  it('does not send to clients with closed connections', () => {
    const senderWs = createMockSocket();
    const closedWs = createMockSocket(3); // CLOSED
    clients.set(userId, senderWs);
    clients.set('closed-user', closedWs);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'blob', nonce: 'nonce' },
    });

    routeMessage(senderWs, raw, userId, { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as import('fastify').FastifyBaseLogger);

    expect(senderWs.send).toHaveBeenCalledOnce();
    expect(closedWs.send).not.toHaveBeenCalled();
  });

  it('sender receives confirmation with tempId', () => {
    const senderWs = createMockSocket();
    clients.set(userId, senderWs);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'blob', nonce: 'nonce' },
      id: 'my-temp-id',
    });

    routeMessage(senderWs, raw, userId, { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as import('fastify').FastifyBaseLogger);

    expect(senderWs.send).toHaveBeenCalledOnce();
    const sent = JSON.parse((senderWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent.id).toBe('my-temp-id');
    expect(sent.payload.authorId).toBe(userId);
  });
});
