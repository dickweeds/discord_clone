import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { routeMessage, registerHandler, clearHandlers, respond, respondError } from './wsRouter.js';

function createMockSocket() {
  return {
    close: vi.fn(),
    send: vi.fn(),
    readyState: 1,
    OPEN: 1,
  } as unknown as import('ws').WebSocket;
}

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

describe('wsRouter', () => {
  let ws: ReturnType<typeof createMockSocket>;
  let log: FastifyBaseLogger;

  beforeEach(() => {
    ws = createMockSocket();
    log = createMockLogger();
    clearHandlers();
  });

  describe('routeMessage', () => {
    it('should route message to registered handler by type', () => {
      const handler = vi.fn();
      registerHandler('test:action', handler);

      const message = JSON.stringify({ type: 'test:action', payload: { data: 'test' } });
      routeMessage(ws, message, 'user-1', log);

      expect(handler).toHaveBeenCalledWith(
        ws,
        { type: 'test:action', payload: { data: 'test' } },
        'user-1',
      );
    });

    it('should close connection with 4002 on invalid JSON', () => {
      routeMessage(ws, 'not-json', 'user-1', log);

      expect(ws.close).toHaveBeenCalledWith(4002, 'Malformed message');
    });

    it('should close connection with 4002 on missing type field', () => {
      const message = JSON.stringify({ payload: {} });
      routeMessage(ws, message, 'user-1', log);

      expect(ws.close).toHaveBeenCalledWith(4002, 'Malformed message');
    });

    it('should close connection with 4002 on missing payload field', () => {
      const message = JSON.stringify({ type: 'test:action' });
      routeMessage(ws, message, 'user-1', log);

      expect(ws.close).toHaveBeenCalledWith(4002, 'Malformed message');
    });

    it('should log warning for unknown message type without closing', () => {
      const message = JSON.stringify({ type: 'unknown:type', payload: {} });
      routeMessage(ws, message, 'user-1', log);

      expect(log.warn).toHaveBeenCalled();
      expect(ws.close).not.toHaveBeenCalled();
    });

    it('should accept message with optional id field', () => {
      const handler = vi.fn();
      registerHandler('test:withid', handler);

      const message = JSON.stringify({ type: 'test:withid', payload: {}, id: 'req-123' });
      routeMessage(ws, message, 'user-1', log);

      expect(handler).toHaveBeenCalledWith(
        ws,
        { type: 'test:withid', payload: {}, id: 'req-123' },
        'user-1',
      );
    });

    it('should reject message where id is not a string', () => {
      const message = JSON.stringify({ type: 'test:action', payload: {}, id: 123 });
      routeMessage(ws, message, 'user-1', log);

      expect(ws.close).toHaveBeenCalledWith(4002, 'Malformed message');
    });
  });

  describe('respond', () => {
    it('sends a response with correct JSON format and id', () => {
      respond(ws, 'req-1', { data: 'test' });

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('response');
      expect(sent.id).toBe('req-1');
      expect(sent.payload).toEqual({ data: 'test' });
    });

    it('does not send when WebSocket is not OPEN', () => {
      const closedWs = createMockSocket();
      Object.defineProperty(closedWs, 'readyState', { value: 3 }); // CLOSED
      Object.defineProperty(closedWs, 'OPEN', { value: 1 });

      respond(closedWs, 'req-closed', { data: 'test' });
      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('sends a response with empty payload', () => {
      respond(ws, 'req-2', {});

      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('response');
      expect(sent.payload).toEqual({});
    });
  });

  describe('respondError', () => {
    it('sends an error with correct JSON format', () => {
      respondError(ws, 'req-3', 'Something went wrong');

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('error');
      expect(sent.id).toBe('req-3');
      expect(sent.payload.error).toBe('Something went wrong');
    });

    it('does not send when WebSocket is not OPEN', () => {
      const closedWs = createMockSocket();
      Object.defineProperty(closedWs, 'readyState', { value: 3 }); // CLOSED
      Object.defineProperty(closedWs, 'OPEN', { value: 1 });

      respondError(closedWs, 'req-closed', 'test');
      expect(closedWs.send).not.toHaveBeenCalled();
    });
  });
});
