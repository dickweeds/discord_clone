import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TextReceivePayload, ApiPaginatedList } from 'discord-clone-shared';

const { mockSend, mockApiGet } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockApiGet: vi.fn(),
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

// Mock apiClient — mock apiGet (used by fetchAndDecryptMessages) and apiRequest (unused but keep for module resolution)
vi.mock('./apiClient', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiRequest: vi.fn(),
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

function makePaginatedResponse(
  messages: TextReceivePayload[],
  cursor: string | null = null,
): ApiPaginatedList<TextReceivePayload> {
  return { data: messages, cursor, count: messages.length };
}

function makeMessage(overrides: Partial<TextReceivePayload> = {}): TextReceivePayload {
  return {
    messageId: 'msg-1',
    channelId: 'ch-1',
    authorId: 'user-1',
    content: 'encrypted:Hello',
    nonce: 'n1',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  useMessageStore.setState({
    messages: new Map(),
    hasMoreMessages: new Map(),
    cursors: new Map(),
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
    it('fetches, decrypts, and stores messages from paginated response', async () => {
      mockApiGet.mockResolvedValue(makePaginatedResponse([
        makeMessage({ messageId: 'msg-1', content: 'encrypted:Hello', createdAt: '2024-01-01T00:00:00.000Z' }),
        makeMessage({ messageId: 'msg-2', authorId: 'user-2', content: 'encrypted:World', createdAt: '2024-01-01T00:01:00.000Z' }),
      ], 'next-cursor-abc'));

      await fetchMessages('ch-1');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(2);
      // Reversed from DESC order to chronological
      expect(messages![0].content).toBe('World');
      expect(messages![1].content).toBe('Hello');
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('stores cursor from server response', async () => {
      mockApiGet.mockResolvedValue(makePaginatedResponse(
        [makeMessage()],
        'opaque-cursor-123',
      ));

      await fetchMessages('ch-1');

      expect(useMessageStore.getState().cursors.get('ch-1')).toBe('opaque-cursor-123');
    });

    it('sets hasMoreMessages based on cursor (not count heuristic)', async () => {
      // Server returns cursor !== null → hasMore = true
      mockApiGet.mockResolvedValue(makePaginatedResponse(
        [makeMessage()],
        'has-more-cursor',
      ));
      await fetchMessages('ch-1');
      expect(useMessageStore.getState().hasMoreMessages.get('ch-1')).toBe(true);

      // Server returns cursor === null → hasMore = false (even with exactly PAGE_LIMIT messages)
      const fiftyMessages = Array.from({ length: 50 }, (_, i) =>
        makeMessage({ messageId: `msg-${i}`, content: `encrypted:msg${i}`, nonce: `n${i}` }),
      );
      mockApiGet.mockResolvedValue(makePaginatedResponse(fiftyMessages, null));
      await fetchMessages('ch-2');
      expect(useMessageStore.getState().hasMoreMessages.get('ch-2')).toBe(false);
    });

    it('sets error on fetch failure', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      await fetchMessages('ch-1');

      expect(useMessageStore.getState().error).toBe('Network error');
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('sets loading state during fetch', async () => {
      let resolvePromise: (value: ApiPaginatedList<TextReceivePayload>) => void;
      mockApiGet.mockReturnValue(new Promise<ApiPaginatedList<TextReceivePayload>>((resolve) => {
        resolvePromise = resolve;
      }));

      const fetchPromise = fetchMessages('ch-1');
      expect(useMessageStore.getState().isLoading).toBe(true);

      resolvePromise!(makePaginatedResponse([]));
      await fetchPromise;
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('calls apiGet with correct URL and returnFullBody=true', async () => {
      mockApiGet.mockResolvedValue(makePaginatedResponse([]));
      await fetchMessages('ch-1');

      expect(mockApiGet).toHaveBeenCalledWith('/api/channels/ch-1/messages?limit=50', true);
    });
  });

  describe('fetchOlderMessages', () => {
    it('uses cursor from store (not message ID) to fetch next page', async () => {
      // Set initial messages with a cursor
      useMessageStore.getState().setMessages(
        'ch-1',
        [
          { id: 'oldest-msg', channelId: 'ch-1', authorId: 'user-1', content: 'First', createdAt: '2024-01-01T00:00:00Z', status: 'sent' },
          { id: 'newest-msg', channelId: 'ch-1', authorId: 'user-1', content: 'Last', createdAt: '2024-01-01T01:00:00Z', status: 'sent' },
        ],
        true,
        'opaque-cursor-xyz',
      );
      mockApiGet.mockResolvedValue(makePaginatedResponse([], null));

      await fetchOlderMessages('ch-1');

      // Should pass cursor as query param, NOT message ID
      expect(mockApiGet).toHaveBeenCalledWith(
        '/api/channels/ch-1/messages?limit=50&cursor=opaque-cursor-xyz',
        true,
      );
    });

    it('returns without fetching when cursor is null (no more pages)', async () => {
      // Set messages with null cursor (no more pages)
      useMessageStore.getState().setMessages(
        'ch-1',
        [{ id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Hello', createdAt: '2024-01-01T00:00:00Z', status: 'sent' }],
        false,
        null,
      );

      await fetchOlderMessages('ch-1');

      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('returns without fetching when no messages exist (no cursor)', async () => {
      await fetchOlderMessages('ch-1');

      expect(mockApiGet).not.toHaveBeenCalled();
      expect(useMessageStore.getState().isLoadingMore).toBe(false);
    });

    it('sets isLoadingMore during request', async () => {
      useMessageStore.getState().setMessages(
        'ch-1',
        [{ id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Hello', createdAt: '2024-01-01T00:00:00Z', status: 'sent' }],
        true,
        'some-cursor',
      );

      let resolvePromise: (value: ApiPaginatedList<TextReceivePayload>) => void;
      mockApiGet.mockReturnValue(new Promise<ApiPaginatedList<TextReceivePayload>>((resolve) => {
        resolvePromise = resolve;
      }));

      const fetchPromise = fetchOlderMessages('ch-1');
      expect(useMessageStore.getState().isLoadingMore).toBe(true);

      resolvePromise!(makePaginatedResponse([]));
      await fetchPromise;
      expect(useMessageStore.getState().isLoadingMore).toBe(false);
    });

    it('prepends decrypted messages to existing messages', async () => {
      useMessageStore.getState().setMessages(
        'ch-1',
        [{ id: 'existing-msg', channelId: 'ch-1', authorId: 'user-1', content: 'Existing', createdAt: '2024-01-01T01:00:00Z', status: 'sent' }],
        true,
        'cursor-for-page-2',
      );

      mockApiGet.mockResolvedValue(makePaginatedResponse(
        [makeMessage({ messageId: 'older-msg', authorId: 'user-2', content: 'encrypted:Older', nonce: 'n1', createdAt: '2024-01-01T00:00:00Z' })],
        null,
      ));

      await fetchOlderMessages('ch-1');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(2);
      // Prepended older message should be first
      expect(messages![0].content).toBe('Older');
      expect(messages![1].content).toBe('Existing');
      // No more pages
      expect(useMessageStore.getState().hasMoreMessages.get('ch-1')).toBe(false);
    });

    it('resets isLoadingMore on error', async () => {
      useMessageStore.getState().setMessages(
        'ch-1',
        [{ id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Hello', createdAt: '2024-01-01T00:00:00Z', status: 'sent' }],
        true,
        'some-cursor',
      );
      mockApiGet.mockRejectedValue(new Error('Network error'));

      await fetchOlderMessages('ch-1');

      expect(useMessageStore.getState().isLoadingMore).toBe(false);
    });
  });
});
