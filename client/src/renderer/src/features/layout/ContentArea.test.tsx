import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useChannelStore } from '../../stores/useChannelStore';
import { useUIStore } from '../../stores/useUIStore';
import useMessageStore from '../../stores/useMessageStore';
import { usePresenceStore } from '../../stores/usePresenceStore';

const { mockFetchMessages } = vi.hoisted(() => ({
  mockFetchMessages: vi.fn(),
}));

// Mock messageService
vi.mock('../../services/messageService', () => ({
  sendMessage: vi.fn(),
  fetchMessages: mockFetchMessages,
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

// Mock apiClient — return empty array (no messages)
vi.mock('../../services/apiClient', () => ({
  apiRequest: vi.fn().mockResolvedValue([]),
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

import { ContentArea } from './ContentArea';

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
  useChannelStore.setState({
    channels: [
      { id: 'ch-1', name: 'general', type: 'text', createdAt: '2024-01-01' },
      { id: 'ch-2', name: 'help', type: 'text', createdAt: '2024-01-01' },
    ],
    activeChannelId: null,
    isLoading: false,
    error: null,
  });
  useUIStore.setState({ isMemberListVisible: true });
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

function renderContentArea(channelId?: string) {
  const initialEntry = channelId ? `/app/channels/${channelId}` : '/app/channels';
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/app/channels/:channelId" element={<ContentArea />} />
        <Route path="/app/channels" element={<ContentArea />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ContentArea', () => {
  it('shows "Select a channel" when no channel is selected', () => {
    renderContentArea();
    expect(screen.getByText('Select a channel')).toBeInTheDocument();
  });

  it('shows welcome message for selected channel with no messages', async () => {
    renderContentArea('ch-1');
    await waitFor(() => {
      expect(screen.getByText('Welcome to #general')).toBeInTheDocument();
    });
    expect(screen.getByText('This is the start of the #general channel.')).toBeInTheDocument();
  });

  it('shows channel name in header', async () => {
    renderContentArea('ch-1');
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
    });
  });

  it('syncs channelId param to store activeChannelId', async () => {
    renderContentArea('ch-1');
    await waitFor(() => {
      expect(useChannelStore.getState().activeChannelId).toBe('ch-1');
    });
  });

  it('calls fetchMessages service on channel change', async () => {
    renderContentArea('ch-1');
    await waitFor(() => {
      expect(mockFetchMessages).toHaveBeenCalledWith('ch-1');
    });
  });

  it('renders toggle member list button with aria-label', async () => {
    renderContentArea('ch-1');
    await waitFor(() => {
      expect(screen.getByLabelText('Toggle member list')).toBeInTheDocument();
    });
  });

  it('toggles member list visibility when button is clicked', async () => {
    renderContentArea('ch-1');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByLabelText('Toggle member list')).toBeInTheDocument();
    });
    expect(useUIStore.getState().isMemberListVisible).toBe(true);

    await user.click(screen.getByLabelText('Toggle member list'));
    expect(useUIStore.getState().isMemberListVisible).toBe(false);
  });

  it('shows "Select a channel" when channelId does not match any channel', () => {
    renderContentArea('nonexistent');
    expect(screen.getByText('Select a channel')).toBeInTheDocument();
  });

  it('renders MessageInput for selected channel', async () => {
    renderContentArea('ch-1');
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Message #general')).toBeInTheDocument();
    });
  });

  it('shows loading state while fetching messages', () => {
    useMessageStore.setState({ isLoading: true });
    renderContentArea('ch-1');
    expect(screen.getByText('Loading messages...')).toBeInTheDocument();
  });

  it('shows error state when message fetch fails', () => {
    useMessageStore.setState({ error: 'Network error' });
    renderContentArea('ch-1');
    expect(screen.getByText('Failed to load messages. Please try again.')).toBeInTheDocument();
  });

  it('displays messages when they exist', async () => {
    useMessageStore.setState({
      messages: new Map([
        ['ch-1', [
          {
            id: 'msg-1',
            channelId: 'ch-1',
            authorId: 'user-1',
            content: 'Hello world',
            createdAt: '2024-01-01T12:00:00.000Z',
            status: 'sent' as const,
          },
        ]],
      ]),
    });

    renderContentArea('ch-1');

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });
  });

  it('shows failed message indicator', async () => {
    useMessageStore.setState({
      messages: new Map([
        ['ch-1', [
          {
            id: 'msg-1',
            channelId: 'ch-1',
            authorId: 'user-1',
            content: 'Failed message',
            createdAt: '2024-01-01T12:00:00.000Z',
            status: 'failed' as const,
            tempId: 'temp-1',
          },
        ]],
      ]),
    });

    renderContentArea('ch-1');

    await waitFor(() => {
      expect(screen.getByText('Message not delivered')).toBeInTheDocument();
    });
  });
});
