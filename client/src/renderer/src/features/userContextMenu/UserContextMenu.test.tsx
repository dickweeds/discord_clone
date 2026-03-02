import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useAuthStore from '../../stores/useAuthStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { UserContextMenu } from './UserContextMenu';

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
  apiRequest: vi.fn().mockResolvedValue({ temporaryPassword: 'test-password' }),
  configureApiClient: vi.fn(),
}));

function renderMenu(role: 'owner' | 'admin' | 'user', currentUserId: string, targetUserId: string, surface: 'voice' | 'member-online' | 'member-offline') {
  useAuthStore.setState({
    user: { id: currentUserId, username: 'current', role },
    accessToken: 'token',
    refreshToken: 'refresh',
    groupKey: null,
    isLoading: false,
    error: null,
  });

  return render(
    <UserContextMenu
      userId={targetUserId}
      username="target"
      surface={surface}
      isTargetOnline={surface !== 'member-offline'}
      isTargetInVoice={surface === 'voice'}
    >
      <div data-testid="target-user">Target User</div>
    </UserContextMenu>,
  );
}

describe('UserContextMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    useVoiceStore.setState({
      peerVolumes: new Map(),
      remoteMuteState: new Map(),
      speakingUsers: new Set(),
      channelParticipants: new Map(),
    });
  });

  it('shows volume and admin actions for owner targeting another user', async () => {
    renderMenu('owner', 'owner-id', 'user-id', 'member-online');
    const user = userEvent.setup();

    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target-user') });

    expect(screen.getByText('User Volume')).toBeInTheDocument();
    expect(screen.getByText('Kick')).toBeInTheDocument();
    expect(screen.getByText('Ban')).toBeInTheDocument();
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
  });

  it('shows only volume for non-owner targeting another user online', async () => {
    renderMenu('user', 'user-a', 'user-b', 'member-online');
    const user = userEvent.setup();

    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target-user') });

    expect(screen.getByText('User Volume')).toBeInTheDocument();
    expect(screen.queryByText('Kick')).not.toBeInTheDocument();
    expect(screen.queryByText('Ban')).not.toBeInTheDocument();
  });

  it('shows fallback message for self target', async () => {
    renderMenu('owner', 'same-id', 'same-id', 'member-online');
    const user = userEvent.setup();

    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target-user') });

    expect(screen.queryByText('User Volume')).not.toBeInTheDocument();
    expect(screen.queryByText('Kick')).not.toBeInTheDocument();
    expect(screen.getByText('No actions available')).toBeInTheDocument();
  });

  it('shows fallback message in offline member surface when no actions apply', async () => {
    renderMenu('user', 'user-a', 'user-b', 'member-offline');
    const user = userEvent.setup();

    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target-user') });

    expect(screen.queryByText('User Volume')).not.toBeInTheDocument();
    expect(screen.getByText('No actions available')).toBeInTheDocument();
  });

  it('shows admin actions for admin role targeting another user', async () => {
    renderMenu('admin', 'admin-id', 'user-id', 'member-online');
    const user = userEvent.setup();

    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target-user') });

    expect(screen.getByText('Kick')).toBeInTheDocument();
    expect(screen.getByText('Ban')).toBeInTheDocument();
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
  });

  it('updates peer volume via slider', async () => {
    renderMenu('user', 'user-a', 'user-b', 'voice');
    const user = userEvent.setup();

    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target-user') });

    const slider = screen.getByLabelText('Volume for target') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '145' } });

    expect(useVoiceStore.getState().getPeerVolume('user-b')).toBe(145);
  });
});
