import { describe, it, expect, beforeEach } from 'vitest';
import type { TextReceivePayload } from 'discord-clone-shared';
import useMessageStore from './useMessageStore';
import type { DecryptedMessage } from './useMessageStore';

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
});

describe('useMessageStore', () => {
  describe('addOptimisticMessage', () => {
    it('adds message to the specified channel', () => {
      const msg: DecryptedMessage = {
        id: 'temp-1',
        channelId: 'ch-1',
        authorId: 'user-1',
        content: 'Hello',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'sending',
        tempId: 'temp-1',
      };

      useMessageStore.getState().addOptimisticMessage('ch-1', msg);

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(1);
      expect(messages![0].content).toBe('Hello');
      expect(messages![0].status).toBe('sending');
    });

    it('appends to existing messages', () => {
      const msg1: DecryptedMessage = {
        id: 'msg-1',
        channelId: 'ch-1',
        authorId: 'user-1',
        content: 'First',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'sent',
      };
      useMessageStore.getState().setMessages('ch-1', [msg1]);

      const msg2: DecryptedMessage = {
        id: 'temp-2',
        channelId: 'ch-1',
        authorId: 'user-1',
        content: 'Second',
        createdAt: '2024-01-01T00:01:00.000Z',
        status: 'sending',
        tempId: 'temp-2',
      };
      useMessageStore.getState().addOptimisticMessage('ch-1', msg2);

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(2);
    });

    it('clears sendError when adding optimistic message', () => {
      useMessageStore.setState({ sendError: 'previous error' });
      const msg: DecryptedMessage = {
        id: 'temp-1',
        channelId: 'ch-1',
        authorId: 'user-1',
        content: 'Test',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'sending',
        tempId: 'temp-1',
      };
      useMessageStore.getState().addOptimisticMessage('ch-1', msg);
      expect(useMessageStore.getState().sendError).toBeNull();
    });
  });

  describe('setMessages', () => {
    it('replaces messages for a channel', () => {
      const msgs: DecryptedMessage[] = [
        {
          id: 'msg-1',
          channelId: 'ch-1',
          authorId: 'user-1',
          content: 'Hello',
          createdAt: '2024-01-01T00:00:00.000Z',
          status: 'sent',
        },
        {
          id: 'msg-2',
          channelId: 'ch-1',
          authorId: 'user-2',
          content: 'World',
          createdAt: '2024-01-01T00:01:00.000Z',
          status: 'sent',
        },
      ];

      useMessageStore.getState().setMessages('ch-1', msgs);

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(2);
      expect(messages![0].content).toBe('Hello');
      expect(messages![1].content).toBe('World');
    });
  });

  describe('addReceivedMessage', () => {
    it('adds a pre-decrypted message to the channel', () => {
      const msg: DecryptedMessage = {
        id: 'msg-1',
        channelId: 'ch-1',
        authorId: 'other-user',
        content: 'Hello from another user',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'sent',
      };

      useMessageStore.getState().addReceivedMessage(msg);

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(1);
      expect(messages![0].content).toBe('Hello from another user');
      expect(messages![0].status).toBe('sent');
      expect(messages![0].id).toBe('msg-1');
    });
  });

  describe('confirmMessage', () => {
    it('updates optimistic message with server data', () => {
      const optimistic: DecryptedMessage = {
        id: 'temp-1',
        channelId: 'ch-1',
        authorId: 'user-1',
        content: 'Test',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'sending',
        tempId: 'temp-1',
      };
      useMessageStore.getState().addOptimisticMessage('ch-1', optimistic);

      const serverPayload: TextReceivePayload = {
        messageId: 'server-id-1',
        channelId: 'ch-1',
        authorId: 'user-1',
        content: 'encrypted:Test',
        nonce: 'mock-nonce',
        createdAt: '2024-01-01T12:00:00.000Z',
      };

      useMessageStore.getState().confirmMessage('temp-1', serverPayload);

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages![0].id).toBe('server-id-1');
      expect(messages![0].status).toBe('sent');
      expect(messages![0].createdAt).toBe('2024-01-01T12:00:00.000Z');
      expect(messages![0].tempId).toBeUndefined();
    });

    it('does nothing if channel has no messages', () => {
      const serverPayload: TextReceivePayload = {
        messageId: 'server-id-1',
        channelId: 'ch-1',
        authorId: 'user-1',
        content: 'encrypted:Test',
        nonce: 'nonce',
        createdAt: '2024-01-01T12:00:00.000Z',
      };

      useMessageStore.getState().confirmMessage('temp-1', serverPayload);

      expect(useMessageStore.getState().messages.get('ch-1')).toBeUndefined();
    });
  });

  describe('markMessageFailed', () => {
    it('sets message status to failed and sets sendError', () => {
      const msg: DecryptedMessage = {
        id: 'temp-1',
        channelId: 'ch-1',
        authorId: 'user-1',
        content: 'Test',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'sending',
        tempId: 'temp-1',
      };
      useMessageStore.getState().addOptimisticMessage('ch-1', msg);
      useMessageStore.getState().markMessageFailed('temp-1');

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages![0].status).toBe('failed');
      expect(useMessageStore.getState().sendError).toBe('Message failed to send');
    });
  });

  describe('setCurrentChannel', () => {
    it('updates currentChannelId', () => {
      useMessageStore.getState().setCurrentChannel('ch-2');
      expect(useMessageStore.getState().currentChannelId).toBe('ch-2');
    });
  });

  describe('setLoading / setError / setSendError', () => {
    it('sets loading state', () => {
      useMessageStore.getState().setLoading(true);
      expect(useMessageStore.getState().isLoading).toBe(true);
    });

    it('sets error state', () => {
      useMessageStore.getState().setError('something went wrong');
      expect(useMessageStore.getState().error).toBe('something went wrong');
    });

    it('sets sendError state', () => {
      useMessageStore.getState().setSendError('send failed');
      expect(useMessageStore.getState().sendError).toBe('send failed');
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

  describe('prependMessages', () => {
    it('adds messages to beginning of channel array', () => {
      const existing: DecryptedMessage = {
        id: 'msg-2', channelId: 'ch-1', authorId: 'user-1',
        content: 'Existing', createdAt: '2024-01-01T01:00:00Z', status: 'sent',
      };
      useMessageStore.getState().setMessages('ch-1', [existing]);

      const older: DecryptedMessage = {
        id: 'msg-1', channelId: 'ch-1', authorId: 'user-1',
        content: 'Older', createdAt: '2024-01-01T00:00:00Z', status: 'sent',
      };
      useMessageStore.getState().prependMessages('ch-1', [older], false);

      const messages = useMessageStore.getState().messages.get('ch-1');
      expect(messages).toHaveLength(2);
      expect(messages![0].content).toBe('Older');
      expect(messages![1].content).toBe('Existing');
    });

    it('updates hasMoreMessages for channel', () => {
      useMessageStore.getState().prependMessages('ch-1', [], true);
      expect(useMessageStore.getState().hasMoreMessages.get('ch-1')).toBe(true);

      useMessageStore.getState().prependMessages('ch-1', [], false);
      expect(useMessageStore.getState().hasMoreMessages.get('ch-1')).toBe(false);
    });
  });

  describe('setMessages with hasMore', () => {
    it('sets hasMoreMessages to true when hasMore is true', () => {
      useMessageStore.getState().setMessages('ch-1', [], true);
      expect(useMessageStore.getState().hasMoreMessages.get('ch-1')).toBe(true);
    });

    it('sets hasMoreMessages to false when hasMore is false', () => {
      useMessageStore.getState().setMessages('ch-1', [], false);
      expect(useMessageStore.getState().hasMoreMessages.get('ch-1')).toBe(false);
    });

    it('defaults hasMoreMessages to true when hasMore not provided', () => {
      useMessageStore.getState().setMessages('ch-1', []);
      expect(useMessageStore.getState().hasMoreMessages.get('ch-1')).toBe(true);
    });
  });

  describe('getOldestMessageId', () => {
    it('returns first message ID', () => {
      useMessageStore.getState().setMessages('ch-1', [
        { id: 'oldest', channelId: 'ch-1', authorId: 'user-1', content: 'First', createdAt: '2024-01-01T00:00:00Z', status: 'sent' },
        { id: 'newest', channelId: 'ch-1', authorId: 'user-1', content: 'Last', createdAt: '2024-01-01T01:00:00Z', status: 'sent' },
      ]);

      expect(useMessageStore.getState().getOldestMessageId('ch-1')).toBe('oldest');
    });

    it('returns undefined for empty channel', () => {
      expect(useMessageStore.getState().getOldestMessageId('ch-1')).toBeUndefined();
    });

    it('returns undefined for channel with no messages', () => {
      useMessageStore.getState().setMessages('ch-1', []);
      expect(useMessageStore.getState().getOldestMessageId('ch-1')).toBeUndefined();
    });
  });

  describe('isLoadingMore', () => {
    it('toggles correctly', () => {
      expect(useMessageStore.getState().isLoadingMore).toBe(false);

      useMessageStore.getState().setLoadingMore(true);
      expect(useMessageStore.getState().isLoadingMore).toBe(true);

      useMessageStore.getState().setLoadingMore(false);
      expect(useMessageStore.getState().isLoadingMore).toBe(false);
    });
  });
});
