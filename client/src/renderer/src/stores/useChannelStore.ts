import { create } from 'zustand';
import type { Channel } from 'discord-clone-shared';
import { apiRequest } from '../services/apiClient';

export type ChannelListItem = Pick<Channel, 'id' | 'name' | 'type' | 'createdAt'>;

interface ChannelState {
  channels: ChannelListItem[];
  activeChannelId: string | null;
  isLoading: boolean;
  error: string | null;
  fetchChannels: () => Promise<void>;
  setActiveChannel: (channelId: string) => void;
  clearError: () => void;
}

export const useChannelStore = create<ChannelState>((set) => ({
  channels: [],
  activeChannelId: null,
  isLoading: false,
  error: null,
  fetchChannels: async () => {
    set({ isLoading: true, error: null });
    try {
      const channels = await apiRequest<ChannelListItem[]>('/api/channels');
      const sorted = [...channels].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'text' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      set({ channels: sorted, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
  clearError: () => set({ error: null }),
}));
