import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import { WS_TYPES, MAX_MESSAGE_LENGTH } from 'discord-clone-shared';
import type { WsMessage, TextSendPayload, TextReceivePayload, TextErrorPayload, ReactionAddPayload, ReactionRemovePayload, ReactionAddedPayload, ReactionRemovedPayload } from 'discord-clone-shared';
import { registerHandler } from '../../ws/wsRouter.js';
import { createMessage } from './messageService.js';
import { addReaction, removeReaction } from './reactionService.js';
import { withDbRetry } from '../../db/withDbRetry.js';
import type { AppDatabase } from '../../db/connection.js';

function sendTextError(ws: WebSocket, error: string, tempId: string): void {
  try {
    ws.send(JSON.stringify({
      type: WS_TYPES.TEXT_ERROR,
      payload: { error, tempId } satisfies TextErrorPayload,
    }));
  } catch {
    // WS send failed — connection is dead, nothing to do
  }
}

export function registerMessageHandlers(
  clients: Map<string, WebSocket>,
  db: AppDatabase,
  log: FastifyBaseLogger,
): void {
  registerHandler(WS_TYPES.TEXT_SEND, async (ws, message, userId) => {
    const payload = message.payload as TextSendPayload;

    // Validate required fields — send TEXT_ERROR instead of closing connection
    if (!payload.channelId || typeof payload.channelId !== 'string') {
      sendTextError(ws, 'MISSING_CHANNEL_ID', payload.tempId ?? '');
      return;
    }
    if (!payload.content || typeof payload.content !== 'string') {
      sendTextError(ws, 'MISSING_CONTENT', payload.tempId ?? '');
      return;
    }
    if (!payload.nonce || typeof payload.nonce !== 'string') {
      sendTextError(ws, 'MISSING_NONCE', payload.tempId ?? '');
      return;
    }
    if (payload.content.length > MAX_MESSAGE_LENGTH) {
      sendTextError(ws, 'MESSAGE_TOO_LONG', payload.tempId ?? '');
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
      sendTextError(ws, 'MESSAGE_STORE_FAILED', payload.tempId ?? '');
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

  registerHandler(WS_TYPES.REACTION_ADD, async (ws, message, userId) => {
    const payload = message.payload as ReactionAddPayload;

    if (!payload.messageId || typeof payload.messageId !== 'string') {
      sendTextError(ws, 'MISSING_MESSAGE_ID', '');
      return;
    }
    if (!payload.channelId || typeof payload.channelId !== 'string') {
      sendTextError(ws, 'MISSING_CHANNEL_ID', '');
      return;
    }
    if (!payload.emoji || typeof payload.emoji !== 'string') {
      sendTextError(ws, 'MISSING_EMOJI', '');
      return;
    }
    if (payload.emoji.length > 32) {
      sendTextError(ws, 'EMOJI_TOO_LONG', '');
      return;
    }

    try {
      await withDbRetry(() => addReaction(db, {
        messageId: payload.messageId,
        userId,
        emoji: payload.emoji,
      }));
    } catch (err) {
      log.error({ error: (err as Error).message, messageId: payload.messageId }, 'Failed to add reaction');
      sendTextError(ws, 'REACTION_ADD_FAILED', '');
      return;
    }

    const broadcastPayload: ReactionAddedPayload = {
      messageId: payload.messageId,
      channelId: payload.channelId,
      userId,
      emoji: payload.emoji,
    };

    const data = JSON.stringify({
      type: WS_TYPES.REACTION_ADDED,
      payload: broadcastPayload,
    } satisfies WsMessage<ReactionAddedPayload>);

    for (const [, clientWs] of clients) {
      if (clientWs.readyState === clientWs.OPEN) {
        try {
          clientWs.send(data);
        } catch (err) {
          log.warn({ error: (err as Error).message }, 'Failed to send reaction:added to client');
        }
      }
    }
  });

  registerHandler(WS_TYPES.REACTION_REMOVE, async (ws, message, userId) => {
    const payload = message.payload as ReactionRemovePayload;

    if (!payload.messageId || typeof payload.messageId !== 'string') {
      sendTextError(ws, 'MISSING_MESSAGE_ID', '');
      return;
    }
    if (!payload.channelId || typeof payload.channelId !== 'string') {
      sendTextError(ws, 'MISSING_CHANNEL_ID', '');
      return;
    }
    if (!payload.emoji || typeof payload.emoji !== 'string') {
      sendTextError(ws, 'MISSING_EMOJI', '');
      return;
    }
    if (payload.emoji.length > 32) {
      sendTextError(ws, 'EMOJI_TOO_LONG', '');
      return;
    }

    let removed: boolean;
    try {
      removed = await withDbRetry(() => removeReaction(db, {
        messageId: payload.messageId,
        userId,
        emoji: payload.emoji,
      }));
    } catch (err) {
      log.error({ error: (err as Error).message, messageId: payload.messageId }, 'Failed to remove reaction');
      sendTextError(ws, 'REACTION_REMOVE_FAILED', '');
      return;
    }

    if (!removed) return; // No-op if reaction didn't exist

    const broadcastPayload: ReactionRemovedPayload = {
      messageId: payload.messageId,
      channelId: payload.channelId,
      userId,
      emoji: payload.emoji,
    };

    const data = JSON.stringify({
      type: WS_TYPES.REACTION_REMOVED,
      payload: broadcastPayload,
    } satisfies WsMessage<ReactionRemovedPayload>);

    for (const [, clientWs] of clients) {
      if (clientWs.readyState === clientWs.OPEN) {
        try {
          clientWs.send(data);
        } catch (err) {
          log.warn({ error: (err as Error).message }, 'Failed to send reaction:removed to client');
        }
      }
    }
  });
}
