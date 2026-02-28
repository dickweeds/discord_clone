import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import type { WsMessage, TextErrorPayload } from 'discord-clone-shared';
import { WS_TYPES } from 'discord-clone-shared';

export type WsHandler = (ws: WebSocket, message: WsMessage, userId: string) => void | Promise<void>;

const handlers = new Map<string, WsHandler>();

export function registerHandler(type: string, handler: WsHandler): void {
  handlers.set(type, handler);
}

export function clearHandlers(): void {
  handlers.clear();
}

export function routeMessage(ws: WebSocket, raw: string, userId: string, log: FastifyBaseLogger): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn({ userId }, 'Malformed WebSocket message: invalid JSON');
    ws.close(4002, 'Malformed message');
    return;
  }

  if (!isValidWsMessage(parsed)) {
    log.warn({ userId }, 'Malformed WebSocket message: invalid envelope');
    ws.close(4002, 'Malformed message');
    return;
  }

  const message = parsed as WsMessage;
  const handler = handlers.get(message.type);

  if (!handler) {
    log.warn({ userId, type: message.type }, 'Unknown WebSocket message type');
    return;
  }

  const result = handler(ws, message, userId);
  if (result instanceof Promise) {
    result.catch((err) => {
      log.error({ err, userId, type: message.type }, 'Unhandled async WS handler error');
      // Last-resort error frame — ensures the client always gets feedback
      try {
        ws.send(JSON.stringify({
          type: WS_TYPES.TEXT_ERROR,
          payload: { error: 'INTERNAL_ERROR', tempId: '' } satisfies TextErrorPayload,
        }));
      } catch {
        // WS already dead
      }
    });
  }
}

export function respond(ws: WebSocket, requestId: string, payload: unknown): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({ type: 'response', payload, id: requestId }));
}

export function respondError(ws: WebSocket, requestId: string, error: string): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({ type: 'error', payload: { error }, id: requestId }));
}

function isValidWsMessage(data: unknown): data is WsMessage {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.type !== 'string') return false;
  if (!('payload' in obj) || typeof obj.payload !== 'object' || obj.payload === null) return false;
  if ('id' in obj && typeof obj.id !== 'string') return false;
  return true;
}
