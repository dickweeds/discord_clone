import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { useChannelStore } from '../../stores/useChannelStore';
import useAuthStore from '../../stores/useAuthStore';
import { ChannelSidebar } from './ChannelSidebar';

let capturedPathname = '';

function LocationSpy() {
  const location = useLocation();
  capturedPathname = location.pathname;
  return null;
}

beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const mockChannels = [
  { id: '1', name: 'general', type: 'text' as const, createdAt: '2024-01-01' },
  { id: '2', name: 'help', type: 'text' as const, createdAt: '2024-01-01' },
  { id: '3', name: 'Gaming', type: 'voice' as const, createdAt: '2024-01-01' },
];

beforeEach(() => {
  useChannelStore.setState({
    channels: mockChannels,
    activeChannelId: null,
    isLoading: false,
    error: null,
  });
  useAuthStore.setState({
    user: { id: 'u1', username: 'testuser', role: 'user' },
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    groupKey: null,
    isLoading: false,
    error: null,
  });
});

function renderSidebar() {
  capturedPathname = '';
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <LocationSpy />
      <ChannelSidebar />
    </MemoryRouter>,
  );
}

describe('ChannelSidebar', () => {
  it('renders server header', () => {
    renderSidebar();
    expect(screen.getByText('discord_clone')).toBeInTheDocument();
  });

  it('renders text and voice channel groups', () => {
    renderSidebar();
    expect(screen.getByText('TEXT CHANNELS')).toBeInTheDocument();
    expect(screen.getByText('VOICE CHANNELS')).toBeInTheDocument();
  });

  it('renders channel names', () => {
    renderSidebar();
    expect(screen.getByText('general')).toBeInTheDocument();
    expect(screen.getByText('help')).toBeInTheDocument();
    expect(screen.getByText('Gaming')).toBeInTheDocument();
  });

  it('renders user panel with current user', () => {
    renderSidebar();
    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.getByLabelText('User settings')).toBeInTheDocument();
  });

  it('renders loading skeletons when loading', () => {
    useChannelStore.setState({ isLoading: true, channels: [] });
    const { container } = renderSidebar();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('navigates to channel route when text channel is clicked', async () => {
    renderSidebar();
    const user = userEvent.setup();
    await user.click(screen.getByText('general'));
    expect(capturedPathname).toBe('/app/channels/1');
  });
});
