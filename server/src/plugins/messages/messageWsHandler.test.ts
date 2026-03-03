import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance, FastifyBaseLogger } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

import { setupApp, teardownApp, truncateAll, seedRegularUser } from '../../test/helpers.js';
import { channels, messages, messageReactions } from '../../db/schema.js';
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

function createMockLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: 'info',
  } as unknown as FastifyBaseLogger;
}

/** Wait for a mock function to be called, with timeout. */
async function waitForCall(mockFn: ReturnType<typeof vi.fn>, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (mockFn.mock.calls.length === 0) {
    if (Date.now() - start > timeoutMs) throw new Error('waitForCall timeout');
    await new Promise(r => setTimeout(r, 10));
  }
}

describe('messageWsHandler', () => {
  let app: FastifyInstance;
  let channelId: string;
  let userId: string;
  let clients: Map<string, import('ws').WebSocket>;
  let mockLog: FastifyBaseLogger;

  beforeAll(async () => {
    app = await setupApp();
  });

  afterAll(async () => {
    await teardownApp();
  });

  beforeEach(async () => {
    clearHandlers();
    await truncateAll(app.db);
    const [channel] = await app.db.insert(channels).values({ name: 'general', type: 'text' }).returning();
    channelId = channel.id;
    const user = await seedRegularUser(app, 'sender');
    userId = user.id;

    clients = new Map();
    mockLog = createMockLogger();
    registerMessageHandlers(clients, app.db, mockLog);
  });

  it('stores message and broadcasts text:receive on valid text:send', async () => {
    const senderWs = createMockSocket();
    const receiverWs = createMockSocket();
    clients.set(userId, senderWs);
    clients.set('other-user', receiverWs);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'encrypted-blob', nonce: 'nonce-value', tempId: 'temp-123' },
      id: 'temp-123',
    });

    routeMessage(senderWs, raw, userId, mockLog);
    await waitForCall(senderWs.send as ReturnType<typeof vi.fn>);

    // Message stored in DB
    const stored = await app.db.select().from(messages).where(eq(messages.channel_id, channelId));
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

  it('sends text:error on missing channelId', () => {
    const ws = createMockSocket();
    clients.set(userId, ws);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { content: 'blob', nonce: 'nonce', tempId: 'tmp-1' },
    });

    routeMessage(ws, raw, userId, mockLog);

    expect(ws.send).toHaveBeenCalledOnce();
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent.type).toBe('text:error');
    expect(sent.payload.error).toBe('MISSING_CHANNEL_ID');
    expect(sent.payload.tempId).toBe('tmp-1');
  });

  it('sends text:error on missing content', () => {
    const ws = createMockSocket();
    clients.set(userId, ws);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, nonce: 'nonce', tempId: 'tmp-2' },
    });

    routeMessage(ws, raw, userId, mockLog);

    expect(ws.send).toHaveBeenCalledOnce();
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent.type).toBe('text:error');
    expect(sent.payload.error).toBe('MISSING_CONTENT');
  });

  it('sends text:error on missing nonce', () => {
    const ws = createMockSocket();
    clients.set(userId, ws);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'blob', tempId: 'tmp-3' },
    });

    routeMessage(ws, raw, userId, mockLog);

    expect(ws.send).toHaveBeenCalledOnce();
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent.type).toBe('text:error');
    expect(sent.payload.error).toBe('MISSING_NONCE');
  });

  it('sends text:error when content exceeds MAX_MESSAGE_LENGTH', () => {
    const ws = createMockSocket();
    clients.set(userId, ws);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'a'.repeat(2001), nonce: 'nonce', tempId: 'tmp-4' },
    });

    routeMessage(ws, raw, userId, mockLog);

    expect(ws.send).toHaveBeenCalledOnce();
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent.type).toBe('text:error');
    expect(sent.payload.error).toBe('MESSAGE_TOO_LONG');
  });

  it('does not send to clients with closed connections', async () => {
    const senderWs = createMockSocket();
    const closedWs = createMockSocket(3); // CLOSED
    clients.set(userId, senderWs);
    clients.set('closed-user', closedWs);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'blob', nonce: 'nonce', tempId: 'tmp-5' },
    });

    routeMessage(senderWs, raw, userId, mockLog);
    await waitForCall(senderWs.send as ReturnType<typeof vi.fn>);

    expect(senderWs.send).toHaveBeenCalledOnce();
    expect(closedWs.send).not.toHaveBeenCalled();
  });

  it('sender receives confirmation with tempId', async () => {
    const senderWs = createMockSocket();
    clients.set(userId, senderWs);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'blob', nonce: 'nonce', tempId: 'my-temp-id' },
      id: 'my-temp-id',
    });

    routeMessage(senderWs, raw, userId, mockLog);
    await waitForCall(senderWs.send as ReturnType<typeof vi.fn>);

    expect(senderWs.send).toHaveBeenCalledOnce();
    const sent = JSON.parse((senderWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent.id).toBe('my-temp-id');
    expect(sent.payload.authorId).toBe(userId);
  });

  it('sends text:error on DB error (e.g., invalid channelId)', async () => {
    const ws = createMockSocket();
    clients.set(userId, ws);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId: '00000000-0000-0000-0000-000000000099', content: 'blob', nonce: 'nonce', tempId: 'tmp-err' },
    });

    routeMessage(ws, raw, userId, mockLog);
    await waitForCall(ws.send as ReturnType<typeof vi.fn>);

    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent.type).toBe('text:error');
    expect(sent.payload.error).toBe('MESSAGE_STORE_FAILED');
    expect(sent.payload.tempId).toBe('tmp-err');
    expect((mockLog.error as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('logs warning when broadcast send fails', async () => {
    const senderWs = createMockSocket();
    const failingWs = createMockSocket();
    (failingWs.send as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('Send failed'); });
    clients.set(userId, senderWs);
    clients.set('failing-user', failingWs);

    const raw = JSON.stringify({
      type: 'text:send',
      payload: { channelId, content: 'blob', nonce: 'nonce', tempId: 'tmp-6' },
    });

    routeMessage(senderWs, raw, userId, mockLog);
    await waitForCall(mockLog.warn as ReturnType<typeof vi.fn>);

    expect((mockLog.warn as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    // Sender still receives (broadcast continues despite one client failing)
    expect(senderWs.send).toHaveBeenCalledOnce();
  });

  describe('reaction handlers', () => {
    let messageId: string;

    beforeEach(async () => {
      const [msg] = await app.db.insert(messages).values({
        channel_id: channelId,
        user_id: userId,
        encrypted_content: 'test-content',
        nonce: 'test-nonce',
      }).returning();
      messageId = msg.id;
    });

    it('stores reaction and broadcasts reaction:added on valid reaction:add', async () => {
      const senderWs = createMockSocket();
      const receiverWs = createMockSocket();
      clients.set(userId, senderWs);
      clients.set('other-user', receiverWs);

      const raw = JSON.stringify({
        type: 'reaction:add',
        payload: { messageId, channelId, emoji: '\u{1F44D}' },
      });

      routeMessage(senderWs, raw, userId, mockLog);
      await waitForCall(senderWs.send as ReturnType<typeof vi.fn>);

      // Reaction stored in DB
      const stored = await app.db.select().from(messageReactions).where(eq(messageReactions.message_id, messageId));
      expect(stored).toHaveLength(1);
      expect(stored[0].emoji).toBe('\u{1F44D}');
      expect(stored[0].user_id).toBe(userId);

      // Both clients receive broadcast
      expect(senderWs.send).toHaveBeenCalledOnce();
      expect(receiverWs.send).toHaveBeenCalledOnce();

      const sent = JSON.parse((receiverWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
      expect(sent.type).toBe('reaction:added');
      expect(sent.payload.messageId).toBe(messageId);
      expect(sent.payload.channelId).toBe(channelId);
      expect(sent.payload.userId).toBe(userId);
      expect(sent.payload.emoji).toBe('\u{1F44D}');
    });

    it('duplicate reaction:add is idempotent (no error, still broadcasts)', async () => {
      const ws = createMockSocket();
      clients.set(userId, ws);

      const raw = JSON.stringify({
        type: 'reaction:add',
        payload: { messageId, channelId, emoji: '\u{1F44D}' },
      });

      routeMessage(ws, raw, userId, mockLog);
      await waitForCall(ws.send as ReturnType<typeof vi.fn>);

      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      routeMessage(ws, raw, userId, mockLog);
      await waitForCall(ws.send as ReturnType<typeof vi.fn>);

      const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
      expect(sent.type).toBe('reaction:added');

      // Still only one reaction in DB
      const stored = await app.db.select().from(messageReactions).where(eq(messageReactions.message_id, messageId));
      expect(stored).toHaveLength(1);
    });

    it('reaction:add returns error on missing messageId', () => {
      const ws = createMockSocket();
      clients.set(userId, ws);

      const raw = JSON.stringify({
        type: 'reaction:add',
        payload: { channelId, emoji: '\u{1F44D}' },
      });

      routeMessage(ws, raw, userId, mockLog);

      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
      expect(sent.type).toBe('text:error');
      expect(sent.payload.error).toBe('MISSING_MESSAGE_ID');
    });

    it('reaction:add returns error on emoji exceeding 32 chars', () => {
      const ws = createMockSocket();
      clients.set(userId, ws);

      const raw = JSON.stringify({
        type: 'reaction:add',
        payload: { messageId, channelId, emoji: 'a'.repeat(33) },
      });

      routeMessage(ws, raw, userId, mockLog);

      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
      expect(sent.type).toBe('text:error');
      expect(sent.payload.error).toBe('EMOJI_TOO_LONG');
    });

    it('reaction:add returns error on missing emoji', () => {
      const ws = createMockSocket();
      clients.set(userId, ws);

      const raw = JSON.stringify({
        type: 'reaction:add',
        payload: { messageId, channelId },
      });

      routeMessage(ws, raw, userId, mockLog);

      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
      expect(sent.type).toBe('text:error');
      expect(sent.payload.error).toBe('MISSING_EMOJI');
    });

    it('removes reaction and broadcasts reaction:removed', async () => {
      // First add a reaction
      const ws = createMockSocket();
      clients.set(userId, ws);

      const addRaw = JSON.stringify({
        type: 'reaction:add',
        payload: { messageId, channelId, emoji: '\u{1F44D}' },
      });
      routeMessage(ws, addRaw, userId, mockLog);
      await waitForCall(ws.send as ReturnType<typeof vi.fn>);
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      // Now remove it
      const removeRaw = JSON.stringify({
        type: 'reaction:remove',
        payload: { messageId, channelId, emoji: '\u{1F44D}' },
      });
      routeMessage(ws, removeRaw, userId, mockLog);
      await waitForCall(ws.send as ReturnType<typeof vi.fn>);

      const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
      expect(sent.type).toBe('reaction:removed');
      expect(sent.payload.messageId).toBe(messageId);
      expect(sent.payload.userId).toBe(userId);
      expect(sent.payload.emoji).toBe('\u{1F44D}');

      // Reaction removed from DB
      const stored = await app.db.select().from(messageReactions).where(eq(messageReactions.message_id, messageId));
      expect(stored).toHaveLength(0);
    });

    it('non-existent reaction:remove is silent no-op (no broadcast)', async () => {
      const ws = createMockSocket();
      clients.set(userId, ws);

      const raw = JSON.stringify({
        type: 'reaction:remove',
        payload: { messageId, channelId, emoji: '\u{1F44D}' },
      });

      routeMessage(ws, raw, userId, mockLog);

      // Give some time for any async work
      await new Promise(r => setTimeout(r, 100));

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('reaction:remove returns error on emoji exceeding 32 chars', () => {
      const ws = createMockSocket();
      clients.set(userId, ws);

      const raw = JSON.stringify({
        type: 'reaction:remove',
        payload: { messageId, channelId, emoji: 'x'.repeat(33) },
      });

      routeMessage(ws, raw, userId, mockLog);

      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
      expect(sent.type).toBe('text:error');
      expect(sent.payload.error).toBe('EMOJI_TOO_LONG');
    });

    it('reaction:remove returns error on missing fields', () => {
      const ws = createMockSocket();
      clients.set(userId, ws);

      const raw = JSON.stringify({
        type: 'reaction:remove',
        payload: { channelId, emoji: '\u{1F44D}' },
      });

      routeMessage(ws, raw, userId, mockLog);

      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
      expect(sent.type).toBe('text:error');
      expect(sent.payload.error).toBe('MISSING_MESSAGE_ID');
    });
  });
});
