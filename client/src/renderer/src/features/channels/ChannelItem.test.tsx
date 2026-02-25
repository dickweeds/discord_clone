import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { ChannelItem } from './ChannelItem';

let capturedPathname = '';

function LocationSpy() {
  const location = useLocation();
  capturedPathname = location.pathname;
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedPathname = '';
});

function renderItem(props: { type: 'text' | 'voice'; isActive?: boolean }) {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <LocationSpy />
      <ChannelItem
        channel={{ id: 'ch-1', name: 'test-channel', type: props.type, createdAt: '2024-01-01' }}
        isActive={props.isActive ?? false}
      />
    </MemoryRouter>,
  );
}

describe('ChannelItem', () => {
  it('renders channel name', () => {
    renderItem({ type: 'text' });
    expect(screen.getByText('test-channel')).toBeInTheDocument();
  });

  it('renders as a button element', () => {
    renderItem({ type: 'text' });
    expect(screen.getByRole('button', { name: /test-channel/i })).toBeInTheDocument();
  });

  it('applies active styling when isActive is true', () => {
    renderItem({ type: 'text', isActive: true });
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-current', 'page');
    expect(button.className).toContain('bg-bg-active');
  });

  it('does not have aria-current when inactive', () => {
    renderItem({ type: 'text', isActive: false });
    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('aria-current');
  });

  it('navigates to channel route when text channel is clicked', async () => {
    renderItem({ type: 'text' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    expect(capturedPathname).toBe('/app/channels/ch-1');
  });

  it('does not navigate when voice channel is clicked', async () => {
    renderItem({ type: 'voice' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    expect(capturedPathname).toBe('/app');
  });

  it('renders voice channel with correct button', () => {
    renderItem({ type: 'voice' });
    expect(screen.getByRole('button', { name: /test-channel/i })).toBeInTheDocument();
  });
});
