import { create } from 'zustand';
import { encryptMessage, decryptMessage } from '../services/encryptionService';
import { wsClient } from '../services/wsClient';
import { apiRequest } from '../services/apiClient';
import { WS_TYPES } from 'discord-clone-shared';
import type { TextSendPayload, TextReceivePayload } from 'discord-clone-shared';
import useAuthStore from './useAuthStore';

export interface DecryptedMessage {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  status: 'sent' | 'sending' | 'failed';
  tempId?: string;
}

interface MessageState {
  messages: Map<string, DecryptedMessage[]>;
  currentChannelId: string | null;
  isLoading: boolean;
  error: string | null;
  sendError: string | null;
  fetchMessages: (channelId: string) => Promise<void>;
  sendMessage: (channelId: string, plaintext: string) => void;
  addReceivedMessage: (payload: TextReceivePayload) => void;
  confirmMessage: (tempId: string, serverMessage: TextReceivePayload) => void;
  markMessageFailed: (tempId: string) => void;
  setCurrentChannel: (channelId: string | null) => void;
  clearError: () => void;
  clearSendError: () => void;
}

const useMessageStore = create<MessageState>((set, get) => ({
  messages: new Map(),
  currentChannelId: null,
  isLoading: false,
  error: null,
  sendError: null,

  fetchMessages: async (channelId: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiRequest<TextReceivePayload[]>(
        `/api/channels/${channelId}/messages`,
      );

      const groupKey = useAuthStore.getState().groupKey;
      if (!groupKey) {
        set({ isLoading: false, error: 'Encryption key not available' });
        return;
      }

      const decrypted: DecryptedMessage[] = result.map((msg) => ({
        id: msg.messageId,
        channelId: msg.channelId,
        authorId: msg.authorId,
        content: decryptMessage(msg.content, msg.nonce, groupKey),
        createdAt: msg.createdAt,
        status: 'sent' as const,
      }));

      // API returns newest first — reverse for chronological display
      decrypted.reverse();

      const newMessages = new Map(get().messages);
      newMessages.set(channelId, decrypted);
      set({ messages: newMessages, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load messages',
      });
    }
  },

  sendMessage: (channelId: string, plaintext: string) => {
    const groupKey = useAuthStore.getState().groupKey;
    if (!groupKey) {
      set({ sendError: 'Encryption key not available' });
      return;
    }

    const { ciphertext, nonce } = encryptMessage(plaintext, groupKey);
    const tempId = crypto.randomUUID();
    const userId = useAuthStore.getState().user?.id ?? '';

    // Add optimistic message
    const optimistic: DecryptedMessage = {
      id: tempId,
      channelId,
      authorId: userId,
      content: plaintext,
      createdAt: new Date().toISOString(),
      status: 'sending',
      tempId,
    };

    const newMessages = new Map(get().messages);
    const existing = newMessages.get(channelId) ?? [];
    newMessages.set(channelId, [...existing, optimistic]);
    set({ messages: newMessages, sendError: null });

    // Send via WebSocket
    try {
      wsClient.send({
        type: WS_TYPES.TEXT_SEND,
        payload: {
          channelId,
          content: ciphertext,
          nonce,
        } satisfies TextSendPayload,
        id: tempId,
      });
    } catch {
      // Mark as failed immediately if send throws
      get().markMessageFailed(tempId);
    }
  },

  addReceivedMessage: (payload: TextReceivePayload) => {
    const groupKey = useAuthStore.getState().groupKey;
    if (!groupKey) return;

    let plaintext: string;
    try {
      plaintext = decryptMessage(payload.content, payload.nonce, groupKey);
    } catch {
      plaintext = '[Decryption failed]';
    }

    const msg: DecryptedMessage = {
      id: payload.messageId,
      channelId: payload.channelId,
      authorId: payload.authorId,
      content: plaintext,
      createdAt: payload.createdAt,
      status: 'sent',
    };

    const newMessages = new Map(get().messages);
    const existing = newMessages.get(payload.channelId) ?? [];
    newMessages.set(payload.channelId, [...existing, msg]);
    set({ messages: newMessages });
  },

  confirmMessage: (tempId: string, serverMessage: TextReceivePayload) => {
    const { messages } = get();
    const channelId = serverMessage.channelId;
    const channelMessages = messages.get(channelId);
    if (!channelMessages) return;

    const updated = channelMessages.map((msg) =>
      msg.tempId === tempId
        ? {
            ...msg,
            id: serverMessage.messageId,
            createdAt: serverMessage.createdAt,
            status: 'sent' as const,
            tempId: undefined,
          }
        : msg,
    );

    const newMessages = new Map(messages);
    newMessages.set(channelId, updated);
    set({ messages: newMessages });
  },

  markMessageFailed: (tempId: string) => {
    const { messages } = get();
    const newMessages = new Map(messages);

    for (const [channelId, channelMessages] of newMessages) {
      const updated = channelMessages.map((msg) =>
        msg.tempId === tempId ? { ...msg, status: 'failed' as const } : msg,
      );
      newMessages.set(channelId, updated);
    }

    set({ messages: newMessages, sendError: 'Message failed to send' });
  },

  setCurrentChannel: (channelId: string | null) => {
    set({ currentChannelId: channelId });
  },

  clearError: () => set({ error: null }),
  clearSendError: () => set({ sendError: null }),
}));

export default useMessageStore;
