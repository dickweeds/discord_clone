import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AudioSettings } from './AudioSettings';
import { useVoiceStore } from '../../stores/useVoiceStore';

vi.mock('../../hooks/useMediaDevices', () => ({
  useMediaDevices: vi.fn().mockReturnValue({
    audioInputs: [
      { deviceId: 'mic-1', label: 'Built-in Microphone', kind: 'audioinput', groupId: '', toJSON: () => ({}) },
      { deviceId: 'mic-2', label: 'External Mic', kind: 'audioinput', groupId: '', toJSON: () => ({}) },
    ],
    audioOutputs: [
      { deviceId: 'spk-1', label: 'Built-in Speaker', kind: 'audiooutput', groupId: '', toJSON: () => ({}) },
    ],
    isLoading: false,
  }),
}));

vi.mock('../../services/voiceService', () => ({
  joinVoiceChannel: vi.fn(),
  leaveVoiceChannel: vi.fn(),
  cleanupMedia: vi.fn(),
  startVideo: vi.fn(),
  stopVideo: vi.fn(),
  broadcastVoiceState: vi.fn(),
}));

vi.mock('../../services/mediaService', () => ({
  muteAudio: vi.fn(),
  unmuteAudio: vi.fn(),
  deafenAudio: vi.fn(),
  undeafenAudio: vi.fn(),
  getLocalStream: vi.fn(),
  switchAudioInput: vi.fn().mockResolvedValue(undefined),
  switchAudioOutput: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/vadService', () => ({
  stopLocalVAD: vi.fn(),
  startLocalVAD: vi.fn(),
  stopAllVAD: vi.fn(),
}));

vi.mock('../../utils/soundPlayer', () => ({
  playConnectSound: vi.fn(),
  playDisconnectSound: vi.fn(),
  playMuteSound: vi.fn(),
  playUnmuteSound: vi.fn(),
}));

vi.mock('../../services/wsClient', () => ({
  wsClient: { send: vi.fn() },
}));

beforeEach(() => {
  useVoiceStore.setState({
    selectedAudioInputId: null,
    selectedAudioOutputId: null,
    currentChannelId: null,
    currentUserId: null,
    connectionState: 'disconnected',
    isLoading: false,
    error: null,
    channelParticipants: new Map(),
    isMuted: false,
    isDeafened: false,
    speakingUsers: new Set(),
    isVideoEnabled: false,
    videoParticipants: new Set(),
    remoteMuteState: new Map(),
  });
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AudioSettings', () => {
  it('renders input and output device dropdowns', () => {
    render(<AudioSettings />);

    expect(screen.getByLabelText('Input Device')).toBeInTheDocument();
    expect(screen.getByLabelText('Output Device')).toBeInTheDocument();
  });

  it('shows "System Default" option', () => {
    render(<AudioSettings />);

    const inputSelect = screen.getByLabelText('Input Device') as HTMLSelectElement;
    const options = inputSelect.querySelectorAll('option');
    expect(options[0].textContent).toBe('System Default');
    expect(options[0].value).toBe('');
  });

  it('selecting input device calls setAudioInputDevice', () => {
    render(<AudioSettings />);

    fireEvent.change(screen.getByLabelText('Input Device'), {
      target: { value: 'mic-2' },
    });

    expect(useVoiceStore.getState().selectedAudioInputId).toBe('mic-2');
  });

  it('selecting output device calls setAudioOutputDevice', () => {
    render(<AudioSettings />);

    fireEvent.change(screen.getByLabelText('Output Device'), {
      target: { value: 'spk-1' },
    });

    expect(useVoiceStore.getState().selectedAudioOutputId).toBe('spk-1');
  });

  it('shows current selected devices', () => {
    useVoiceStore.setState({ selectedAudioInputId: 'mic-2' });
    render(<AudioSettings />);

    const inputSelect = screen.getByLabelText('Input Device') as HTMLSelectElement;
    expect(inputSelect.value).toBe('mic-2');
  });
});
