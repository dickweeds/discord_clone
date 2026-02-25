import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useMessageStore from '../../stores/useMessageStore';
import { usePresenceStore } from '../../stores/usePresenceStore';

const { mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn(),
}));

// Mock messageService
vi.mock('../../services/messageService', () => ({
  sendMessage: mockSendMessage,
  fetchMessages: vi.fn(),
}));

// Mock encryptionService
vi.mock('../../services/encryptionService', () => ({
  encryptMessage: vi.fn(() => ({ ciphertext: 'enc', nonce: 'n' })),
  decryptMessage: vi.fn((c: string) => c),
}));

// Mock wsClient
vi.mock('../../services/wsClient', () => ({
  wsClient: { send: vi.fn() },
}));

// Mock apiClient
vi.mock('../../services/apiClient', () => ({
  apiRequest: vi.fn(),
  configureApiClient: vi.fn(),
}));

// Mock useAuthStore
vi.mock('../../stores/useAuthStore', () => ({
  default: {
    getState: () => ({
      groupKey: new Uint8Array(32),
      user: { id: 'user-1', username: 'test', role: 'user' },
    }),
  },
}));

import MessageInput from './MessageInput';

beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
});

beforeEach(() => {
  useMessageStore.setState({
    messages: new Map(),
    currentChannelId: null,
    isLoading: false,
    error: null,
    sendError: null,
  });
  usePresenceStore.setState({
    onlineUsers: new Map(),
    connectionState: 'connected',
    hasConnectedOnce: true,
    isLoading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe('MessageInput', () => {
  it('renders textarea with channel name placeholder', () => {
    render(<MessageInput channelId="ch-1" channelName="general" />);
    expect(screen.getByPlaceholderText('Message #general')).toBeInTheDocument();
  });

  it('sends message on Enter and clears input', async () => {
    const user = userEvent.setup();
    render(<MessageInput channelId="ch-1" channelName="general" />);

    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, 'Hello world');
    await user.keyboard('{Enter}');

    // Input should be cleared
    expect(textarea).toHaveValue('');

    // sendMessage service should have been called
    expect(mockSendMessage).toHaveBeenCalledWith('ch-1', 'Hello world');
  });

  it('inserts newline on Shift+Enter instead of sending', async () => {
    const user = userEvent.setup();
    render(<MessageInput channelId="ch-1" channelName="general" />);

    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, 'line1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, 'line2');

    expect(textarea).toHaveValue('line1\nline2');
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    render(<MessageInput channelId="ch-1" channelName="general" />);

    screen.getByPlaceholderText('Message #general');
    await user.keyboard('{Enter}');

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('is disabled when WebSocket is disconnected', () => {
    usePresenceStore.setState({ connectionState: 'disconnected' });
    render(<MessageInput channelId="ch-1" channelName="general" />);

    expect(screen.getByPlaceholderText('Message #general')).toBeDisabled();
  });

  it('displays send error message', () => {
    useMessageStore.setState({ sendError: 'Message failed to send' });
    render(<MessageInput channelId="ch-1" channelName="general" />);

    expect(screen.getByText('Message failed to send')).toBeInTheDocument();
  });

  it('does not display error when sendError is null', () => {
    render(<MessageInput channelId="ch-1" channelName="general" />);
    expect(screen.queryByText('Message failed to send')).not.toBeInTheDocument();
  });
});
