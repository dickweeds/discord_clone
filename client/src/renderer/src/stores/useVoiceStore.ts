import { create } from 'zustand';
import * as voiceService from '../services/voiceService';
import { playConnectSound, playDisconnectSound } from '../utils/soundPlayer';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface VoiceState {
  currentChannelId: string | null;
  currentUserId: string | null;
  connectionState: ConnectionState;
  isLoading: boolean;
  error: string | null;
  channelParticipants: Map<string, string[]>;
  isMuted: boolean;
  isDeafened: boolean;

  joinChannel: (channelId: string, userId: string) => Promise<void>;
  leaveChannel: () => Promise<void>;
  localCleanup: () => void;
  addPeer: (channelId: string, userId: string) => void;
  removePeer: (channelId: string, userId: string) => void;
  setConnectionState: (state: ConnectionState) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  clearError: () => void;
  syncParticipants: (participants: { userId: string; channelId: string }[]) => void;
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

  joinChannel: async (channelId: string, userId: string) => {
    const state = get();

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
    const { currentChannelId, currentUserId } = get();
    if (!currentChannelId) return;

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
      channelParticipants: participants,
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
      channelParticipants: new Map(),
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
      return { channelParticipants: participants };
    });
  },

  setConnectionState: (connectionState: ConnectionState) => set({ connectionState }),

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  toggleDeafen: () => set((state) => ({ isDeafened: !state.isDeafened })),

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
}));
