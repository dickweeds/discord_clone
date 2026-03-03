import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('../services/soundboardApi', () => ({
  fetchSounds: vi.fn(),
  requestUploadUrl: vi.fn(),
  uploadToS3: vi.fn(),
  getDownloadUrl: vi.fn(),
  deleteSound: vi.fn(),
}));

vi.mock('../services/mediaService', () => ({
  stopSoundboardAudio: vi.fn(),
  getSoundboardAudioContext: vi.fn(),
  playSoundboardAudio: vi.fn(),
  muteSoundboardConsumer: vi.fn(),
}));

vi.mock('../services/wsClient', () => ({
  wsClient: {
    send: vi.fn(),
    request: vi.fn(),
  },
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
        { id: 's1', name: 'boing', durationMs: 1000, uploadedBy: 'u1', uploadedByUsername: 'user1', s3Key: 'k1', createdAt: '2024-01-01' },
        { id: 's2', name: 'honk', durationMs: 2000, uploadedBy: 'u2', uploadedByUsername: 'user2', s3Key: 'k2', createdAt: '2024-01-02' },
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
          { id: 's1', name: 'boing', durationMs: 1000, uploadedBy: 'u1', uploadedByUsername: 'user1', s3Key: 'k1', createdAt: '2024-01-01' },
          { id: 's2', name: 'honk', durationMs: 2000, uploadedBy: 'u2', uploadedByUsername: 'user2', s3Key: 'k2', createdAt: '2024-01-02' },
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
});
