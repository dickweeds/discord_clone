import { create } from 'zustand';
import type { SoundResponse } from 'discord-clone-shared';
import { WS_TYPES, SOUNDBOARD_MAX_DURATION_S } from 'discord-clone-shared';
import * as soundboardApi from '../services/soundboardApi';
import * as mediaService from '../services/mediaService';
import { wsClient } from '../services/wsClient';

const MUTED_USERS_STORAGE_KEY = 'soundboardMutedUsers';

function loadMutedUsers(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTED_USERS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function persistMutedUsers(users: Set<string>): void {
  try {
    localStorage.setItem(MUTED_USERS_STORAGE_KEY, JSON.stringify([...users]));
  } catch {
    // localStorage full or unavailable — mute state still works in-session
  }
}

interface SoundboardState {
  sounds: SoundResponse[];
  isLoading: boolean;
  error: string | null;

  isPlaying: boolean;
  currentSoundId: string | null;

  mutedSoundboardUsers: Set<string>;
  activePlayers: Map<string, string>;

  _playAbort: AbortController | null;

  loadSounds: () => Promise<void>;
  uploadSound: (file: File, name: string, durationMs: number) => Promise<void>;
  deleteSound: (soundId: string) => Promise<void>;
  playSound: (soundId: string) => Promise<void>;
  stopSound: () => void;
  toggleUserSoundboardMute: (userId: string) => void;
  isUserSoundboardMuted: (userId: string) => boolean;
  setSoundPlaying: (userId: string, soundName: string) => void;
  setSoundStopped: (userId: string) => void;
}

export const useSoundboardStore = create<SoundboardState>((set, get) => ({
  sounds: [],
  isLoading: false,
  error: null,
  isPlaying: false,
  currentSoundId: null,
  mutedSoundboardUsers: loadMutedUsers(),
  activePlayers: new Map(),
  _playAbort: null,

  loadSounds: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await soundboardApi.fetchSounds();
      set({ sounds: result.data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  uploadSound: async (file: File, name: string, durationMs: number) => {
    set({ error: null });
    try {
      const { uploadUrl } = await soundboardApi.requestUploadUrl({
        fileName: name,
        contentType: file.type,
        fileSize: file.size,
        durationMs,
      });
      await soundboardApi.uploadToS3(uploadUrl, file);
      await get().loadSounds();
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  deleteSound: async (soundId: string) => {
    set({ error: null });
    try {
      await soundboardApi.deleteSound(soundId);
      set((state) => ({
        sounds: state.sounds.filter((s) => s.id !== soundId),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  playSound: async (soundId: string) => {
    const sound = get().sounds.find((s) => s.id === soundId);
    if (!sound) return;

    // Abort any in-flight play operation
    get()._playAbort?.abort();
    const abort = new AbortController();
    set({ _playAbort: abort });

    // Stop any currently playing sound
    if (get().isPlaying) {
      get().stopSound();
    }

    try {
      const downloadUrl = await soundboardApi.getDownloadUrl(soundId);
      if (abort.signal.aborted) return;

      const response = await fetch(downloadUrl, { signal: abort.signal });
      if (!response.ok) {
        throw new Error('Failed to download sound — it may have been deleted');
      }
      const arrayBuffer = await response.arrayBuffer();
      if (abort.signal.aborted) return;

      const audioContext = mediaService.getSoundboardAudioContext();
      if (!audioContext) return;

      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      if (abort.signal.aborted) return;

      // Validate duration
      if (audioBuffer.duration > SOUNDBOARD_MAX_DURATION_S) {
        set({ error: `Sound exceeds maximum duration of ${SOUNDBOARD_MAX_DURATION_S} seconds` });
        return;
      }

      mediaService.playSoundboardAudio(audioBuffer, () => {
        set({ isPlaying: false, currentSoundId: null });
        try {
          wsClient.send({
            type: WS_TYPES.SOUNDBOARD_STOP,
            payload: {},
          });
        } catch {
          // WS not connected — non-critical
        }
      });
      set({ isPlaying: true, currentSoundId: soundId });

      // Send play notification
      try {
        wsClient.send({
          type: WS_TYPES.SOUNDBOARD_PLAY,
          payload: { soundId, soundName: sound.name },
        });
      } catch {
        // WS not connected — non-critical
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      set({ error: (err as Error).message, isPlaying: false, currentSoundId: null });
    }
  },

  stopSound: () => {
    mediaService.stopSoundboardAudio();
    set({ isPlaying: false, currentSoundId: null });
    try {
      wsClient.send({
        type: WS_TYPES.SOUNDBOARD_STOP,
        payload: {},
      });
    } catch {
      // WS not connected — non-critical
    }
  },

  toggleUserSoundboardMute: (userId: string) => {
    const mutedUsers = new Set(get().mutedSoundboardUsers);
    const nowMuted = !mutedUsers.has(userId);
    if (nowMuted) {
      mutedUsers.add(userId);
    } else {
      mutedUsers.delete(userId);
    }
    set({ mutedSoundboardUsers: mutedUsers });
    persistMutedUsers(mutedUsers);
    mediaService.muteSoundboardConsumer(userId, nowMuted);
  },

  isUserSoundboardMuted: (userId: string) => {
    return get().mutedSoundboardUsers.has(userId);
  },

  setSoundPlaying: (userId: string, soundName: string) => {
    set((state) => {
      const activePlayers = new Map(state.activePlayers);
      activePlayers.set(userId, soundName);
      return { activePlayers };
    });
  },

  setSoundStopped: (userId: string) => {
    set((state) => {
      const activePlayers = new Map(state.activePlayers);
      activePlayers.delete(userId);
      return { activePlayers };
    });
  },
}));
