import type { WebSocket } from 'ws';
import { WS_TYPES } from 'discord-clone-shared';
import type { WsMessage, TextSendPayload, TextReceivePayload } from 'discord-clone-shared';
import { registerHandler } from '../../ws/wsRouter.js';
import { createMessage } from './messageService.js';
import type { AppDatabase } from '../../db/connection.js';

export function registerMessageHandlers(
  clients: Map<string, WebSocket>,
  db: AppDatabase,
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

    // Store encrypted message
    const stored = createMessage(db, payload.channelId, userId, payload.content, payload.nonce);

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
        } catch {
          // Failed to send to this client — continue broadcasting
        }
      }
    }
  });
}
