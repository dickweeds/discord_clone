import type { WsMessage, PresenceUpdatePayload, PresenceSyncPayload, TextReceivePayload } from 'discord-clone-shared';
import { WS_TYPES, WS_RECONNECT_DELAY, WS_MAX_RECONNECT_DELAY } from 'discord-clone-shared';
import { usePresenceStore } from '../stores/usePresenceStore';

type MessageCallback = (payload: unknown) => void;

class WsClient {
  private socket: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageCallback>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = WS_RECONNECT_DELAY;
  private accessToken: string | null = null;
  private intentionalClose = false;

  connect(accessToken: string): void {
    this.accessToken = accessToken;
    this.intentionalClose = false;

    usePresenceStore.getState().setConnectionState('connecting');

    const wsUrl = this.buildWsUrl(accessToken);
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.reconnectDelay = WS_RECONNECT_DELAY;
      usePresenceStore.getState().setConnectionState('connected');
    };

    this.socket.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data as string);
    };

    this.socket.onclose = (event: CloseEvent) => {
      this.socket = null;
      this.markPendingMessagesFailed();

      if (this.intentionalClose || event.code === 4001) {
        usePresenceStore.getState().setConnectionState('disconnected');
        return;
      }

      this.startReconnection();
    };

    this.socket.onerror = () => {
      // Error handling is done in onclose
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();

    if (this.socket) {
      this.socket.close(1000, 'User disconnect');
      this.socket = null;
    }

    usePresenceStore.getState().setConnectionState('disconnected');
  }

  send<T>(message: WsMessage<T>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.socket.send(JSON.stringify(message));
  }

  on(type: string, callback: MessageCallback): () => void {
    let callbacks = this.handlers.get(type);
    if (!callbacks) {
      callbacks = new Set();
      this.handlers.set(type, callbacks);
    }
    callbacks.add(callback);

    return () => {
      callbacks!.delete(callback);
      if (callbacks!.size === 0) {
        this.handlers.delete(type);
      }
    };
  }

  updateToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  getConnectionState(): 'connected' | 'connecting' | 'disconnected' | 'reconnecting' {
    return usePresenceStore.getState().connectionState;
  }

  private markPendingMessagesFailed(): void {
    import('../stores/useMessageStore').then(({ default: useMessageStore }) => {
      const { messages } = useMessageStore.getState();
      for (const [, channelMessages] of messages) {
        for (const msg of channelMessages) {
          if (msg.status === 'sending' && msg.tempId) {
            useMessageStore.getState().markMessageFailed(msg.tempId);
          }
        }
      }
    }).catch(() => {});
  }

  private async handleTextReceive(message: WsMessage<TextReceivePayload>): Promise<void> {
    const payload = message.payload;
    try {
      const useAuthStore = (await import('../stores/useAuthStore')).default;
      const useMessageStore = (await import('../stores/useMessageStore')).default;
      const currentUserId = useAuthStore.getState().user?.id;

      if (payload.authorId === currentUserId && message.id) {
        // Sender confirmation — match by tempId
        useMessageStore.getState().confirmMessage(message.id, payload);
      } else {
        // Message from another user
        useMessageStore.getState().addReceivedMessage(payload);
      }
    } catch {
      // Module import failed — ignore
    }
  }

  private buildWsUrl(token: string): string {
    const baseUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
    return `${baseUrl}/ws?token=${encodeURIComponent(token)}`;
  }

  private handleMessage(raw: string): void {
    let message: WsMessage;
    try {
      message = JSON.parse(raw) as WsMessage;
    } catch {
      console.warn('[wsClient] Failed to parse incoming WebSocket message');
      return;
    }

    // Route presence messages to store
    if (message.type === WS_TYPES.PRESENCE_UPDATE) {
      const payload = message.payload as PresenceUpdatePayload;
      if (payload.status === 'online') {
        usePresenceStore.getState().setUserOnline(payload.userId);
      } else {
        usePresenceStore.getState().setUserOffline(payload.userId);
      }
    } else if (message.type === WS_TYPES.PRESENCE_SYNC) {
      const payload = message.payload as PresenceSyncPayload;
      usePresenceStore.getState().syncOnlineUsers(payload.users);
    } else if (message.type === WS_TYPES.TEXT_RECEIVE) {
      this.handleTextReceive(message as WsMessage<TextReceivePayload>);
    }

    // Dispatch to registered handlers
    const callbacks = this.handlers.get(message.type);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(message.payload);
      }
    }
  }

  private startReconnection(): void {
    usePresenceStore.getState().setConnectionState('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(async () => {
      if (this.intentionalClose) return;

      // Try refreshing the token before reconnecting
      try {
        const useAuthStore = (await import('../stores/useAuthStore')).default;
        const { accessToken } = useAuthStore.getState();

        if (!accessToken) {
          // Try refreshing tokens
          try {
            await useAuthStore.getState().refreshTokens();
            this.accessToken = useAuthStore.getState().accessToken;
          } catch {
            // Token refresh failed — stop reconnecting
            usePresenceStore.getState().setConnectionState('disconnected');
            return;
          }
        } else {
          this.accessToken = accessToken;
        }
      } catch {
        // Module import failed — use existing token
      }

      if (!this.accessToken) {
        usePresenceStore.getState().setConnectionState('disconnected');
        return;
      }

      // Attempt reconnection
      const wsUrl = this.buildWsUrl(this.accessToken);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.socket = ws;
        this.reconnectDelay = WS_RECONNECT_DELAY;
        usePresenceStore.getState().setConnectionState('connected');

        ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event.data as string);
        };

        ws.onclose = (event: CloseEvent) => {
          this.socket = null;
          if (this.intentionalClose || event.code === 4001) {
            usePresenceStore.getState().setConnectionState('disconnected');
            return;
          }
          this.startReconnection();
        };

        ws.onerror = () => {};
      };

      ws.onerror = () => {
        ws.close();
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, WS_MAX_RECONNECT_DELAY);
        this.scheduleReconnect();
      };
    }, this.reconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const wsClient = new WsClient();
