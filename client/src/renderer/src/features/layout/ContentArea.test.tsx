import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useChannelStore } from '../../stores/useChannelStore';
import { useUIStore } from '../../stores/useUIStore';
import useMessageStore from '../../stores/useMessageStore';
import { usePresenceStore } from '../../stores/usePresenceStore';
import { useMemberStore } from '../../stores/useMemberStore';

const { mockFetchMessages, mockFetchOlderMessages } = vi.hoisted(() => ({
  mockFetchMessages: vi.fn(),
  mockFetchOlderMessages: vi.fn().mockResolvedValue(undefined),
}));

// Mock messageService
vi.mock('../../services/messageService', () => ({
  sendMessage: vi.fn(),
  fetchMessages: mockFetchMessages,
  fetchOlderMessages: mockFetchOlderMessages,
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
    hasMoreMessages: new Map(),
    isLoadingMore: false,
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
  useMemberStore.setState({
    members: [
      { id: 'user-1', username: 'alice', role: 'owner', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'user-2', username: 'bob', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
    ],
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
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('general');
      expect(screen.getByText('This is the beginning of #general. Send the first message!')).toBeInTheDocument();
    });
  });

  it('shows channel name in header', async () => {
    renderContentArea('ch-1');
    await waitFor(() => {
      // Channel name appears in header (and possibly empty state)
      expect(screen.getAllByText('general').length).toBeGreaterThanOrEqual(1);
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

  it('redirects to next text channel when active channel is removed', async () => {
    renderContentArea('ch-1');
    expect(screen.getByText('This is the beginning of #general. Send the first message!')).toBeInTheDocument();

    // Simulate channel deletion via WS — remove ch-1, activeChannelId updates to ch-2
    useChannelStore.setState({
      channels: [
        { id: 'ch-2', name: 'help', type: 'text', createdAt: '2024-01-01' },
      ],
      activeChannelId: 'ch-2',
    });

    // Should redirect to the remaining channel
    expect(await screen.findByText('This is the beginning of #help. Send the first message!')).toBeInTheDocument();
  });

  it('redirects to /app/channels when all channels are removed', async () => {
    renderContentArea('ch-1');
    expect(screen.getByText('This is the beginning of #general. Send the first message!')).toBeInTheDocument();

    // Simulate all channels deleted
    useChannelStore.setState({
      channels: [],
      activeChannelId: null,
    });

    // Should show "Select a channel" (redirected to /app/channels)
    expect(await screen.findByText('Select a channel')).toBeInTheDocument();
  });

  it('renders messages as grouped MessageGroup components', async () => {
    useMemberStore.setState({
      members: [
        { id: 'user-1', username: 'alice', role: 'owner', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'user-2', username: 'bob', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
      ],
      isLoading: false,
      error: null,
    });
    useMessageStore.setState({
      messages: new Map([
        ['ch-1', [
          { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Hello from alice', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
          { id: 'msg-2', channelId: 'ch-1', authorId: 'user-1', content: 'Second msg', createdAt: '2024-01-01T12:01:00Z', status: 'sent' as const },
          { id: 'msg-3', channelId: 'ch-1', authorId: 'user-2', content: 'Hello from bob', createdAt: '2024-01-01T12:02:00Z', status: 'sent' as const },
        ]],
      ]),
    });

    renderContentArea('ch-1');

    await waitFor(() => {
      const groups = screen.getAllByRole('group');
      expect(groups).toHaveLength(2);

      // First group: alice's 2 messages
      expect(within(groups[0]).getByText('alice')).toBeInTheDocument();
      expect(within(groups[0]).getByText('Hello from alice')).toBeInTheDocument();
      expect(within(groups[0]).getByText('Second msg')).toBeInTheDocument();

      // Second group: bob's 1 message
      expect(within(groups[1]).getByText('bob')).toBeInTheDocument();
      expect(within(groups[1]).getByText('Hello from bob')).toBeInTheDocument();
    });
  });

  it('message container has max-width constraint', async () => {
    useMessageStore.setState({
      messages: new Map([
        ['ch-1', [
          { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Test', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
        ]],
      ]),
    });

    const { container } = renderContentArea('ch-1');

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    const maxWidthContainer = container.querySelector('.max-w-\\[720px\\]');
    expect(maxWidthContainer).toBeInTheDocument();
  });

  it('applies themed chat scrollbar class to the message log container', async () => {
    useMessageStore.setState({
      messages: new Map([
        ['ch-1', [
          { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Scrollbar check', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
        ]],
      ]),
    });

    renderContentArea('ch-1');

    await waitFor(() => {
      expect(screen.getByText('Scrollbar check')).toBeInTheDocument();
    });

    expect(screen.getByRole('log')).toHaveClass('chat-scrollbar');
  });

  it('does not redirect when a non-active channel is removed', () => {
    renderContentArea('ch-1');
    expect(screen.getByText('This is the beginning of #general. Send the first message!')).toBeInTheDocument();

    // Remove ch-2 (not the active channel)
    useChannelStore.setState({
      channels: [
        { id: 'ch-1', name: 'general', type: 'text', createdAt: '2024-01-01' },
      ],
      activeChannelId: 'ch-1',
    });

    // Should still show the active channel
    expect(screen.getByText('This is the beginning of #general. Send the first message!')).toBeInTheDocument();
  });

  describe('new messages indicator', () => {
    it('does NOT show indicator when no new messages arrive', async () => {
      useMessageStore.setState({
        messages: new Map([
          ['ch-1', [
            { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Hello', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
          ]],
        ]),
      });

      renderContentArea('ch-1');

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
      });

      expect(screen.queryByText('New messages')).not.toBeInTheDocument();
    });

    it('scrolls to bottom and hides indicator when "New messages" is clicked', async () => {
      useMessageStore.setState({
        messages: new Map([
          ['ch-1', [
            { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Existing', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
          ]],
        ]),
        isLoading: false,
      });

      renderContentArea('ch-1');

      await waitFor(() => {
        expect(screen.getByText('Existing')).toBeInTheDocument();
      });

      // Simulate user scrolled up
      const scrollEl = screen.getByRole('log');
      Object.defineProperty(scrollEl, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(scrollEl, 'scrollTop', { value: 0, configurable: true, writable: true });
      Object.defineProperty(scrollEl, 'clientHeight', { value: 500, configurable: true });
      scrollEl.scrollTo = vi.fn();

      // Fire scroll event to set isAtBottom = false
      scrollEl.dispatchEvent(new Event('scroll'));

      // New message arrives while scrolled up
      useMessageStore.setState({
        messages: new Map([
          ['ch-1', [
            { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Existing', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
            { id: 'msg-2', channelId: 'ch-1', authorId: 'user-2', content: 'New msg', createdAt: '2024-01-01T12:05:00Z', status: 'sent' as const },
          ]],
        ]),
      });

      const indicator = await screen.findByLabelText('Jump to new messages');
      const user = userEvent.setup();
      await user.click(indicator);

      expect(scrollEl.scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth' }),
      );
      expect(screen.queryByLabelText('Jump to new messages')).not.toBeInTheDocument();
    });

    it('shows "New messages" button with aria-label', async () => {
      useMessageStore.setState({
        messages: new Map([
          ['ch-1', [
            { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Existing', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
          ]],
        ]),
        isLoading: false,
      });

      renderContentArea('ch-1');

      await waitFor(() => {
        expect(screen.getByText('Existing')).toBeInTheDocument();
      });

      // Simulate user scrolled up by adding a message while not at bottom
      // We need to first wait for initial render, then manipulate scroll state
      const scrollEl = screen.getByRole('log');
      // Set scrollHeight > scrollTop + clientHeight to simulate scrolled up
      Object.defineProperty(scrollEl, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(scrollEl, 'scrollTop', { value: 0, configurable: true, writable: true });
      Object.defineProperty(scrollEl, 'clientHeight', { value: 500, configurable: true });

      // Fire scroll event to update isAtBottom ref
      scrollEl.dispatchEvent(new Event('scroll'));

      // Add a new message (simulating real-time arrival)
      useMessageStore.setState({
        messages: new Map([
          ['ch-1', [
            { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Existing', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
            { id: 'msg-2', channelId: 'ch-1', authorId: 'user-2', content: 'New msg', createdAt: '2024-01-01T12:05:00Z', status: 'sent' as const },
          ]],
        ]),
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Jump to new messages')).toBeInTheDocument();
      });
    });
  });

  it('transitions from loading state to displaying messages with scroll container', async () => {
    useMessageStore.setState({ isLoading: true });
    renderContentArea('ch-1');
    expect(screen.getByText('Loading messages...')).toBeInTheDocument();

    // Simulate load complete with messages
    useMessageStore.setState({
      messages: new Map([
        ['ch-1', [
          { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'First message', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
        ]],
      ]),
      isLoading: false,
    });

    await waitFor(() => {
      const scrollEl = screen.getByRole('log');
      expect(scrollEl).toBeInTheDocument();
      expect(screen.getByText('First message')).toBeInTheDocument();
    });

    // Verify loading state is cleared
    expect(screen.queryByText('Loading messages...')).not.toBeInTheDocument();
  });

  describe('loading older messages', () => {
    it('shows loading spinner when isLoadingMore is true', async () => {
      useMessageStore.setState({
        messages: new Map([
          ['ch-1', [
            { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Hello', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
          ]],
        ]),
        isLoadingMore: true,
      });

      renderContentArea('ch-1');

      await waitFor(() => {
        expect(screen.getByLabelText('Loading older messages')).toBeInTheDocument();
      });
    });

    it('does NOT show loading spinner when isLoadingMore is false', async () => {
      useMessageStore.setState({
        messages: new Map([
          ['ch-1', [
            { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Hello', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
          ]],
        ]),
        isLoadingMore: false,
      });

      renderContentArea('ch-1');

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText('Loading older messages')).not.toBeInTheDocument();
    });

    it('shows beginning-of-channel message when hasMoreMessages is false', async () => {
      useMessageStore.setState({
        messages: new Map([
          ['ch-1', [
            { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'First ever', createdAt: '2024-01-01T12:00:00Z', status: 'sent' as const },
          ]],
        ]),
        hasMoreMessages: new Map([['ch-1', false]]),
      });

      renderContentArea('ch-1');

      await waitFor(() => {
        expect(screen.getByText('This is the beginning of #general')).toBeInTheDocument();
      });
    });
  });
});
