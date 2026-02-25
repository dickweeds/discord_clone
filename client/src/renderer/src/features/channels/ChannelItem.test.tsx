import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Channel } from 'discord-clone-shared';
import { ChannelItem } from './ChannelItem';

const textChannel: Channel = {
  id: '1',
  serverId: 'default',
  name: 'general',
  type: 'text',
  position: 0,
  createdAt: '',
  updatedAt: '',
};

const voiceChannel: Channel = {
  ...textChannel,
  id: '2',
  name: 'Gaming',
  type: 'voice',
};

describe('ChannelItem', () => {
  it('renders text channel and click handler', () => {
    const onClick = vi.fn();
    render(<ChannelItem channel={textChannel} isActive={false} onClick={onClick} />);

    const button = screen.getByRole('button', { name: /general/i });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.querySelector('svg')).toBeInTheDocument();
  });

  it('renders voice channel and active state styling', () => {
    render(<ChannelItem channel={voiceChannel} isActive onClick={() => {}} />);

    const button = screen.getByRole('button', { name: /gaming/i });
    expect(button).toHaveAttribute('aria-current', 'page');
    expect(button.className).toContain('bg-bg-active');
  });
});
