import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SoundboardPanel } from './SoundboardPanel';
import { useSoundboardStore } from '../../stores/useSoundboardStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import useAuthStore from '../../stores/useAuthStore';

beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof window.api;
});

const mockLoadSounds = vi.fn();
const mockPlaySound = vi.fn();
const mockStopSound = vi.fn();
const mockDeleteSound = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  useAuthStore.setState({
    user: { id: 'user-1', role: 'user' } as Parameters<typeof useAuthStore.setState>[0] extends { user?: infer U } ? U : never,
  } as Partial<ReturnType<typeof useAuthStore.getState>>);

  useVoiceStore.setState({
    connectionState: 'connected',
  });

  useSoundboardStore.setState({
    sounds: [],
    isLoading: false,
    error: null,
    isPlaying: false,
    currentSoundId: null,
    loadSounds: mockLoadSounds,
    playSound: mockPlaySound,
    stopSound: mockStopSound,
    deleteSound: mockDeleteSound,
  });
});

describe('SoundboardPanel', () => {
  it('renders sound names from store', () => {
    useSoundboardStore.setState({
      sounds: [
        { id: 's1', name: 'Boing', durationMs: 1000, uploadedBy: 'user-1', uploadedByUsername: 'alice', s3Key: 'k1', createdAt: '2024-01-01' },
        { id: 's2', name: 'Honk', durationMs: 2000, uploadedBy: 'user-2', uploadedByUsername: 'bob', s3Key: 'k2', createdAt: '2024-01-02' },
      ],
    });

    render(<SoundboardPanel />);

    expect(screen.getByText('Boing')).toBeInTheDocument();
    expect(screen.getByText('Honk')).toBeInTheDocument();
  });

  it('shows loading text when isLoading and no sounds', () => {
    useSoundboardStore.setState({
      isLoading: true,
      sounds: [],
    });

    render(<SoundboardPanel />);

    expect(screen.getByText('Loading sounds...')).toBeInTheDocument();
  });

  it('shows empty message when no sounds and not loading', () => {
    useSoundboardStore.setState({
      isLoading: false,
      sounds: [],
    });

    render(<SoundboardPanel />);

    expect(screen.getByText('No sounds yet. Upload one to get started.')).toBeInTheDocument();
  });

  it('play button calls playSound with correct soundId', async () => {
    useSoundboardStore.setState({
      sounds: [
        { id: 's1', name: 'Boing', durationMs: 1000, uploadedBy: 'user-1', uploadedByUsername: 'alice', s3Key: 'k1', createdAt: '2024-01-01' },
      ],
    });

    render(<SoundboardPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /play boing/i }));

    expect(mockPlaySound).toHaveBeenCalledWith('s1');
  });

  it('play buttons disabled when not in voice channel', () => {
    useVoiceStore.setState({
      connectionState: 'disconnected',
    });

    useSoundboardStore.setState({
      sounds: [
        { id: 's1', name: 'Boing', durationMs: 1000, uploadedBy: 'user-1', uploadedByUsername: 'alice', s3Key: 'k1', createdAt: '2024-01-01' },
      ],
    });

    render(<SoundboardPanel />);

    const playButton = screen.getByRole('button', { name: /play boing/i });
    expect(playButton).toBeDisabled();
  });

  it('shows error message when error is set', () => {
    useSoundboardStore.setState({
      error: 'Failed to load sounds',
    });

    render(<SoundboardPanel />);

    expect(screen.getByText('Failed to load sounds')).toBeInTheDocument();
  });

  it('upload button is rendered', () => {
    render(<SoundboardPanel />);

    expect(screen.getByText('Upload')).toBeInTheDocument();
  });
});
