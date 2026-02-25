import { create } from 'zustand';
import type { UserPublic } from 'discord-clone-shared';
import { apiRequest } from '../services/apiClient';

interface MemberState {
  members: UserPublic[];
  isLoading: boolean;
  error: string | null;
  fetchMembers: () => Promise<void>;
  clearError: () => void;
}

const useMemberStore = create<MemberState>((set) => ({
  members: [],
  isLoading: false,
  error: null,
  fetchMembers: async () => {
    set({ isLoading: true, error: null });
    try {
      const members = await apiRequest<UserPublic[]>('/api/users');
      set({ members, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load members';
      set({ isLoading: false, error: message });
    }
  },
  clearError: () => set({ error: null }),
}));

export default useMemberStore;
