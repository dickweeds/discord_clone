import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { MessageHoverToolbar } from './MessageHoverToolbar';

vi.mock('../../services/reactionService', () => ({
  toggleReaction: vi.fn(),
}));

vi.mock('@emoji-mart/react', () => ({
  default: ({ onEmojiSelect }: { onEmojiSelect: (e: { native: string }) => void }) => (
    <div data-testid="emoji-picker">
      <button onClick={() => onEmojiSelect({ native: '\u{1F389}' })}>Select emoji</button>
    </div>
  ),
}));
vi.mock('@emoji-mart/data', () => ({ default: {} }));

import { toggleReaction } from '../../services/reactionService';

function renderToolbar() {
  return render(
    <Tooltip.Provider>
      <MessageHoverToolbar messageId="msg-1" channelId="ch-1" />
    </Tooltip.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MessageHoverToolbar', () => {
  it('renders quick-react emoji buttons', () => {
    renderToolbar();

    expect(screen.getByText('\u{1F44D}')).toBeInTheDocument();
    expect(screen.getByText('\u2764\uFE0F')).toBeInTheDocument();
    expect(screen.getByText('\u{1F602}')).toBeInTheDocument();
    expect(screen.getByText('\u{1F62E}')).toBeInTheDocument();
    expect(screen.getByText('\u{1F622}')).toBeInTheDocument();
    expect(screen.getByText('\u{1F525}')).toBeInTheDocument();
  });

  it('calls toggleReaction with correct emoji on quick-react click', () => {
    renderToolbar();

    fireEvent.click(screen.getByText('\u{1F44D}'));
    expect(toggleReaction).toHaveBeenCalledWith('msg-1', 'ch-1', '\u{1F44D}');
  });

  it('shows "+" button for more reactions', () => {
    renderToolbar();

    expect(screen.getByLabelText('More reactions')).toBeInTheDocument();
  });

  it('has hidden class for hover visibility', () => {
    const { container } = renderToolbar();
    const toolbar = container.querySelector('.hidden.group-hover\\/msg\\:flex');
    expect(toolbar).toBeInTheDocument();
  });

  it('opens emoji picker on "+" button click', async () => {
    renderToolbar();

    fireEvent.click(screen.getByLabelText('More reactions'));

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
    });
  });

  it('calls toggleReaction on picker emoji selection', async () => {
    renderToolbar();

    fireEvent.click(screen.getByLabelText('More reactions'));

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Select emoji'));
    expect(toggleReaction).toHaveBeenCalledWith('msg-1', 'ch-1', '\u{1F389}');
  });

  it('closes picker after emoji selection', async () => {
    renderToolbar();

    fireEvent.click(screen.getByLabelText('More reactions'));

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Select emoji'));

    await waitFor(() => {
      expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();
    });
  });
});
