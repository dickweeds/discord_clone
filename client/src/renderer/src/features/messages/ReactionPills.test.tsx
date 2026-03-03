import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import useMessageStore from '../../stores/useMessageStore';
import useAuthStore from '../../stores/useAuthStore';
import { useMemberStore } from '../../stores/useMemberStore';
import { ReactionPills } from './ReactionPills';

vi.mock('../../services/reactionService', () => ({
  toggleReaction: vi.fn(),
}));

vi.mock('@emoji-mart/react', () => ({
  default: () => null,
}));
vi.mock('@emoji-mart/data', () => ({ default: {} }));

import { toggleReaction } from '../../services/reactionService';

function renderPills(messageId = 'msg-1', channelId = 'ch-1') {
  return render(
    <Tooltip.Provider delayDuration={0}>
      <ReactionPills messageId={messageId} channelId={channelId} />
    </Tooltip.Provider>,
  );
}

beforeEach(() => {
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
  useAuthStore.setState({
    user: { id: 'current-user', username: 'testuser' },
  } as Parameters<typeof useAuthStore.setState>[0]);
  useMemberStore.setState({
    members: [
      { id: 'current-user', username: 'testuser', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'u1', username: 'alice', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'u2', username: 'bob', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'u3', username: 'charlie', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
    ],
    isLoading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe('ReactionPills', () => {
  it('renders nothing when no reactions exist', () => {
    const { container } = renderPills();
    expect(container.innerHTML).toBe('');
  });

  it('renders emoji and count for each reaction', () => {
    useMessageStore.getState().setReactionsForMessages(
      new Map([['msg-1', [
        { emoji: '\u{1F44D}', count: 3, userIds: ['u1', 'u2', 'u3'] },
        { emoji: '\u2764\uFE0F', count: 1, userIds: ['u1'] },
      ]]]),
    );

    renderPills();

    expect(screen.getByText('\u{1F44D}')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('\u2764\uFE0F')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('highlights pill when current user has reacted', () => {
    useMessageStore.getState().setReactionsForMessages(
      new Map([['msg-1', [
        { emoji: '\u{1F44D}', count: 1, userIds: ['current-user'] },
      ]]]),
    );

    renderPills();

    const pill = screen.getByText('\u{1F44D}').closest('button');
    expect(pill).toHaveClass('border-accent-primary');
  });

  it('calls toggleReaction on pill click', () => {
    useMessageStore.getState().setReactionsForMessages(
      new Map([['msg-1', [
        { emoji: '\u{1F44D}', count: 1, userIds: ['u1'] },
      ]]]),
    );

    renderPills();

    fireEvent.click(screen.getByText('\u{1F44D}').closest('button')!);
    expect(toggleReaction).toHaveBeenCalledWith('msg-1', 'ch-1', '\u{1F44D}');
  });

  it('shows "+" button to add reaction', () => {
    useMessageStore.getState().setReactionsForMessages(
      new Map([['msg-1', [
        { emoji: '\u{1F44D}', count: 1, userIds: ['u1'] },
      ]]]),
    );

    renderPills();

    expect(screen.getByLabelText('Add reaction')).toBeInTheDocument();
  });

  it('shows reactor usernames in tooltip on hover', async () => {
    useMessageStore.getState().setReactionsForMessages(
      new Map([['msg-1', [
        { emoji: '\u{1F44D}', count: 2, userIds: ['u1', 'u2'] },
      ]]]),
    );

    renderPills();

    const user = userEvent.setup();
    await user.hover(screen.getByText('\u{1F44D}').closest('button')!);

    await waitFor(() => {
      // Radix renders tooltip text in both a visible element and a sr-only description
      expect(screen.getAllByText('alice, bob').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows truncated tooltip with "and N more" for 4+ reactors', async () => {
    useMemberStore.setState({
      members: [
        { id: 'u1', username: 'alice', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'u2', username: 'bob', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'u3', username: 'charlie', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'u4', username: 'diana', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
      ],
      isLoading: false,
      error: null,
    });
    useMessageStore.getState().setReactionsForMessages(
      new Map([['msg-1', [
        { emoji: '\u{1F44D}', count: 4, userIds: ['u1', 'u2', 'u3', 'u4'] },
      ]]]),
    );

    renderPills();

    const user = userEvent.setup();
    await user.hover(screen.getByText('\u{1F44D}').closest('button')!);

    await waitFor(() => {
      expect(screen.getAllByText('alice, bob, charlie and 1 more').length).toBeGreaterThanOrEqual(1);
    });
  });
});
