import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import useAuthStore from '../../stores/useAuthStore';
import useChannelStore from '../../stores/useChannelStore';
import useMemberStore from '../../stores/useMemberStore';
import useUIStore from '../../stores/useUIStore';
import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'u1', username: 'owner', role: 'owner' },
      isLoading: false,
    });

    useChannelStore.setState({
      channels: [
        { id: 'c1', serverId: 'default', name: 'general', type: 'text', position: 0, createdAt: '', updatedAt: '' },
      ],
      activeChannelId: 'c1',
      isLoading: false,
      error: null,
      fetchChannels: vi.fn().mockResolvedValue(undefined),
    });

    useMemberStore.setState({
      members: [{ id: 'u1', username: 'owner', role: 'owner', createdAt: '' }],
      isLoading: false,
      error: null,
      fetchMembers: vi.fn().mockResolvedValue(undefined),
    });

    useUIStore.setState({ isMemberListVisible: true });
  });

  it('renders three-column semantic layout', () => {
    render(
      <MemoryRouter initialEntries={['/app/channels/c1']}>
        <Routes>
          <Route path="/app" element={<AppLayout />}>
            <Route path="channels/:channelId" element={<div>Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: /channel navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: /channel content/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /member list/i })).toBeInTheDocument();
  });
});
