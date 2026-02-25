import { create } from 'zustand';
import type { Channel } from 'discord-clone-shared';
import { apiRequest } from '../services/apiClient';

interface ChannelState {
  channels: Channel[];
  activeChannelId: string | null;
  isLoading: boolean;
  error: string | null;
  fetchChannels: () => Promise<void>;
  setActiveChannel: (channelId: string) => void;
  clearError: () => void;
}

function sortChannels(channelList: Channel[]): Channel[] {
  return [...channelList].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'text' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

const useChannelStore = create<ChannelState>((set) => ({
  channels: [],
  activeChannelId: null,
  isLoading: false,
  error: null,
  fetchChannels: async () => {
    set({ isLoading: true, error: null });
    try {
      const channels = await apiRequest<Channel[]>('/api/channels');
      const sortedChannels = sortChannels(channels);
      set((state) => ({
        channels: sortedChannels,
        activeChannelId: state.activeChannelId ?? sortedChannels.find((c) => c.type === 'text')?.id ?? null,
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load channels';
      set({ isLoading: false, error: message });
    }
  },
  setActiveChannel: (channelId: string) => set({ activeChannelId: channelId }),
  clearError: () => set({ error: null }),
}));

export default useChannelStore;
