import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TextReceivePayload } from 'discord-clone-shared';

const { mockSend, mockApiRequest } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockApiRequest: vi.fn(),
}));

// Mock encryptionService
vi.mock('./encryptionService', () => ({
  encryptMessage: vi.fn((plaintext: string) => ({
    ciphertext: `encrypted:${plaintext}`,
    nonce: 'mock-nonce',
  })),
  decryptMessage: vi.fn((ciphertext: string) =>
    ciphertext.startsWith('encrypted:') ? ciphertext.slice(10) : `decrypted:${ciphertext}`,
  ),
}));

// Mock wsClient
vi.mock('./wsClient', () => ({
  wsClient: { send: mockSend },
}));

// Mock apiClient
vi.mock('./apiClient', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

// Mock useAuthStore
vi.mock('../stores/useAuthStore', () => ({
  default: {
    getState: () => ({
      groupKey: new Uint8Array(32),
      user: { id: 'current-user', username: 'me', role: 'user' },
    }),
  },
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'mock-uuid-1234' });

import useMessageStore from '../stores/useMessageStore';
import { sendMessage, fetchMessages, fetchOlderMessages } from './messageService';

beforeEach(() => {
  useMessageStore.setState({
    messages: new Map(),
    hasMoreMessages: new Map(),
    isLoadingMore: false,
    currentChannelId: null,
    isLoading: false,
    error: null,
    sendError: null,
  });
  vi.clearAllMocks();
});

describe('messageService', () => {
  describe('sendMessage', () => {
    it('encrypts message before sending via WebSocket', () => {
      sendMessage('ch-1', 'Hello world');

      expect(mockSend).toHaveBeenCalledOnce();
      const sent = mockSend.mock.calls[0][0];
      expect(sent.type).toBe('text:send');
      expect(sent.payload.content).toBe('encrypted:Hello world');
      expect(sent.payload.nonce).toBe('mock-nonce');
      expect(sent.payload.channelId).toBe('ch-1');
      expect(sent.id).toBe('mock-uuid-1234');
    });

    it('adds optimistic message with sending status to store', () => {
      sendMessage('ch-1', 'Test');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(1);
      expect(messages![0].content).toBe('Test');
      expect(messages![0].status).toBe('sending');
      expect(messages![0].tempId).toBe('mock-uuid-1234');
    });

    it('clears sendError on send', () => {
      useMessageStore.setState({ sendError: 'previous error' });
      sendMessage('ch-1', 'Test');
      expect(useMessageStore.getState().sendError).toBeNull();
    });

    it('marks message failed if wsClient.send throws', () => {
      mockSend.mockImplementation(() => { throw new Error('Not connected'); });

      sendMessage('ch-1', 'Fail');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages![0].status).toBe('failed');
    });

    it('rejects messages exceeding MAX_MESSAGE_LENGTH', () => {
      const longMessage = 'a'.repeat(2001);
      sendMessage('ch-1', longMessage);

      expect(mockSend).not.toHaveBeenCalled();
      expect(useMessageStore.getState().sendError).toContain('2000');
    });
  });

  describe('fetchMessages', () => {
    it('fetches, decrypts, and stores messages', async () => {
      mockApiRequest.mockResolvedValue([
        {
          messageId: 'msg-1',
          channelId: 'ch-1',
          authorId: 'user-1',
          content: 'encrypted:Hello',
          nonce: 'n1',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          messageId: 'msg-2',
          channelId: 'ch-1',
          authorId: 'user-2',
          content: 'encrypted:World',
          nonce: 'n2',
          createdAt: '2024-01-01T00:01:00.000Z',
        },
      ]);

      await fetchMessages('ch-1');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(2);
      // Reversed from DESC order to chronological
      expect(messages![0].content).toBe('World');
      expect(messages![1].content).toBe('Hello');
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('sets error on fetch failure', async () => {
      mockApiRequest.mockRejectedValue(new Error('Network error'));

      await fetchMessages('ch-1');

      expect(useMessageStore.getState().error).toBe('Network error');
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('sets loading state during fetch', async () => {
      let resolvePromise: (value: TextReceivePayload[]) => void;
      mockApiRequest.mockReturnValue(new Promise<TextReceivePayload[]>((resolve) => {
        resolvePromise = resolve;
      }));

      const fetchPromise = fetchMessages('ch-1');
      expect(useMessageStore.getState().isLoading).toBe(true);

      resolvePromise!([]);
      await fetchPromise;
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('fetches without cursor when no before option provided', async () => {
      mockApiRequest.mockResolvedValue([]);
      await fetchMessages('ch-1');

      expect(mockApiRequest).toHaveBeenCalledWith('/api/channels/ch-1/messages?limit=50');
    });

    it('appends before query param when cursor provided', async () => {
      mockApiRequest.mockResolvedValue([]);
      await fetchMessages('ch-1', { before: 'msg-abc' });

      expect(mockApiRequest).toHaveBeenCalledWith('/api/channels/ch-1/messages?limit=50&before=msg-abc');
    });

    it('sets hasMoreMessages true when 50 messages returned', async () => {
      const fiftyMessages = Array.from({ length: 50 }, (_, i) => ({
        messageId: `msg-${i}`,
        channelId: 'ch-1',
        authorId: 'user-1',
        content: `encrypted:msg${i}`,
        nonce: `n${i}`,
        createdAt: '2024-01-01T00:00:00.000Z',
      }));
      mockApiRequest.mockResolvedValue(fiftyMessages);
      await fetchMessages('ch-1');

      expect(useMessageStore.getState().hasMoreMessages.get('ch-1')).toBe(true);
    });

    it('sets hasMoreMessages false when fewer than 50 messages returned', async () => {
      mockApiRequest.mockResolvedValue([
        {
          messageId: 'msg-1',
          channelId: 'ch-1',
          authorId: 'user-1',
          content: 'encrypted:Hello',
          nonce: 'n1',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]);
      await fetchMessages('ch-1');

      expect(useMessageStore.getState().hasMoreMessages.get('ch-1')).toBe(false);
    });
  });

  describe('fetchOlderMessages', () => {
    it('gets oldest message ID from store and calls fetchMessages with cursor', async () => {
      // Set up store with existing messages
      useMessageStore.getState().setMessages('ch-1', [
        { id: 'oldest-msg', channelId: 'ch-1', authorId: 'user-1', content: 'First', createdAt: '2024-01-01T00:00:00Z', status: 'sent' },
        { id: 'newest-msg', channelId: 'ch-1', authorId: 'user-1', content: 'Last', createdAt: '2024-01-01T01:00:00Z', status: 'sent' },
      ]);
      mockApiRequest.mockResolvedValue([]);

      await fetchOlderMessages('ch-1');

      expect(mockApiRequest).toHaveBeenCalledWith('/api/channels/ch-1/messages?limit=50&before=oldest-msg');
    });

    it('sets isLoadingMore during request', async () => {
      useMessageStore.getState().setMessages('ch-1', [
        { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Hello', createdAt: '2024-01-01T00:00:00Z', status: 'sent' },
      ]);

      let resolvePromise: (value: TextReceivePayload[]) => void;
      mockApiRequest.mockReturnValue(new Promise<TextReceivePayload[]>((resolve) => {
        resolvePromise = resolve;
      }));

      const fetchPromise = fetchOlderMessages('ch-1');
      expect(useMessageStore.getState().isLoadingMore).toBe(true);

      resolvePromise!([]);
      await fetchPromise;
      expect(useMessageStore.getState().isLoadingMore).toBe(false);
    });

    it('calls prependMessages with decrypted results', async () => {
      useMessageStore.getState().setMessages('ch-1', [
        { id: 'existing-msg', channelId: 'ch-1', authorId: 'user-1', content: 'Existing', createdAt: '2024-01-01T01:00:00Z', status: 'sent' },
      ]);

      mockApiRequest.mockResolvedValue([
        { messageId: 'older-msg', channelId: 'ch-1', authorId: 'user-2', content: 'encrypted:Older', nonce: 'n1', createdAt: '2024-01-01T00:00:00Z' },
      ]);

      await fetchOlderMessages('ch-1');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(2);
      // Prepended older message should be first
      expect(messages![0].content).toBe('Older');
      expect(messages![1].content).toBe('Existing');
    });

    it('returns without fetching when no messages exist (no oldest ID)', async () => {
      await fetchOlderMessages('ch-1');

      expect(mockApiRequest).not.toHaveBeenCalled();
      expect(useMessageStore.getState().isLoadingMore).toBe(false);
    });

    it('resets isLoadingMore on error', async () => {
      useMessageStore.getState().setMessages('ch-1', [
        { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Hello', createdAt: '2024-01-01T00:00:00Z', status: 'sent' },
      ]);
      mockApiRequest.mockRejectedValue(new Error('Network error'));

      await fetchOlderMessages('ch-1');

      expect(useMessageStore.getState().isLoadingMore).toBe(false);
    });
  });
});
