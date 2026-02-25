import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useChannelStore } from '../../stores/useChannelStore';
import { useMemberStore } from '../../stores/useMemberStore';
import { useUIStore } from '../../stores/useUIStore';
import useAuthStore from '../../stores/useAuthStore';
import { AppLayout } from './AppLayout';

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
});
