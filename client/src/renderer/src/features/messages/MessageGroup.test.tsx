import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { useMemberStore } from '../../stores/useMemberStore';
import useMessageStore from '../../stores/useMessageStore';
import { MessageGroup } from './MessageGroup';
import type { MessageGroupData } from '../../utils/groupMessages';

vi.mock('../../services/reactionService', () => ({
  toggleReaction: vi.fn(),
}));

vi.mock('@emoji-mart/react', () => ({
  default: () => null,
}));
vi.mock('@emoji-mart/data', () => ({ default: {} }));

beforeEach(() => {
  useMemberStore.setState({
    members: [
      { id: 'user-1', username: 'alice', role: 'owner', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'user-2', username: 'bob', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
    ],
    isLoading: false,
    error: null,
  });
  useMessageStore.setState({
    messages: new Map(),
    reactions: new Map(),
    hasMoreMessages: new Map(),
    cursors: new Map(),
    isLoadingMore: false,
    currentChannelId: null,
    isLoading: false,
    error: null,
    sendError: null,
  });
});

function renderGroup(group: MessageGroupData, isFirst = true) {
  return render(
    <Tooltip.Provider>
      <MessageGroup group={group} isFirst={isFirst} />
    </Tooltip.Provider>,
  );
}

function makeGroup(overrides?: Partial<MessageGroupData>): MessageGroupData {
  return {
    authorId: 'user-1',
    firstTimestamp: '2024-01-01T12:00:00Z',
    messages: [
      {
        id: 'msg-1',
        channelId: 'ch-1',
        authorId: 'user-1',
        content: 'Hello world',
        createdAt: '2024-01-01T12:00:00Z',
        status: 'sent',
      },
    ],
    ...overrides,
  };
}

describe('MessageGroup', () => {
  it('renders avatar with correct initial and color', () => {
    renderGroup(makeGroup());
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders username from member store', () => {
    renderGroup(makeGroup());
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('renders timestamp in readable format', () => {
    renderGroup(makeGroup());
    // Timestamp should contain some time representation
    const timestampEl = screen.getByText(/\d{1,2}:\d{2}/);
    expect(timestampEl).toBeInTheDocument();
  });

  it('renders all messages in the group', () => {
    const group = makeGroup({
      messages: [
        { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'First message', createdAt: '2024-01-01T12:00:00Z', status: 'sent' },
        { id: 'msg-2', channelId: 'ch-1', authorId: 'user-1', content: 'Second message', createdAt: '2024-01-01T12:01:00Z', status: 'sent' },
        { id: 'msg-3', channelId: 'ch-1', authorId: 'user-1', content: 'Third message', createdAt: '2024-01-01T12:02:00Z', status: 'sent' },
      ],
    });
    renderGroup(group);
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
    expect(screen.getByText('Third message')).toBeInTheDocument();
  });

  it('shows red "Message not delivered" indicator for failed message', () => {
    const group = makeGroup({
      messages: [
        { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Failed msg', createdAt: '2024-01-01T12:00:00Z', status: 'failed', tempId: 'temp-1' },
      ],
    });
    renderGroup(group);
    expect(screen.getByText('Message not delivered')).toBeInTheDocument();
  });

  it('shows "Sending..." indicator for sending message', () => {
    const group = makeGroup({
      messages: [
        { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Pending msg', createdAt: '2024-01-01T12:00:00Z', status: 'sending', tempId: 'temp-1' },
      ],
    });
    renderGroup(group);
    expect(screen.getByText('Sending...')).toBeInTheDocument();
  });

  it('falls back to truncated authorId when member not found', () => {
    const group = makeGroup({
      authorId: 'unknown-user-long-id',
      messages: [
        { id: 'msg-1', channelId: 'ch-1', authorId: 'unknown-user-long-id', content: 'Hello', createdAt: '2024-01-01T12:00:00Z', status: 'sent' },
      ],
    });
    renderGroup(group);
    expect(screen.getByText('unknown-')).toBeInTheDocument();
  });

  it('applies mt-4 class on non-first groups', () => {
    const { container } = renderGroup(makeGroup(), false);
    expect(container.firstChild).toHaveClass('mt-4');
  });

  it('does not apply mt-4 class on first group', () => {
    const { container } = renderGroup(makeGroup());
    expect(container.firstChild).not.toHaveClass('mt-4');
  });

  it('has role="group" with accessible label', () => {
    const { container } = renderGroup(makeGroup());
    expect(container.firstChild).toHaveAttribute('role', 'group');
    expect(container.firstChild).toHaveAttribute('aria-label', 'Messages from alice');
  });

  it('marks avatar as aria-hidden', () => {
    const { container } = renderGroup(makeGroup());
    const avatar = container.querySelector('[aria-hidden="true"]');
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveTextContent('A');
  });

  it('each message div has group/msg class for hover scoping', () => {
    const { container } = renderGroup(makeGroup());
    const messageDiv = container.querySelector('.group\\/msg');
    expect(messageDiv).toBeInTheDocument();
  });

  it('renders hover toolbar with hidden class by default', () => {
    const { container } = renderGroup(makeGroup());
    const toolbar = container.querySelector('.hidden.group-hover\\/msg\\:flex');
    expect(toolbar).toBeInTheDocument();
  });
});
