import { create } from 'zustand';
import type { TextReceivePayload, ReactionSummary } from 'discord-clone-shared';

export type { ReactionSummary };

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
  reactions: Map<string, ReactionSummary[]>;
  hasMoreMessages: Map<string, boolean>;
  cursors: Map<string, string | null>;
  isLoadingMore: boolean;
  currentChannelId: string | null;
  isLoading: boolean;
  error: string | null;
  sendError: string | null;
  addOptimisticMessage: (channelId: string, message: DecryptedMessage) => void;
  setMessages: (channelId: string, messages: DecryptedMessage[], hasMore?: boolean, cursor?: string | null) => void;
  prependMessages: (channelId: string, messages: DecryptedMessage[], hasMore: boolean, cursor?: string | null) => void;
  getCursor: (channelId: string) => string | null;
  setCursor: (channelId: string, cursor: string | null) => void;
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
  setReactionsForMessages: (reactionsMap: Map<string, ReactionSummary[]>) => void;
  addReaction: (messageId: string, userId: string, emoji: string) => void;
  removeReaction: (messageId: string, userId: string, emoji: string) => void;
}

const useMessageStore = create<MessageState>((set, get) => ({
  messages: new Map(),
  reactions: new Map(),
  hasMoreMessages: new Map(),
  cursors: new Map(),
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

  setMessages: (channelId: string, msgs: DecryptedMessage[], hasMore?: boolean, cursor?: string | null) => {
    const newMessages = new Map(get().messages);
    newMessages.set(channelId, msgs);
    const newHasMore = new Map(get().hasMoreMessages);
    newHasMore.set(channelId, hasMore ?? true);
    const newCursors = new Map(get().cursors);
    newCursors.set(channelId, cursor ?? null);
    set({ messages: newMessages, hasMoreMessages: newHasMore, cursors: newCursors });
  },

  prependMessages: (channelId: string, msgs: DecryptedMessage[], hasMore: boolean, cursor?: string | null) => {
    const newMessages = new Map(get().messages);
    const existing = newMessages.get(channelId) ?? [];
    newMessages.set(channelId, [...msgs, ...existing]);
    const newHasMore = new Map(get().hasMoreMessages);
    newHasMore.set(channelId, hasMore);
    const newCursors = new Map(get().cursors);
    newCursors.set(channelId, cursor ?? null);
    set({ messages: newMessages, hasMoreMessages: newHasMore, cursors: newCursors });
  },

  getCursor: (channelId: string): string | null => {
    return get().cursors.get(channelId) ?? null;
  },

  setCursor: (channelId: string, cursor: string | null) => {
    const newCursors = new Map(get().cursors);
    newCursors.set(channelId, cursor);
    set({ cursors: newCursors });
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

  setReactionsForMessages: (reactionsMap: Map<string, ReactionSummary[]>) => {
    const newReactions = new Map(get().reactions);
    for (const [messageId, summaries] of reactionsMap) {
      newReactions.set(messageId, summaries);
    }
    set({ reactions: newReactions });
  },

  addReaction: (messageId: string, userId: string, emoji: string) => {
    const newReactions = new Map(get().reactions);
    const existing = newReactions.get(messageId) ?? [];

    const emojiEntry = existing.find((r) => r.emoji === emoji);
    if (emojiEntry) {
      // Idempotent — don't double-add same user
      if (emojiEntry.userIds.includes(userId)) return;
      newReactions.set(messageId, existing.map((r) =>
        r.emoji === emoji
          ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId] }
          : r,
      ));
    } else {
      newReactions.set(messageId, [...existing, { emoji, count: 1, userIds: [userId] }]);
    }
    set({ reactions: newReactions });
  },

  removeReaction: (messageId: string, userId: string, emoji: string) => {
    const newReactions = new Map(get().reactions);
    const existing = newReactions.get(messageId);
    if (!existing) return;

    const emojiEntry = existing.find((r) => r.emoji === emoji);
    if (!emojiEntry || !emojiEntry.userIds.includes(userId)) return;

    if (emojiEntry.count <= 1) {
      // Remove the entry entirely
      const filtered = existing.filter((r) => r.emoji !== emoji);
      if (filtered.length === 0) {
        newReactions.delete(messageId);
      } else {
        newReactions.set(messageId, filtered);
      }
    } else {
      newReactions.set(messageId, existing.map((r) =>
        r.emoji === emoji
          ? { ...r, count: r.count - 1, userIds: r.userIds.filter((id) => id !== userId) }
          : r,
      ));
    }
    set({ reactions: newReactions });
  },
}));

export default useMessageStore;
