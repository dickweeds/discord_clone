import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceStatusBar } from './VoiceStatusBar';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { useChannelStore } from '../../stores/useChannelStore';

beforeEach(() => {
  useVoiceStore.setState({
    currentChannelId: null,
    currentUserId: null,
    connectionState: 'disconnected',
    isLoading: false,
    error: null,
    channelParticipants: new Map(),
    isMuted: false,
    isDeafened: false,
  });
  useChannelStore.setState({
    channels: [
      { id: 'voice-1', name: 'General Voice', type: 'voice', createdAt: '2024-01-01' },
    ],
  });
  vi.clearAllMocks();
});

describe('VoiceStatusBar', () => {
  it('renders nothing when not in a voice channel', () => {
    const { container } = render(<VoiceStatusBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders status bar when connected', () => {
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      connectionState: 'connected',
    });

    render(<VoiceStatusBar />);

    expect(screen.getByRole('region', { name: /voice connection status/i })).toBeInTheDocument();
  });

  it('shows "Connecting..." label during connection', () => {
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      connectionState: 'connecting',
    });

    render(<VoiceStatusBar />);

    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('shows "Voice Connected" label when connected', () => {
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      connectionState: 'connected',
    });

    render(<VoiceStatusBar />);

    expect(screen.getByText('Voice Connected')).toBeInTheDocument();
  });

  it('displays channel name', () => {
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      connectionState: 'connected',
    });

    render(<VoiceStatusBar />);

    expect(screen.getByText('General Voice')).toBeInTheDocument();
  });

  it('disconnect button calls leaveChannel', async () => {
    const mockLeave = vi.fn();
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      connectionState: 'connected',
      leaveChannel: mockLeave,
    });

    render(<VoiceStatusBar />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /disconnect from voice/i }));

    expect(mockLeave).toHaveBeenCalled();
  });

  it('mute button toggles mute', async () => {
    const mockToggle = vi.fn();
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      connectionState: 'connected',
      toggleMute: mockToggle,
    });

    render(<VoiceStatusBar />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /mute microphone/i }));

    expect(mockToggle).toHaveBeenCalled();
  });

  it('deafen button toggles deafen', async () => {
    const mockToggle = vi.fn();
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      connectionState: 'connected',
      toggleDeafen: mockToggle,
    });

    render(<VoiceStatusBar />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /deafen audio/i }));

    expect(mockToggle).toHaveBeenCalled();
  });

  it('has ARIA labels on all buttons', () => {
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      connectionState: 'connected',
    });

    render(<VoiceStatusBar />);

    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deafen audio/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle video/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disconnect from voice/i })).toBeInTheDocument();
  });

  it('video button is disabled', () => {
    useVoiceStore.setState({
      currentChannelId: 'voice-1',
      connectionState: 'connected',
    });

    render(<VoiceStatusBar />);

    expect(screen.getByRole('button', { name: /toggle video/i })).toBeDisabled();
  });

  it('shows error state when connection fails', () => {
    useVoiceStore.setState({
      currentChannelId: null,
      connectionState: 'disconnected',
      error: 'Connection failed',
    });

    render(<VoiceStatusBar />);

    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('renders nothing when disconnected with no error', () => {
    useVoiceStore.setState({
      currentChannelId: null,
      connectionState: 'disconnected',
      error: null,
    });

    const { container } = render(<VoiceStatusBar />);
    expect(container.firstChild).toBeNull();
  });
});
