import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import { WS_TYPES, MAX_MESSAGE_LENGTH } from 'discord-clone-shared';
import type { WsMessage, TextSendPayload, TextReceivePayload } from 'discord-clone-shared';
import { registerHandler } from '../../ws/wsRouter.js';
import { createMessage } from './messageService.js';
import type { AppDatabase } from '../../db/connection.js';

export function registerMessageHandlers(
  clients: Map<string, WebSocket>,
  db: AppDatabase,
  log: FastifyBaseLogger,
): void {
  registerHandler(WS_TYPES.TEXT_SEND, (ws, message, userId) => {
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

    // Store encrypted message
    let stored;
    try {
      stored = createMessage(db, payload.channelId, userId, payload.content, payload.nonce);
    } catch (err) {
      log.error({ error: (err as Error).message, channelId: payload.channelId }, 'Failed to store message');
      ws.close(4003, 'Failed to store message');
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
