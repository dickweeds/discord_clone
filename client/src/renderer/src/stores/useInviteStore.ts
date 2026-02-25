import { create } from 'zustand';
import type { Invite } from 'discord-clone-shared';
import { apiRequest } from '../services/apiClient';

interface InviteState {
  invites: Invite[];
  isLoading: boolean;
  error: string | null;
  fetchInvites: () => Promise<void>;
  generateInvite: () => Promise<Invite | null>;
  revokeInvite: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useInviteStore = create<InviteState>((set) => ({
  invites: [],
  isLoading: false,
  error: null,

  fetchInvites: async () => {
    set({ isLoading: true, error: null });
    try {
      const allInvites = await apiRequest<Invite[]>('/api/invites');
      const active = allInvites.filter((inv) => !inv.revoked);
      set({ invites: active, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  generateInvite: async () => {
    set({ error: null });
    try {
      const invite = await apiRequest<Invite>('/api/invites', {
        method: 'POST',
      });
      set((state) => ({ invites: [invite, ...state.invites] }));
      return invite;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  revokeInvite: async (id: string) => {
    set({ error: null });
    try {
      await apiRequest(`/api/invites/${id}`, { method: 'DELETE' });
      set((state) => ({
        invites: state.invites.filter((inv) => inv.id !== id),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  clearError: () => set({ error: null }),
}));
