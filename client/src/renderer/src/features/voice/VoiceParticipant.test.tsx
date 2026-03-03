import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceParticipant } from './VoiceParticipant';
import { useMemberStore } from '../../stores/useMemberStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { useSoundboardStore } from '../../stores/useSoundboardStore';

vi.mock('../../stores/useAuthStore', () => ({
  default: Object.assign(
    (selector: (s: { user: { id: string } | null }) => unknown) =>
      selector({ user: { id: 'user-1' } }),
    {
      getState: () => ({ user: { id: 'user-1' } }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}));

const mockToggleSoundboardMute = vi.fn();

beforeEach(() => {
  useMemberStore.setState({
    members: [
      { id: 'user-1', username: 'Alice', role: 'user', createdAt: '2024-01-01' },
      { id: 'user-2', username: 'Bob', role: 'user', createdAt: '2024-01-01' },
    ],
  });
  useVoiceStore.setState({
    speakingUsers: new Set<string>(),
    isMuted: false,
    isDeafened: false,
    remoteMuteState: new Map(),
  });
  useSoundboardStore.setState({
    mutedSoundboardUsers: new Set<string>(),
    activePlayers: new Map<string, string>(),
    toggleUserSoundboardMute: mockToggleSoundboardMute,
  });
});

describe('VoiceParticipant', () => {
  it('renders avatar with user initial', () => {
    render(<VoiceParticipant userId="user-1" />);

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders username', () => {
    render(<VoiceParticipant userId="user-1" />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders avatar with colored background', () => {
    render(<VoiceParticipant userId="user-1" />);

    const avatar = screen.getByText('A');
    expect(avatar).toHaveStyle({ backgroundColor: expect.any(String) });
  });

  it('has correct row height (32px = h-8)', () => {
    render(<VoiceParticipant userId="user-1" />);
    const row = screen.getByRole('listitem');
    expect(row.className).toContain('h-8');
  });

  it('has left indent (pl-6 = 24px)', () => {
    render(<VoiceParticipant userId="user-1" />);
    const row = screen.getByRole('listitem');
    expect(row.className).toContain('pl-6');
  });

  it('renders "Unknown" for unrecognized userId', () => {
    render(<VoiceParticipant userId="unknown-user" />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  describe('speaking indicator', () => {
    it('shows speaking ring and animation class when user is in speakingUsers', () => {
      useVoiceStore.setState({ speakingUsers: new Set(['user-1']) });
      render(<VoiceParticipant userId="user-1" />);

      const avatar = screen.getByText('A');
      expect(avatar.className).toContain('ring-2');
      expect(avatar.className).toContain('ring-voice-speaking');
      expect(avatar.className).toContain('animate-speakingPulse');
    });

    it('does not show speaking ring when user is not speaking', () => {
      render(<VoiceParticipant userId="user-1" />);

      const avatar = screen.getByText('A');
      expect(avatar.className).not.toContain('ring-2');
      expect(avatar.className).not.toContain('ring-voice-speaking');
      expect(avatar.className).not.toContain('animate-speakingPulse');
    });

    // prefers-reduced-motion is handled via CSS @media rule in globals.css
    // which sets animation: none on .animate-speakingPulse — no JS check needed
  });

  describe('ARIA label', () => {
    it('includes (speaking) when user is speaking', () => {
      useVoiceStore.setState({ speakingUsers: new Set(['user-1']) });
      render(<VoiceParticipant userId="user-1" />);

      const row = screen.getByRole('listitem');
      expect(row).toHaveAttribute('aria-label', expect.stringContaining('(speaking)'));
    });

    it('includes (muted) when local user is muted', () => {
      useVoiceStore.setState({ isMuted: true });
      render(<VoiceParticipant userId="user-1" />);

      const row = screen.getByRole('listitem');
      expect(row).toHaveAttribute('aria-label', expect.stringContaining('(muted)'));
    });

    it('does not include (muted) for remote users', () => {
      useVoiceStore.setState({ isMuted: true });
      render(<VoiceParticipant userId="user-2" />);

      const row = screen.getByRole('listitem');
      expect(row).not.toHaveAttribute('aria-label', expect.stringContaining('(muted)'));
    });
  });

  describe('mute icon overlay', () => {
    it('shows mute icon when local user is muted', () => {
      useVoiceStore.setState({ isMuted: true });
      render(<VoiceParticipant userId="user-1" />);

      // MicOff icon should be present (rendered as svg)
      const avatar = screen.getByText('A');
      const muteIcon = avatar.querySelector('svg');
      expect(muteIcon).toBeTruthy();
    });

    it('does not show mute icon when local user is not muted', () => {
      render(<VoiceParticipant userId="user-1" />);

      const avatar = screen.getByText('A');
      const muteIcon = avatar.querySelector('svg');
      expect(muteIcon).toBeNull();
    });

    it('does not show mute icon for remote users when no remote state exists', () => {
      useVoiceStore.setState({ isMuted: true });
      render(<VoiceParticipant userId="user-2" />);

      const avatar = screen.getByText('B');
      const muteIcon = avatar.querySelector('svg');
      expect(muteIcon).toBeNull();
    });
  });

  describe('remote mute/deafen icon', () => {
    it('shows mute icon for remote muted user', () => {
      useVoiceStore.setState({
        remoteMuteState: new Map([['user-2', { muted: true, deafened: false }]]),
      });
      render(<VoiceParticipant userId="user-2" />);

      const avatar = screen.getByText('B');
      const icon = avatar.querySelector('svg');
      expect(icon).toBeTruthy();
    });

    it('shows deafen icon for remote deafened user', () => {
      useVoiceStore.setState({
        remoteMuteState: new Map([['user-2', { muted: true, deafened: true }]]),
      });
      render(<VoiceParticipant userId="user-2" />);

      const avatar = screen.getByText('B');
      const icons = avatar.querySelectorAll('svg');
      // Should show only ONE icon (deafen takes priority)
      expect(icons).toHaveLength(1);
    });

    it('deafen icon takes priority over mute icon', () => {
      useVoiceStore.setState({
        remoteMuteState: new Map([['user-2', { muted: true, deafened: true }]]),
      });
      render(<VoiceParticipant userId="user-2" />);

      const avatar = screen.getByText('B');
      const icons = avatar.querySelectorAll('svg');
      // Only one icon shown, not both
      expect(icons).toHaveLength(1);
    });

    it('ARIA label includes (muted) for remote muted users', () => {
      useVoiceStore.setState({
        remoteMuteState: new Map([['user-2', { muted: true, deafened: false }]]),
      });
      render(<VoiceParticipant userId="user-2" />);

      const row = screen.getByRole('listitem');
      expect(row).toHaveAttribute('aria-label', expect.stringContaining('(muted)'));
    });

    it('ARIA label includes (deafened) for remote deafened users', () => {
      useVoiceStore.setState({
        remoteMuteState: new Map([['user-2', { muted: true, deafened: true }]]),
      });
      render(<VoiceParticipant userId="user-2" />);

      const row = screen.getByRole('listitem');
      expect(row).toHaveAttribute('aria-label', expect.stringContaining('(deafened)'));
    });
  });

  describe('soundboard mute', () => {
    it('renders soundboard mute button for non-local participants', () => {
      render(<VoiceParticipant userId="user-2" />);

      const button = screen.getByRole('button', { name: 'Mute soundboard' });
      expect(button).toBeInTheDocument();
    });

    it('does NOT render soundboard mute button for local user', () => {
      render(<VoiceParticipant userId="user-1" />);

      const button = screen.queryByRole('button', { name: /soundboard/i });
      expect(button).not.toBeInTheDocument();
    });

    it('clicking mute button calls toggleUserSoundboardMute', async () => {
      const user = userEvent.setup();
      render(<VoiceParticipant userId="user-2" />);

      const button = screen.getByRole('button', { name: 'Mute soundboard' });
      await user.click(button);

      expect(mockToggleSoundboardMute).toHaveBeenCalledWith('user-2');
    });

    it('shows VolumeOff icon when user is soundboard-muted', () => {
      useSoundboardStore.setState({
        mutedSoundboardUsers: new Set(['user-2']),
        activePlayers: new Map<string, string>(),
        toggleUserSoundboardMute: mockToggleSoundboardMute,
      });
      render(<VoiceParticipant userId="user-2" />);

      const button = screen.getByRole('button', { name: 'Unmute soundboard' });
      expect(button).toBeInTheDocument();
    });

    it('shows active sound name when user is playing', () => {
      useSoundboardStore.setState({
        mutedSoundboardUsers: new Set<string>(),
        activePlayers: new Map([['user-2', 'airhorn']]),
        toggleUserSoundboardMute: mockToggleSoundboardMute,
      });
      render(<VoiceParticipant userId="user-2" />);

      expect(screen.getByText('airhorn')).toBeInTheDocument();
    });
  });
});
