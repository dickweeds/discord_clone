import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import useAuthStore from '../../stores/useAuthStore';
import useChannelStore from '../../stores/useChannelStore';
import { ChannelSidebar } from './ChannelSidebar';

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

describe('ChannelSidebar', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'u1', username: 'owner', role: 'owner' },
      isLoading: false,
      error: null,
    });

    useChannelStore.setState({
      channels: [
        { id: 'c1', serverId: 'default', name: 'general', type: 'text', position: 0, createdAt: '', updatedAt: '' },
        { id: 'c2', serverId: 'default', name: 'gaming', type: 'voice', position: 0, createdAt: '', updatedAt: '' },
      ],
      activeChannelId: null,
      isLoading: false,
      error: null,
      fetchChannels: vi.fn(),
    });
  });

  it('renders server header, channels, and user panel', () => {
    render(
      <MemoryRouter>
        <ChannelSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /server settings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gaming/i })).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
  });

  it('updates active channel when a channel is clicked', () => {
    render(
      <MemoryRouter>
        <ChannelSidebar />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /general/i }));
    expect(useChannelStore.getState().activeChannelId).toBe('c1');
  });
});
