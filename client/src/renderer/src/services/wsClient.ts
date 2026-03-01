import type {
  WsMessage,
  PresenceUpdatePayload,
  PresenceSyncPayload,
  TextReceivePayload,
  TextErrorPayload,
  ChannelCreatedPayload,
  ChannelDeletedPayload,
  MemberAddedPayload,
  MemberRemovedPayload,
  VoicePeerJoinedPayload,
  VoicePeerLeftPayload,
  VoiceNewProducerPayload,
  VoiceProducerClosedPayload,
  VoiceConsumeResponse,
  VoiceChannelPresencePayload,
  VoiceStatePayload,
} from 'discord-clone-shared';
import { WS_TYPES, WS_RECONNECT_DELAY, WS_MAX_RECONNECT_DELAY } from 'discord-clone-shared';
import { usePresenceStore } from '../stores/usePresenceStore';
import { useChannelStore } from '../stores/useChannelStore';
import { useMemberStore } from '../stores/useMemberStore';
import { useAdminNotificationStore } from '../stores/useAdminNotificationStore';
import * as mediaService from './mediaService';
import * as vadService from './vadService';

type MessageCallback = (payload: unknown) => void;
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class WsClient {
  private socket: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageCallback>>();
  private pendingRequests = new Map<string, PendingRequest>();
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
      this.requestVoicePresenceSync();
    };

    this.socket.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data as string);
    };

    this.socket.onclose = (event: CloseEvent) => {
      this.socket = null;
      this.markPendingMessagesFailed();
      this.cleanupVoiceOnDisconnect();

      if (this.intentionalClose || event.code === 4001 || event.code === 4003) {
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

  request<T>(type: string, payload: unknown, timeout = 5000): Promise<T> {
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.send({ type, payload, id });
    });
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
    }).catch((err) => {
      console.warn('[wsClient] Failed to mark pending messages as failed:', err);
    });
  }

  private async handleNewProducer(payload: VoiceNewProducerPayload): Promise<void> {
    const recvTransport = mediaService.getRecvTransport();
    if (!recvTransport) return;

    try {
      const consumeResponse = await this.request<VoiceConsumeResponse>(
        'voice:consume',
        { producerId: payload.producerId },
      );

      if (payload.kind === 'video') {
        const consumer = await mediaService.consumeVideo(
          recvTransport,
          {
            consumerId: consumeResponse.consumerId,
            producerId: consumeResponse.producerId,
            kind: 'video',
            rtpParameters: consumeResponse.rtpParameters as Parameters<typeof mediaService.consumeVideo>[1]['rtpParameters'],
          },
          payload.peerId,
        );

        import('../stores/useVoiceStore').then(({ useVoiceStore }) => {
          useVoiceStore.getState().addVideoParticipant(payload.peerId);
        }).catch((err) => {
          console.warn('[wsClient] Failed to add video participant:', err);
        });

        await this.request<void>('voice:consumer-resume', { consumerId: consumer.id });
      } else {
        const consumer = await mediaService.consumeAudio(recvTransport, {
          consumerId: consumeResponse.consumerId,
          producerId: consumeResponse.producerId,
          kind: consumeResponse.kind as 'audio',
          rtpParameters: consumeResponse.rtpParameters as Parameters<typeof mediaService.consumeAudio>[1]['rtpParameters'],
        });

        await this.request<void>('voice:consumer-resume', { consumerId: consumer.id });

        // Start remote VAD for speaking detection
        vadService.startRemoteVAD(consumer, payload.peerId, (peerId, speaking) => {
          import('../stores/useVoiceStore').then(({ useVoiceStore }) => {
            useVoiceStore.getState().setSpeaking(peerId, speaking);
          }).catch((err) => {
            console.warn('[wsClient] Failed to update speaking state:', err);
          });
        });
      }
    } catch (err) {
      console.warn('[wsClient] Failed to consume producer:', (err as Error).message);
    }
  }

  private async handleTextReceive(message: WsMessage<TextReceivePayload>): Promise<void> {
    const payload = message.payload;

    let useAuthStore: typeof import('../stores/useAuthStore').default;
    let useMessageStore: typeof import('../stores/useMessageStore').default;
    let decryptMessage: typeof import('./encryptionService').decryptMessage;

    try {
      useAuthStore = (await import('../stores/useAuthStore')).default;
      useMessageStore = (await import('../stores/useMessageStore')).default;
      decryptMessage = (await import('./encryptionService')).decryptMessage;
    } catch (err) {
      console.warn('[wsClient] Failed to import modules for text:receive handling:', err);
      return;
    }

    const currentUserId = useAuthStore.getState().user?.id;

    if (payload.authorId === currentUserId && message.id) {
      // Sender confirmation — match by tempId
      useMessageStore.getState().confirmMessage(message.id, payload);
    } else {
      // Message from another user — decrypt and add to store
      const groupKey = useAuthStore.getState().groupKey;
      if (!groupKey) return;

      let plaintext: string;
      try {
        plaintext = decryptMessage(payload.content, payload.nonce, groupKey);
      } catch {
        plaintext = '[Decryption failed]';
      }

      useMessageStore.getState().addReceivedMessage({
        id: payload.messageId,
        channelId: payload.channelId,
        authorId: payload.authorId,
        content: plaintext,
        createdAt: payload.createdAt,
        status: 'sent',
      });
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

    // Handle request-response pattern
    if ((message.type === 'response' || message.type === 'error') && message.id) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        clearTimeout(pending.timer);
        if (message.type === 'error') {
          const errorPayload = message.payload as { error: string };
          pending.reject(new Error(errorPayload.error));
        } else {
          pending.resolve(message.payload);
        }
        return;
      }
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
    } else if (message.type === WS_TYPES.TEXT_ERROR) {
      const payload = message.payload as TextErrorPayload;
      if (payload.tempId) {
        import('../stores/useMessageStore').then(({ default: useMessageStore }) => {
          useMessageStore.getState().markMessageFailed(payload.tempId);
        }).catch((err) => {
          console.warn('[wsClient] Failed to mark message as failed:', err);
        });
      }
    } else if (message.type === WS_TYPES.CHANNEL_CREATED) {
      const payload = message.payload as ChannelCreatedPayload;
      useChannelStore.getState().addChannel(payload.channel);
    } else if (message.type === WS_TYPES.CHANNEL_DELETED) {
      const payload = message.payload as ChannelDeletedPayload;
      useChannelStore.getState().removeChannel(payload.channelId);
    } else if (message.type === WS_TYPES.USER_KICKED) {
      useAdminNotificationStore.getState().showKicked();
    } else if (message.type === WS_TYPES.USER_BANNED) {
      useAdminNotificationStore.getState().showBanned();
    } else if (message.type === WS_TYPES.MEMBER_ADDED) {
      const payload = message.payload as MemberAddedPayload;
      useMemberStore.getState().addMember(payload);
    } else if (message.type === WS_TYPES.MEMBER_REMOVED) {
      const payload = message.payload as MemberRemovedPayload;
      useMemberStore.getState().removeMember(payload.userId);
    } else if (message.type === WS_TYPES.VOICE_PEER_JOINED) {
      const payload = message.payload as VoicePeerJoinedPayload;
      import('../stores/useVoiceStore').then(({ useVoiceStore }) => {
        useVoiceStore.getState().addPeer(payload.channelId, payload.userId);
      }).catch((err) => {
        console.warn('[wsClient] Failed to add voice peer:', err);
      });
    } else if (message.type === WS_TYPES.VOICE_PEER_LEFT) {
      const payload = message.payload as VoicePeerLeftPayload;
      import('../stores/useVoiceStore').then(({ useVoiceStore }) => {
        useVoiceStore.getState().removePeer(payload.channelId, payload.userId);
        useVoiceStore.getState().removeVideoParticipant(payload.userId);
      }).catch((err) => {
        console.warn('[wsClient] Failed to remove voice peer:', err);
      });
    } else if (message.type === WS_TYPES.VOICE_NEW_PRODUCER) {
      const payload = message.payload as VoiceNewProducerPayload;
      this.handleNewProducer(payload);
    } else if (message.type === WS_TYPES.VOICE_PRODUCER_CLOSED) {
      const payload = message.payload as VoiceProducerClosedPayload;
      if (payload.kind === 'video') {
        mediaService.removeVideoConsumerByProducerId(payload.producerId);
        if (payload.peerId) {
          import('../stores/useVoiceStore').then(({ useVoiceStore }) => {
            useVoiceStore.getState().removeVideoParticipant(payload.peerId);
          }).catch((err) => {
            console.warn('[wsClient] Failed to remove video participant:', err);
          });
        }
      } else {
        vadService.stopRemoteVAD(payload.peerId);
        mediaService.removeConsumerByProducerId(payload.producerId);
      }
    } else if (message.type === WS_TYPES.VOICE_PRESENCE_SYNC) {
      const payload = message.payload as VoiceChannelPresencePayload;
      import('../stores/useVoiceStore').then(({ useVoiceStore }) => {
        useVoiceStore.getState().syncParticipants(payload.participants);
      }).catch((err) => {
        console.warn('[wsClient] Failed to sync voice presence:', err);
      });
    } else if (message.type === WS_TYPES.VOICE_STATE) {
      const payload = message.payload as VoiceStatePayload;
      import('../stores/useVoiceStore').then(({ useVoiceStore }) => {
        useVoiceStore.getState().setRemoteMuteState(payload.userId, payload.muted, payload.deafened);
      }).catch((err) => {
        console.warn('[wsClient] Failed to set remote mute state:', err);
      });
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

        // Request fresh voice presence after reconnect
        this.requestVoicePresenceSync();

        ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event.data as string);
        };

        ws.onclose = (event: CloseEvent) => {
          this.socket = null;
          this.cleanupVoiceOnDisconnect();
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

  private cleanupVoiceOnDisconnect(): void {
    // Local cleanup only — skip sending voice:leave since WS is already down
    import('../stores/useVoiceStore').then(({ useVoiceStore }) => {
      useVoiceStore.getState().localCleanup();
    }).catch(() => {});
  }

  private requestVoicePresenceSync(): void {
    this.request<void>('voice:presence-sync', {}).catch(() => {
      // Server may not support presence-sync yet — non-critical
    });
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const wsClient = new WsClient();
