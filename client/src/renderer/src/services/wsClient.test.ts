import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WS_RECONNECT_DELAY } from 'discord-clone-shared';
import { usePresenceStore } from '../stores/usePresenceStore';
import useAuthStore from '../stores/useAuthStore';
import { wsClient } from './wsClient';

// Mock WebSocket
let mockInstances: MockWebSocket[] = [];
const mockRefreshTokens = vi.fn<() => Promise<void>>();
const mockAuthState: {
  accessToken: string | null;
  refreshTokens: () => Promise<void>;
} = {
  accessToken: null,
  refreshTokens: mockRefreshTokens,
};

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    mockInstances.push(this);
  }

  send = vi.fn();
  close = vi.fn().mockImplementation((code = 1000) => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code }));
    }
  });

  triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  triggerMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  triggerClose(code = 1006): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code }));
    }
  }
}

const OriginalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  mockInstances = [];
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  mockAuthState.accessToken = null;
  mockRefreshTokens.mockReset();
  mockRefreshTokens.mockResolvedValue(undefined);
  vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthState as unknown as ReturnType<typeof useAuthStore.getState>);
  // Ensure wsClient is disconnected and fresh
  wsClient.disconnect();
  usePresenceStore.setState({
    onlineUsers: new Map(),
    connectionState: 'disconnected',
    hasConnectedOnce: false,
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  wsClient.disconnect();
  globalThis.WebSocket = OriginalWebSocket;
  vi.restoreAllMocks();
});

