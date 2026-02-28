import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import { WS_TYPES, MAX_MESSAGE_LENGTH } from 'discord-clone-shared';
import type { WsMessage, TextSendPayload, TextReceivePayload, TextErrorPayload } from 'discord-clone-shared';
import { registerHandler } from '../../ws/wsRouter.js';
import { createMessage } from './messageService.js';
import type { AppDatabase } from '../../db/connection.js';

async function withDbRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 1, delayMs = 200 } = {},
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      // Only retry on transient connection errors, not constraint violations
      const isTransient = pgErr.code === '08006' || // connection_failure
                          pgErr.code === '08001' || // sqlclient_unable_to_establish
                          pgErr.code === '57P01';    // admin_shutdown (Supabase maintenance)
      if (!isTransient || attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

export function registerMessageHandlers(
  clients: Map<string, WebSocket>,
  db: AppDatabase,
  log: FastifyBaseLogger,
): void {
  registerHandler(WS_TYPES.TEXT_SEND, async (ws, message, userId) => {
    const payload = message.payload as TextSendPayload;

    // Validate required fields
    if (!payload.channelId || typeof payload.channelId !== 'string') {
      ws.close(4002, 'Missing or invalid channelId');
      return;
    }
    if (!payload.content || typeof payload.content !== 'string') {
      ws.close(4002, 'Missing or invalid content');
      return;
    }
    if (!payload.nonce || typeof payload.nonce !== 'string') {
      ws.close(4002, 'Missing or invalid nonce');
      return;
    }
    if (payload.content.length > MAX_MESSAGE_LENGTH) {
      ws.close(4002, 'Message content exceeds maximum length');
      return;
    }

    // Store encrypted message with transient retry
    let stored;
    try {
      stored = await withDbRetry(() => createMessage(db, {
        channelId: payload.channelId,
        userId,
        encryptedContent: payload.content,
        nonce: payload.nonce,
      }));
    } catch (err) {
      log.error({ error: (err as Error).message, channelId: payload.channelId }, 'Failed to store message');
      try {
        ws.send(JSON.stringify({
          type: WS_TYPES.TEXT_ERROR,
          payload: { error: 'MESSAGE_STORE_FAILED', tempId: message.id ?? '' } satisfies TextErrorPayload,
        }));
      } catch {
        // WS send failed — connection is dead, nothing to do
      }
      return;
    }

    // Build text:receive payload
    const receivePayload: TextReceivePayload = {
      messageId: stored.id,
      channelId: stored.channelId,
      authorId: stored.userId,
      content: stored.encryptedContent,
      nonce: stored.nonce,
      createdAt: stored.createdAt,
    };

    const receiveMessage: WsMessage<TextReceivePayload> = {
      type: WS_TYPES.TEXT_RECEIVE,
      payload: receivePayload,
      id: message.id, // Pass through the tempId for sender confirmation
    };

    const data = JSON.stringify(receiveMessage);

    // Broadcast to all connected clients (simple approach — clients filter by channelId)
    for (const [, clientWs] of clients) {
      if (clientWs.readyState === clientWs.OPEN) {
        try {
          clientWs.send(data);
        } catch (err) {
          log.warn({ error: (err as Error).message }, 'Failed to send message to client');
        }
      }
    }
  });
}
