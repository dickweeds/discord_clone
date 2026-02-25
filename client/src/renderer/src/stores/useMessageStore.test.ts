import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TextReceivePayload } from 'discord-clone-shared';

const { mockSend, mockApiRequest } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockApiRequest: vi.fn(),
}));

// Mock encryptionService
vi.mock('../services/encryptionService', () => ({
  encryptMessage: vi.fn((plaintext: string) => ({
    ciphertext: `encrypted:${plaintext}`,
    nonce: 'mock-nonce',
  })),
  decryptMessage: vi.fn((ciphertext: string) =>
    ciphertext.startsWith('encrypted:') ? ciphertext.slice(10) : `decrypted:${ciphertext}`,
  ),
}));

// Mock wsClient
vi.mock('../services/wsClient', () => ({
  wsClient: { send: mockSend },
}));

// Mock apiClient
vi.mock('../services/apiClient', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

// Mock useAuthStore
vi.mock('./useAuthStore', () => ({
  default: {
    getState: () => ({
      groupKey: new Uint8Array(32),
      user: { id: 'current-user', username: 'me', role: 'user' },
    }),
  },
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'mock-uuid-1234' });

import useMessageStore from './useMessageStore';

beforeEach(() => {
  useMessageStore.setState({
    messages: new Map(),
    currentChannelId: null,
    isLoading: false,
    error: null,
    sendError: null,
  });
  vi.clearAllMocks();
});

describe('useMessageStore', () => {
  describe('sendMessage', () => {
    it('encrypts message before sending via WebSocket', () => {
      useMessageStore.getState().sendMessage('ch-1', 'Hello world');

      expect(mockSend).toHaveBeenCalledOnce();
      const sent = mockSend.mock.calls[0][0];
      expect(sent.type).toBe('text:send');
      expect(sent.payload.content).toBe('encrypted:Hello world');
      expect(sent.payload.nonce).toBe('mock-nonce');
      expect(sent.payload.channelId).toBe('ch-1');
      expect(sent.id).toBe('mock-uuid-1234');
    });

    it('adds optimistic message with sending status', () => {
      useMessageStore.getState().sendMessage('ch-1', 'Test');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(1);
      expect(messages![0].content).toBe('Test');
      expect(messages![0].status).toBe('sending');
      expect(messages![0].tempId).toBe('mock-uuid-1234');
    });

    it('clears sendError on successful send', () => {
      useMessageStore.setState({ sendError: 'previous error' });
      useMessageStore.getState().sendMessage('ch-1', 'Test');
      expect(useMessageStore.getState().sendError).toBeNull();
    });

    it('marks message failed if wsClient.send throws', () => {
      mockSend.mockImplementation(() => { throw new Error('Not connected'); });

      useMessageStore.getState().sendMessage('ch-1', 'Fail');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages![0].status).toBe('failed');
    });
  });

  describe('addReceivedMessage', () => {
    it('decrypts and adds message from another user', () => {
      const payload: TextReceivePayload = {
        messageId: 'msg-1',
        channelId: 'ch-1',
        authorId: 'other-user',
        content: 'encrypted:Hello',
        nonce: 'nonce-1',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      useMessageStore.getState().addReceivedMessage(payload);

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(1);
      expect(messages![0].content).toBe('Hello');
      expect(messages![0].status).toBe('sent');
      expect(messages![0].id).toBe('msg-1');
    });

    it('handles decryption failure gracefully', async () => {
      const { decryptMessage } = await import('../services/encryptionService');
      (decryptMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('Decrypt failed'); });

      const payload: TextReceivePayload = {
        messageId: 'msg-2',
        channelId: 'ch-1',
        authorId: 'other-user',
        content: 'bad-data',
        nonce: 'bad-nonce',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      useMessageStore.getState().addReceivedMessage(payload);

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages![0].content).toBe('[Decryption failed]');
    });
  });

  describe('confirmMessage', () => {
    it('updates optimistic message with server data', () => {
      // Add optimistic message
      useMessageStore.getState().sendMessage('ch-1', 'Test');

      const serverPayload: TextReceivePayload = {
        messageId: 'server-id-1',
        channelId: 'ch-1',
        authorId: 'current-user',
        content: 'encrypted:Test',
        nonce: 'mock-nonce',
        createdAt: '2024-01-01T12:00:00.000Z',
      };

      useMessageStore.getState().confirmMessage('mock-uuid-1234', serverPayload);

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages![0].id).toBe('server-id-1');
      expect(messages![0].status).toBe('sent');
      expect(messages![0].createdAt).toBe('2024-01-01T12:00:00.000Z');
      expect(messages![0].tempId).toBeUndefined();
    });
  });

  describe('markMessageFailed', () => {
    it('sets message status to failed and sets sendError', () => {
      useMessageStore.getState().sendMessage('ch-1', 'Test');
      useMessageStore.getState().markMessageFailed('mock-uuid-1234');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages![0].status).toBe('failed');
      expect(useMessageStore.getState().sendError).toBe('Message failed to send');
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

      await useMessageStore.getState().fetchMessages('ch-1');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(2);
      // Reversed from DESC order to chronological
      expect(messages![0].content).toBe('World');
      expect(messages![1].content).toBe('Hello');
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('sets error on fetch failure', async () => {
      mockApiRequest.mockRejectedValue(new Error('Network error'));

      await useMessageStore.getState().fetchMessages('ch-1');

      expect(useMessageStore.getState().error).toBe('Network error');
      expect(useMessageStore.getState().isLoading).toBe(false);
    });
  });

  describe('setCurrentChannel', () => {
    it('updates currentChannelId', () => {
      useMessageStore.getState().setCurrentChannel('ch-2');
      expect(useMessageStore.getState().currentChannelId).toBe('ch-2');
    });
  });

  describe('clearError / clearSendError', () => {
    it('clears error', () => {
      useMessageStore.setState({ error: 'some error' });
      useMessageStore.getState().clearError();
      expect(useMessageStore.getState().error).toBeNull();
    });

    it('clears sendError', () => {
      useMessageStore.setState({ sendError: 'send error' });
      useMessageStore.getState().clearSendError();
      expect(useMessageStore.getState().sendError).toBeNull();
    });
  });
});