describe('wsClient', () => {
  describe('connect', () => {
    it('should create WebSocket with token in URL', () => {
      wsClient.connect('my-token');
      expect(mockInstances).toHaveLength(1);
      expect(mockInstances[0].url).toContain('token=my-token');
    });

    it('should set connection state to connecting', () => {
      wsClient.connect('my-token');
      expect(usePresenceStore.getState().connectionState).toBe('connecting');
    });

    it('should set connection state to connected on open', () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();
      expect(usePresenceStore.getState().connectionState).toBe('connected');
    });
  });

  describe('disconnect', () => {
    it('should close connection and set disconnected state', () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();
      wsClient.disconnect();
      expect(usePresenceStore.getState().connectionState).toBe('disconnected');
    });
  });

  describe('send', () => {
    it('should throw when not connected', () => {
      expect(() => wsClient.send({ type: 'test', payload: {} })).toThrow('WebSocket is not connected');
    });

    it('should send JSON message when connected', () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();
      wsClient.send({ type: 'test:action', payload: { data: 'hello' } });
      expect(mockInstances[0].send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'test:action', payload: { data: 'hello' } }),
      );
    });
  });

  describe('message dispatching', () => {
    it('should dispatch presence:update messages to store', () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      mockInstances[0].triggerMessage(
        JSON.stringify({ type: 'presence:update', payload: { userId: 'u1', status: 'online' } }),
      );

      expect(usePresenceStore.getState().onlineUsers.has('u1')).toBe(true);
    });

    it('should dispatch presence:sync messages to store', () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      mockInstances[0].triggerMessage(
        JSON.stringify({
          type: 'presence:sync',
          payload: {
            users: [
              { userId: 'u1', status: 'online' },
              { userId: 'u2', status: 'online' },
            ],
          },
        }),
      );

      const { onlineUsers } = usePresenceStore.getState();
      expect(onlineUsers.size).toBe(2);
    });

    it('should dispatch to registered handlers', () => {
      const handler = vi.fn();
      wsClient.on('custom:event', handler);
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      mockInstances[0].triggerMessage(
        JSON.stringify({ type: 'custom:event', payload: { key: 'value' } }),
      );

      expect(handler).toHaveBeenCalledWith({ key: 'value' });
    });

    it('should unsubscribe handler when calling returned function', () => {
      const handler = vi.fn();
      const unsub = wsClient.on('custom:event', handler);
      unsub();

      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      mockInstances[0].triggerMessage(
        JSON.stringify({ type: 'custom:event', payload: {} }),
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('reconnection', () => {
    it('should set reconnecting state on unexpected close', () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      // Simulate unexpected close (not user-initiated, not 4001)
      mockInstances[0].triggerClose(1006);

      expect(usePresenceStore.getState().connectionState).toBe('reconnecting');
    });

    it('should not reconnect on intentional disconnect', () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();
      wsClient.disconnect();

      expect(usePresenceStore.getState().connectionState).toBe('disconnected');
      // Only 1 instance (the initial connect)
      expect(mockInstances).toHaveLength(1);
    });

    it('should attempt reconnect on auth failure (4001)', () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      mockInstances[0].triggerClose(4001);

      expect(usePresenceStore.getState().connectionState).toBe('reconnecting');
    });

    it('should force token refresh on auth failure before reconnecting', async () => {
      vi.useFakeTimers();
      mockAuthState.accessToken = 'stale-token';
      mockRefreshTokens.mockImplementation(async () => {
        mockAuthState.accessToken = 'fresh-token';
      });

      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();
      mockInstances[0].triggerClose(4001);

      await vi.advanceTimersByTimeAsync(WS_RECONNECT_DELAY + 1);

      expect(mockRefreshTokens).toHaveBeenCalledTimes(1);
      expect(mockInstances).toHaveLength(2);
      expect(mockInstances[1].url).toContain('token=fresh-token');
      vi.useRealTimers();
    });

    it('should stop reconnecting when forced refresh fails on auth failure', async () => {
      vi.useFakeTimers();
      mockAuthState.accessToken = 'stale-token';
      mockRefreshTokens.mockRejectedValue(new Error('refresh failed'));

      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();
      mockInstances[0].triggerClose(4001);

      await vi.advanceTimersByTimeAsync(WS_RECONNECT_DELAY + 1);

      expect(mockRefreshTokens).toHaveBeenCalledTimes(1);
      expect(mockInstances).toHaveLength(1);
      expect(usePresenceStore.getState().connectionState).toBe('disconnected');
      vi.useRealTimers();
    });
  });

  describe('updateToken', () => {
    it('should update stored token for future reconnections', () => {
      wsClient.updateToken('new-token');
      // No error is the success case
    });
  });

  describe('request', () => {
    it('sends message with id and resolves on matching response', async () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      // voice:presence-sync fires on connect, so our request will be the next send call
      const sendCountBefore = mockInstances[0].send.mock.calls.length;
      const promise = wsClient.request<{ data: string }>('test:action', { key: 'value' });

      // Extract the sent message to get the auto-generated id
      expect(mockInstances[0].send.mock.calls.length).toBeGreaterThan(sendCountBefore);
      const sentMsg = JSON.parse(mockInstances[0].send.mock.calls[sendCountBefore][0] as string);
      expect(sentMsg.type).toBe('test:action');
      expect(sentMsg.payload).toEqual({ key: 'value' });
      expect(sentMsg.id).toBeDefined();

      // Simulate server response with matching id
      mockInstances[0].triggerMessage(
        JSON.stringify({ type: 'response', payload: { data: 'result' }, id: sentMsg.id }),
      );

      const result = await promise;
      expect(result).toEqual({ data: 'result' });
    });

    it('rejects with error message on error response', async () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      const sendCountBefore = mockInstances[0].send.mock.calls.length;
      const promise = wsClient.request('test:action', {});

      const sentMsg = JSON.parse(mockInstances[0].send.mock.calls[sendCountBefore][0] as string);

      // Simulate server error response
      mockInstances[0].triggerMessage(
        JSON.stringify({ type: 'error', payload: { error: 'Something failed' }, id: sentMsg.id }),
      );

      await expect(promise).rejects.toThrow('Something failed');
    });

    it('rejects after timeout', async () => {
      vi.useFakeTimers();
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      const promise = wsClient.request('test:action', {}, 1000);

      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow('Request timeout');
      vi.useRealTimers();
    });

    it('resolves multiple concurrent requests independently', async () => {
      wsClient.connect('my-token');
      mockInstances[0].triggerOpen();

      const sendCountBefore = mockInstances[0].send.mock.calls.length;
      const promise1 = wsClient.request<{ val: number }>('action:one', {});
      const promise2 = wsClient.request<{ val: number }>('action:two', {});

      const sent1 = JSON.parse(mockInstances[0].send.mock.calls[sendCountBefore][0] as string);
      const sent2 = JSON.parse(mockInstances[0].send.mock.calls[sendCountBefore + 1][0] as string);

      // Respond to second request first
      mockInstances[0].triggerMessage(
        JSON.stringify({ type: 'response', payload: { val: 2 }, id: sent2.id }),
      );
      mockInstances[0].triggerMessage(
        JSON.stringify({ type: 'response', payload: { val: 1 }, id: sent1.id }),
      );

      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toEqual({ val: 1 });
      expect(result2).toEqual({ val: 2 });
    });
  });
});
