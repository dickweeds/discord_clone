import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useChannelStore } from '../../stores/useChannelStore';
import { useMemberStore } from '../../stores/useMemberStore';
import { useUIStore } from '../../stores/useUIStore';
import useAuthStore from '../../stores/useAuthStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { AppLayout } from './AppLayout';

vi.mock('../../services/mediaService', () => ({
  getLocalVideoStream: vi.fn().mockReturnValue(null),
  getVideoStreamByPeerId: vi.fn().mockReturnValue(null),
}));

beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('../../services/apiClient', () => ({
  apiRequest: vi.fn().mockResolvedValue([]),
  configureApiClient: vi.fn(),
}));

beforeEach(() => {
  useChannelStore.setState({
    channels: [
      { id: '1', name: 'general', type: 'text', createdAt: '2024-01-01' },
    ],
    activeChannelId: null,
    isLoading: false,
    error: null,
  });
  useMemberStore.setState({
    members: [],
    isLoading: false,
    error: null,
  });
  useUIStore.setState({ isMemberListVisible: true });
  useAuthStore.setState({
    user: { id: 'u1', username: 'testuser', role: 'user' },
    accessToken: 'token',
    refreshToken: 'refresh',
    groupKey: null,
    isLoading: false,
    error: null,
  });
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<div>Outlet Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  it('renders three-column layout with semantic HTML', () => {
    renderLayout();
    expect(screen.getByRole('navigation', { name: /channel navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: /channel content/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /member list/i })).toBeInTheDocument();
  });

  it('renders the outlet content in main area', () => {
    renderLayout();
    expect(screen.getByText('Outlet Content')).toBeInTheDocument();
  });

  it('hides member list when isMemberListVisible is false', () => {
    useUIStore.setState({ isMemberListVisible: false });
    renderLayout();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('renders sidebar with correct width class', () => {
    renderLayout();
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('w-[240px]');
  });

  it('renders VideoGrid when videoParticipants has entries', async () => {
    const mediaService = await import('../../services/mediaService');
    (mediaService.getLocalVideoStream as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'local-stream' });

    useMemberStore.setState({
      members: [{ id: 'u1', username: 'testuser', role: 'user' }],
    });

    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      videoParticipants: new Set(['u1']),
      speakingUsers: new Set(),
    });

    renderLayout();

    const main = screen.getByRole('main');
    expect(main.querySelector('.grid')).not.toBeNull();
    expect(within(main).getByText('testuser')).toBeInTheDocument();
  });

  it('does not render VideoGrid when videoParticipants is empty', () => {
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      videoParticipants: new Set(),
      speakingUsers: new Set(),
    });

    const { container } = renderLayout();

    // VideoGrid returns null — no grid element
    const grid = container.querySelector('.grid.gap-2');
    expect(grid).toBeNull();
  });

  it('does not render VideoGrid when not in a voice channel', () => {
    useVoiceStore.setState({
      currentChannelId: null,
      videoParticipants: new Set(),
      speakingUsers: new Set(),
    });

    const { container } = renderLayout();

    const grid = container.querySelector('.grid.gap-2');
    expect(grid).toBeNull();
  });
});
