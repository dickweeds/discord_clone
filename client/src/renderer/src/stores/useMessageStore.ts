import { create } from 'zustand';
import type { TextReceivePayload } from 'discord-clone-shared';

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
  hasMoreMessages: Map<string, boolean>;
  isLoadingMore: boolean;
  currentChannelId: string | null;
  isLoading: boolean;
  error: string | null;
  sendError: string | null;
  addOptimisticMessage: (channelId: string, message: DecryptedMessage) => void;
  setMessages: (channelId: string, messages: DecryptedMessage[], hasMore?: boolean) => void;
  prependMessages: (channelId: string, messages: DecryptedMessage[], hasMore: boolean) => void;
  getOldestMessageId: (channelId: string) => string | undefined;
  addReceivedMessage: (message: DecryptedMessage) => void;
  confirmMessage: (tempId: string, serverMessage: TextReceivePayload) => void;
  markMessageFailed: (tempId: string) => void;
  setCurrentChannel: (channelId: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setLoadingMore: (isLoadingMore: boolean) => void;
  setError: (error: string | null) => void;
  setSendError: (sendError: string | null) => void;
  clearError: () => void;
  clearSendError: () => void;
}

const useMessageStore = create<MessageState>((set, get) => ({
  messages: new Map(),
  hasMoreMessages: new Map(),
  isLoadingMore: false,
  currentChannelId: null,
  isLoading: false,
  error: null,
  sendError: null,

  addOptimisticMessage: (channelId: string, message: DecryptedMessage) => {
    const newMessages = new Map(get().messages);
    const existing = newMessages.get(channelId) ?? [];
    newMessages.set(channelId, [...existing, message]);
    set({ messages: newMessages, sendError: null });
  },

  setMessages: (channelId: string, msgs: DecryptedMessage[], hasMore?: boolean) => {
    const newMessages = new Map(get().messages);
    newMessages.set(channelId, msgs);
    const newHasMore = new Map(get().hasMoreMessages);
    newHasMore.set(channelId, hasMore ?? true);
    set({ messages: newMessages, hasMoreMessages: newHasMore });
  },

  prependMessages: (channelId: string, msgs: DecryptedMessage[], hasMore: boolean) => {
    const newMessages = new Map(get().messages);
    const existing = newMessages.get(channelId) ?? [];
    newMessages.set(channelId, [...msgs, ...existing]);
    const newHasMore = new Map(get().hasMoreMessages);
    newHasMore.set(channelId, hasMore);
    set({ messages: newMessages, hasMoreMessages: newHasMore });
  },

  getOldestMessageId: (channelId: string): string | undefined => {
    const msgs = get().messages.get(channelId);
    if (!msgs || msgs.length === 0) return undefined;
    return msgs[0].id;
  },

  addReceivedMessage: (message: DecryptedMessage) => {
    const newMessages = new Map(get().messages);
    const existing = newMessages.get(message.channelId) ?? [];
    newMessages.set(message.channelId, [...existing, message]);
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

  setLoading: (isLoading: boolean) => set({ isLoading }),
  setLoadingMore: (isLoadingMore: boolean) => set({ isLoadingMore }),
  setError: (error: string | null) => set({ error }),
  setSendError: (sendError: string | null) => set({ sendError }),
  clearError: () => set({ error: null }),
  clearSendError: () => set({ sendError: null }),
}));

export default useMessageStore;
