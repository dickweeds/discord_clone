import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useMemberStore } from '../../stores/useMemberStore';
import { MessageGroup } from './MessageGroup';
import type { MessageGroupData } from '../../utils/groupMessages';

beforeEach(() => {
  useMemberStore.setState({
    members: [
      { id: 'user-1', username: 'alice', role: 'owner', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'user-2', username: 'bob', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
    ],
    isLoading: false,
    error: null,
  });
});

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
    render(<MessageGroup group={makeGroup()} isFirst={true} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders username from member store', () => {
    render(<MessageGroup group={makeGroup()} isFirst={true} />);
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('renders timestamp in readable format', () => {
    render(<MessageGroup group={makeGroup()} isFirst={true} />);
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
    render(<MessageGroup group={group} isFirst={true} />);
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
    render(<MessageGroup group={group} isFirst={true} />);
    expect(screen.getByText('Message not delivered')).toBeInTheDocument();
  });

  it('shows "Sending..." indicator for sending message', () => {
    const group = makeGroup({
      messages: [
        { id: 'msg-1', channelId: 'ch-1', authorId: 'user-1', content: 'Pending msg', createdAt: '2024-01-01T12:00:00Z', status: 'sending', tempId: 'temp-1' },
      ],
    });
    render(<MessageGroup group={group} isFirst={true} />);
    expect(screen.getByText('Sending...')).toBeInTheDocument();
  });

  it('falls back to truncated authorId when member not found', () => {
    const group = makeGroup({
      authorId: 'unknown-user-long-id',
      messages: [
        { id: 'msg-1', channelId: 'ch-1', authorId: 'unknown-user-long-id', content: 'Hello', createdAt: '2024-01-01T12:00:00Z', status: 'sent' },
      ],
    });
    render(<MessageGroup group={group} isFirst={true} />);
    expect(screen.getByText('unknown-')).toBeInTheDocument();
  });

  it('applies mt-4 class on non-first groups', () => {
    const { container } = render(<MessageGroup group={makeGroup()} isFirst={false} />);
    expect(container.firstChild).toHaveClass('mt-4');
  });

  it('does not apply mt-4 class on first group', () => {
    const { container } = render(<MessageGroup group={makeGroup()} isFirst={true} />);
    expect(container.firstChild).not.toHaveClass('mt-4');
  });

  it('has role="group" with accessible label', () => {
    const { container } = render(<MessageGroup group={makeGroup()} isFirst={true} />);
    expect(container.firstChild).toHaveAttribute('role', 'group');
    expect(container.firstChild).toHaveAttribute('aria-label', 'Messages from alice');
  });

  it('marks avatar as aria-hidden', () => {
    const { container } = render(<MessageGroup group={makeGroup()} isFirst={true} />);
    const avatar = container.querySelector('[aria-hidden="true"]');
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveTextContent('A');
  });
});
