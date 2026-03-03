import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('../services/soundboardApi', () => ({
  fetchSounds: vi.fn(),
  requestUploadUrl: vi.fn(),
  uploadToS3: vi.fn(),
  getDownloadUrl: vi.fn(),
  deleteSound: vi.fn(),
  notifySoundPlaying: vi.fn(),
  notifySoundStopped: vi.fn(),
}));

vi.mock('../services/mediaService', () => ({
  stopSoundboardAudio: vi.fn(),
  getSoundboardAudioContext: vi.fn(),
  playSoundboardAudio: vi.fn(),
  muteSoundboardConsumer: vi.fn(),
}));

import { useSoundboardStore } from './useSoundboardStore';
import * as soundboardApi from '../services/soundboardApi';
import * as mediaService from '../services/mediaService';

beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof window.api;
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useSoundboardStore.setState({
    sounds: [],
    isLoading: false,
    error: null,
    isPlaying: false,
    currentSoundId: null,
    mutedSoundboardUsers: new Set(),
    activePlayers: new Map(),
  });
});

describe('useSoundboardStore', () => {
  describe('initial state', () => {
    it('has empty sounds array, isLoading false, error null', () => {
      const state = useSoundboardStore.getState();
      expect(state.sounds).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('loadSounds', () => {
    it('sets isLoading true then populates sounds on success', async () => {
      const mockSounds = [
        { id: 's1', name: 'boing', durationMs: 1000, uploadedBy: 'u1', uploadedByUsername: 'user1', createdAt: '2024-01-01' },
        { id: 's2', name: 'honk', durationMs: 2000, uploadedBy: 'u2', uploadedByUsername: 'user2', createdAt: '2024-01-02' },
      ];
      vi.mocked(soundboardApi.fetchSounds).mockResolvedValue({ data: mockSounds, count: 2 });

      const promise = useSoundboardStore.getState().loadSounds();
      expect(useSoundboardStore.getState().isLoading).toBe(true);

      await promise;
      const state = useSoundboardStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.sounds).toEqual(mockSounds);
      expect(state.error).toBeNull();
    });

    it('sets error on failure', async () => {
      vi.mocked(soundboardApi.fetchSounds).mockRejectedValue(new Error('Network error'));

      await useSoundboardStore.getState().loadSounds();

      const state = useSoundboardStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Network error');
      expect(state.sounds).toEqual([]);
    });
  });

  describe('toggleUserSoundboardMute', () => {
    it('adds userId to mutedSoundboardUsers and persists to localStorage', () => {
      useSoundboardStore.getState().toggleUserSoundboardMute('user-1');

      const state = useSoundboardStore.getState();
      expect(state.mutedSoundboardUsers.has('user-1')).toBe(true);

      const stored = JSON.parse(localStorage.getItem('soundboardMutedUsers')!);
      expect(stored).toContain('user-1');
    });

    it('removes userId from mutedSoundboardUsers on second toggle', () => {
      useSoundboardStore.getState().toggleUserSoundboardMute('user-1');
      expect(useSoundboardStore.getState().mutedSoundboardUsers.has('user-1')).toBe(true);

      useSoundboardStore.getState().toggleUserSoundboardMute('user-1');
      expect(useSoundboardStore.getState().mutedSoundboardUsers.has('user-1')).toBe(false);

      const stored = JSON.parse(localStorage.getItem('soundboardMutedUsers')!);
      expect(stored).not.toContain('user-1');
    });
  });

  describe('isUserSoundboardMuted', () => {
    it('returns true for muted user', () => {
      useSoundboardStore.getState().toggleUserSoundboardMute('user-1');
      expect(useSoundboardStore.getState().isUserSoundboardMuted('user-1')).toBe(true);
    });

    it('returns false for non-muted user', () => {
      expect(useSoundboardStore.getState().isUserSoundboardMuted('user-1')).toBe(false);
    });
  });

  describe('setSoundPlaying', () => {
    it('adds entry to activePlayers', () => {
      useSoundboardStore.getState().setSoundPlaying('user-1', 'boing');

      const activePlayers = useSoundboardStore.getState().activePlayers;
      expect(activePlayers.get('user-1')).toBe('boing');
    });
  });

  describe('setSoundStopped', () => {
    it('removes entry from activePlayers', () => {
      useSoundboardStore.getState().setSoundPlaying('user-1', 'boing');
      expect(useSoundboardStore.getState().activePlayers.has('user-1')).toBe(true);

      useSoundboardStore.getState().setSoundStopped('user-1');
      expect(useSoundboardStore.getState().activePlayers.has('user-1')).toBe(false);
    });
  });

  describe('deleteSound', () => {
    it('removes sound from array on success', async () => {
      useSoundboardStore.setState({
        sounds: [
          { id: 's1', name: 'boing', durationMs: 1000, uploadedBy: 'u1', uploadedByUsername: 'user1', createdAt: '2024-01-01' },
          { id: 's2', name: 'honk', durationMs: 2000, uploadedBy: 'u2', uploadedByUsername: 'user2', createdAt: '2024-01-02' },
        ],
      });
      vi.mocked(soundboardApi.deleteSound).mockResolvedValue(undefined);

      await useSoundboardStore.getState().deleteSound('s1');

      const sounds = useSoundboardStore.getState().sounds;
      expect(sounds).toHaveLength(1);
      expect(sounds[0].id).toBe('s2');
    });
  });

  describe('stopSound', () => {
    it('calls mediaService.stopSoundboardAudio and resets isPlaying', () => {
      useSoundboardStore.setState({ isPlaying: true, currentSoundId: 's1' });

      useSoundboardStore.getState().stopSound();

      expect(mediaService.stopSoundboardAudio).toHaveBeenCalled();
      expect(useSoundboardStore.getState().isPlaying).toBe(false);
      expect(useSoundboardStore.getState().currentSoundId).toBeNull();
    });
  });

  describe('playSound', () => {
    const mockSound = { id: 's1', name: 'boing', durationMs: 1000, uploadedBy: 'u1', uploadedByUsername: 'user1', createdAt: '2024-01-01' };
    const fakeAudioBuffer = { duration: 5, length: 44100, numberOfChannels: 1, sampleRate: 44100, getChannelData: vi.fn() } as unknown as AudioBuffer;
    const fakeArrayBuffer = new ArrayBuffer(8);

    function setupSuccessfulPlayMocks() {
      vi.mocked(soundboardApi.getDownloadUrl).mockResolvedValue('https://example.com/sound.mp3');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(fakeArrayBuffer),
      } as unknown as Response);
      vi.mocked(mediaService.getSoundboardAudioContext).mockReturnValue({
        decodeAudioData: vi.fn().mockResolvedValue(fakeAudioBuffer),
      } as unknown as AudioContext);
      vi.mocked(mediaService.playSoundboardAudio).mockImplementation(() => {});
    }

    it('downloads, decodes, plays audio and sends SOUNDBOARD_PLAY via ws', async () => {
      useSoundboardStore.setState({ sounds: [mockSound] });
      setupSuccessfulPlayMocks();

      await useSoundboardStore.getState().playSound('s1');

      const state = useSoundboardStore.getState();
      expect(state.isPlaying).toBe(true);
      expect(state.currentSoundId).toBe('s1');
      expect(vi.mocked(soundboardApi.getDownloadUrl)).toHaveBeenCalledWith('s1');
      expect(vi.mocked(mediaService.playSoundboardAudio)).toHaveBeenCalledWith(fakeAudioBuffer, expect.any(Function));
      expect(vi.mocked(soundboardApi.notifySoundPlaying)).toHaveBeenCalledWith('s1');
    });

    it('does nothing when sound is not found in store', async () => {
      useSoundboardStore.setState({ sounds: [] });

      await useSoundboardStore.getState().playSound('nonexistent-id');

      expect(vi.mocked(soundboardApi.getDownloadUrl)).not.toHaveBeenCalled();
      expect(vi.mocked(mediaService.playSoundboardAudio)).not.toHaveBeenCalled();
      expect(vi.mocked(soundboardApi.notifySoundPlaying)).not.toHaveBeenCalled();
    });

    it('sets error and isPlaying false when download fails', async () => {
      useSoundboardStore.setState({ sounds: [mockSound] });
      vi.mocked(soundboardApi.getDownloadUrl).mockRejectedValue(new Error('Download failed'));

      await useSoundboardStore.getState().playSound('s1');

      const state = useSoundboardStore.getState();
      expect(state.error).toBe('Download failed');
      expect(state.isPlaying).toBe(false);
      expect(state.currentSoundId).toBeNull();
    });

    it('stops currently playing sound before starting new one', async () => {
      useSoundboardStore.setState({ sounds: [mockSound], isPlaying: true, currentSoundId: 'old-sound' });
      setupSuccessfulPlayMocks();

      await useSoundboardStore.getState().playSound('s1');

      expect(vi.mocked(mediaService.stopSoundboardAudio)).toHaveBeenCalled();
      expect(useSoundboardStore.getState().isPlaying).toBe(true);
      expect(useSoundboardStore.getState().currentSoundId).toBe('s1');
    });

    it('onEnded callback resets state and sends SOUNDBOARD_STOP', async () => {
      useSoundboardStore.setState({ sounds: [mockSound] });
      setupSuccessfulPlayMocks();

      let capturedOnEnded: (() => void) | undefined;
      vi.mocked(mediaService.playSoundboardAudio).mockImplementation((_buffer, onEnded) => {
        capturedOnEnded = onEnded;
      });

      await useSoundboardStore.getState().playSound('s1');

      // Verify playing state before invoking onEnded
      expect(useSoundboardStore.getState().isPlaying).toBe(true);
      expect(useSoundboardStore.getState().currentSoundId).toBe('s1');

      // Clear mock call history so we can assert only the onEnded notification
      vi.mocked(soundboardApi.notifySoundStopped).mockClear();

      // Invoke the onEnded callback
      expect(capturedOnEnded).toBeDefined();
      capturedOnEnded!();

      const state = useSoundboardStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentSoundId).toBeNull();
      expect(vi.mocked(soundboardApi.notifySoundStopped)).toHaveBeenCalled();
    });
  });
});
