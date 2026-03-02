import { create } from 'zustand';
import * as voiceService from '../services/voiceService';
import * as mediaService from '../services/mediaService';
import * as vadService from '../services/vadService';
import { playConnectSound, playDisconnectSound, playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound } from '../utils/soundPlayer';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

// Internal flag to track mute state before deafen was activated
let wasMutedBeforeDeafen = false;
const PEER_VOLUME_STORAGE_KEY = 'voicePeerVolumes';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadPeerVolumes(): Map<string, number> {
  try {
    const raw = localStorage.getItem(PEER_VOLUME_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => [key, clamp(Math.round(value as number), 0, 200)] as const);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function persistPeerVolumes(peerVolumes: Map<string, number>): void {
  const serialized = Object.fromEntries(peerVolumes.entries());
  localStorage.setItem(PEER_VOLUME_STORAGE_KEY, JSON.stringify(serialized));
}

interface VoiceState {
  currentChannelId: string | null;
  currentUserId: string | null;
  connectionState: ConnectionState;
  isLoading: boolean;
  error: string | null;
  channelParticipants: Map<string, string[]>;
  isMuted: boolean;
  isDeafened: boolean;
  speakingUsers: Set<string>;
  isVideoEnabled: boolean;
  videoParticipants: Set<string>;
  selectedAudioInputId: string | null;
  selectedAudioOutputId: string | null;
  remoteMuteState: Map<string, { muted: boolean; deafened: boolean }>;
  peerVolumes: Map<string, number>;

  joinChannel: (channelId: string, userId: string) => Promise<void>;
  leaveChannel: () => Promise<void>;
  localCleanup: () => void;
  addPeer: (channelId: string, userId: string) => void;
  removePeer: (channelId: string, userId: string) => void;
  setConnectionState: (state: ConnectionState) => void;
  setSpeaking: (userId: string, isSpeaking: boolean) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleVideo: () => Promise<void>;
  addVideoParticipant: (userId: string) => void;
  removeVideoParticipant: (userId: string) => void;
  clearError: () => void;
  syncParticipants: (participants: { userId: string; channelId: string }[]) => void;
  setAudioInputDevice: (deviceId: string | null) => void;
  setAudioOutputDevice: (deviceId: string | null) => void;
  setRemoteMuteState: (userId: string, muted: boolean, deafened: boolean) => void;
  getPeerVolume: (userId: string) => number;
  setPeerVolume: (userId: string, volumePercent: number) => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  currentChannelId: null,
  currentUserId: null,
  connectionState: 'disconnected',
  isLoading: false,
  error: null,
  channelParticipants: new Map(),
  isMuted: false,
  isDeafened: false,
  speakingUsers: new Set<string>(),
  isVideoEnabled: false,
  videoParticipants: new Set(),
  selectedAudioInputId: localStorage.getItem('voiceInputDeviceId') ?? null,
  selectedAudioOutputId: localStorage.getItem('voiceOutputDeviceId') ?? null,
  remoteMuteState: new Map(),
  peerVolumes: loadPeerVolumes(),

  joinChannel: async (channelId: string, userId: string) => {
    const state = get();

    // No-op if already in the requested channel
    if (state.currentChannelId === channelId) {
      return;
    }

    // Leave current channel first if already in one
    if (state.currentChannelId) {
      await get().leaveChannel();
    }

    // Set channelId optimistically so the status bar shows the correct channel name
    set({
      connectionState: 'connecting',
      isLoading: true,
      error: null,
      currentChannelId: channelId,
      currentUserId: userId,
    });

    try {
      const { existingPeers } = await voiceService.joinVoiceChannel(channelId);

      // Build participants map with existing peers + self
      const participants = new Map(get().channelParticipants);
      const peerList = [...existingPeers, userId];
      participants.set(channelId, peerList);

      set({
        connectionState: 'connected',
        isLoading: false,
        channelParticipants: participants,
      });

      playConnectSound();

    } catch (err) {
      voiceService.cleanupMedia();
      set({
        connectionState: 'disconnected',
        currentChannelId: null,
        currentUserId: null,
        isLoading: false,
        error: (err as Error).message,
      });
    }
  },

  leaveChannel: async () => {
    const { currentChannelId, currentUserId, isVideoEnabled } = get();
    if (!currentChannelId) return;

    // Stop video if enabled before leaving
    if (isVideoEnabled) {
      voiceService.stopVideo();
    }

    try {
      await voiceService.leaveVoiceChannel(currentChannelId);
    } catch {
      // WS might already be disconnected — continue with local cleanup
    }

    voiceService.cleanupMedia();

    // Only remove self from participant list, not all participants
    const participants = new Map(get().channelParticipants);
    if (currentUserId) {
      const list = participants.get(currentChannelId) ?? [];
      const filtered = list.filter((id) => id !== currentUserId);
      if (filtered.length > 0) {
        participants.set(currentChannelId, filtered);
      } else {
        participants.delete(currentChannelId);
      }
    }

    set({
      currentChannelId: null,
      currentUserId: null,
      connectionState: 'disconnected',
      isMuted: false,
      isDeafened: false,
      speakingUsers: new Set<string>(),
      isVideoEnabled: false,
      videoParticipants: new Set(),
      channelParticipants: participants,
      remoteMuteState: new Map(),
    });

    playDisconnectSound();
  },

  localCleanup: () => {
    voiceService.cleanupMedia();

    set({
      currentChannelId: null,
      currentUserId: null,
      connectionState: 'disconnected',
      isLoading: false,
      isMuted: false,
      isDeafened: false,
      speakingUsers: new Set<string>(),
      isVideoEnabled: false,
      videoParticipants: new Set(),
      channelParticipants: new Map(),
      remoteMuteState: new Map(),
    });
  },

  addPeer: (channelId: string, userId: string) => {
    set((state) => {
      const participants = new Map(state.channelParticipants);
      const list = participants.get(channelId) ?? [];
      if (!list.includes(userId)) {
        participants.set(channelId, [...list, userId]);
      }
      return { channelParticipants: participants };
    });
  },

  removePeer: (channelId: string, userId: string) => {
    set((state) => {
      const participants = new Map(state.channelParticipants);
      const list = participants.get(channelId) ?? [];
      const filtered = list.filter((id) => id !== userId);
      if (filtered.length > 0) {
        participants.set(channelId, filtered);
      } else {
        participants.delete(channelId);
      }
      const speakingUsers = new Set(state.speakingUsers);
      speakingUsers.delete(userId);
      const remoteMuteState = new Map(state.remoteMuteState);
      remoteMuteState.delete(userId);
      return { channelParticipants: participants, speakingUsers, remoteMuteState };
    });
  },

  setConnectionState: (connectionState: ConnectionState) => set({ connectionState }),

  setSpeaking: (userId: string, isSpeaking: boolean) => {
    set((state) => {
      const speakingUsers = new Set(state.speakingUsers);
      if (isSpeaking) {
        speakingUsers.add(userId);
      } else {
        speakingUsers.delete(userId);
      }
      return { speakingUsers };
    });
  },

  toggleMute: () => {
    const state = get();
    const newMuted = !state.isMuted;
    if (newMuted) {
      mediaService.muteAudio();
      vadService.stopLocalVAD();
      playMuteSound();
      // Clear self from speaking users when muting
      if (state.currentUserId) {
        const speakingUsers = new Set(state.speakingUsers);
        speakingUsers.delete(state.currentUserId);
        set({ isMuted: true, speakingUsers });
      } else {
        set({ isMuted: true });
      }
    } else {
      mediaService.unmuteAudio();
      playUnmuteSound();
      // Restart local VAD
      const localStream = mediaService.getLocalStream();
      if (localStream && state.currentUserId) {
        const userId = state.currentUserId;
        vadService.startLocalVAD(localStream, (speaking) => {
          useVoiceStore.getState().setSpeaking(userId, speaking);
        });
      }
      set({ isMuted: false });
    }
    // Broadcast voice:state to peers
    const afterState = get();
    if (afterState.currentChannelId && afterState.currentUserId) {
      voiceService.broadcastVoiceState({
        userId: afterState.currentUserId,
        channelId: afterState.currentChannelId,
        muted: afterState.isMuted,
        deafened: afterState.isDeafened,
        speaking: false,
      });
    }
  },

  toggleDeafen: () => {
    const state = get();
    const newDeafened = !state.isDeafened;
    if (newDeafened) {
      wasMutedBeforeDeafen = state.isMuted;
      mediaService.deafenAudio();
      vadService.stopLocalVAD();
      playDeafenSound();
      // Clear self from speaking users
      const speakingUsers = new Set(state.speakingUsers);
      if (state.currentUserId) {
        speakingUsers.delete(state.currentUserId);
      }
      set({ isDeafened: true, isMuted: true, speakingUsers });
    } else {
      mediaService.undeafenAudio(wasMutedBeforeDeafen);
      if (!wasMutedBeforeDeafen) {
        playUndeafenSound();
        // Restart local VAD since mic is being unmuted
        const localStream = mediaService.getLocalStream();
        if (localStream && state.currentUserId) {
          const userId = state.currentUserId;
          vadService.startLocalVAD(localStream, (speaking) => {
            useVoiceStore.getState().setSpeaking(userId, speaking);
          });
        }
      }
      set({ isDeafened: false, isMuted: wasMutedBeforeDeafen });
    }
    // Broadcast voice:state to peers
    const afterState = get();
    if (afterState.currentChannelId && afterState.currentUserId) {
      voiceService.broadcastVoiceState({
        userId: afterState.currentUserId,
        channelId: afterState.currentChannelId,
        muted: afterState.isMuted,
        deafened: afterState.isDeafened,
        speaking: false,
      });
    }
  },

  toggleVideo: async () => {
    const { currentChannelId, currentUserId, isVideoEnabled } = get();
    if (!currentChannelId || !currentUserId) return;

    if (!isVideoEnabled) {
      try {
        await voiceService.startVideo();
        const videoParticipants = new Set(get().videoParticipants);
        videoParticipants.add(currentUserId);
        set({ isVideoEnabled: true, videoParticipants });
      } catch (err) {
        set({ error: (err as Error).message });
      }
    } else {
      voiceService.stopVideo();
      const videoParticipants = new Set(get().videoParticipants);
      videoParticipants.delete(currentUserId);
      set({ isVideoEnabled: false, videoParticipants });
    }
  },

  addVideoParticipant: (userId: string) => {
    set((state) => {
      const videoParticipants = new Set(state.videoParticipants);
      videoParticipants.add(userId);
      return { videoParticipants };
    });
  },

  removeVideoParticipant: (userId: string) => {
    set((state) => {
      const videoParticipants = new Set(state.videoParticipants);
      videoParticipants.delete(userId);
      return { videoParticipants };
    });
  },

  clearError: () => set({ error: null }),

  syncParticipants: (participants: { userId: string; channelId: string }[]) => {
    const map = new Map<string, string[]>();
    for (const p of participants) {
      const list = map.get(p.channelId) ?? [];
      list.push(p.userId);
      map.set(p.channelId, list);
    }
    set({ channelParticipants: map });
  },

  setAudioInputDevice: (deviceId: string | null) => {
    if (deviceId) {
      localStorage.setItem('voiceInputDeviceId', deviceId);
    } else {
      localStorage.removeItem('voiceInputDeviceId');
    }
    set({ selectedAudioInputId: deviceId });
    // If currently in voice, hot-swap the input device
    if (get().currentChannelId) {
      const userId = get().currentUserId;
      const vadCallback = userId
        ? (speaking: boolean) => { useVoiceStore.getState().setSpeaking(userId, speaking); }
        : undefined;
      mediaService.switchAudioInput(deviceId, vadCallback).catch((err) => {
        console.warn('[useVoiceStore] Failed to switch audio input:', err);
      });
    }
  },

  setAudioOutputDevice: (deviceId: string | null) => {
    if (deviceId) {
      localStorage.setItem('voiceOutputDeviceId', deviceId);
    } else {
      localStorage.removeItem('voiceOutputDeviceId');
    }
    set({ selectedAudioOutputId: deviceId });
    // If currently in voice, hot-swap the output device
    if (get().currentChannelId) {
      mediaService.switchAudioOutput(deviceId).catch((err) => {
        console.warn('[useVoiceStore] Failed to switch audio output:', err);
      });
    }
  },

  setRemoteMuteState: (userId: string, muted: boolean, deafened: boolean) => {
    set((state) => {
      const remoteMuteState = new Map(state.remoteMuteState);
      remoteMuteState.set(userId, { muted, deafened });
      return { remoteMuteState };
    });
  },

  getPeerVolume: (userId: string) => get().peerVolumes.get(userId) ?? 100,

  setPeerVolume: (userId: string, volumePercent: number) => {
    const clamped = clamp(Math.round(volumePercent), 0, 200);
    set((state) => {
      const peerVolumes = new Map(state.peerVolumes);
      peerVolumes.set(userId, clamped);
      persistPeerVolumes(peerVolumes);
      return { peerVolumes };
    });
    mediaService.setPeerVolume(userId, clamped / 100);
  },
}));
