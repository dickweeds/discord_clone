import { create } from 'zustand';
import { apiRequest } from '../services/apiClient';
import type { UserPublic } from 'discord-clone-shared';

interface MemberState {
  members: UserPublic[];
  isLoading: boolean;
  error: string | null;
  fetchMembers: () => Promise<void>;
  addMember: (member: UserPublic) => void;
  updateMemberAvatar: (userId: string, avatarUrl?: string) => void;
  removeMember: (userId: string) => void;
  clearError: () => void;
}

export const useMemberStore = create<MemberState>((set) => ({
  members: [],
  isLoading: false,
  error: null,
  fetchMembers: async () => {
    set({ isLoading: true, error: null });
    try {
      const members = await apiRequest<UserPublic[]>('/api/users');
      set({ members, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
  addMember: (member: UserPublic) => set((state) => {
    if (state.members.some((m) => m.id === member.id)) return state;
    return { members: [...state.members, member] };
  }),
  updateMemberAvatar: (userId: string, avatarUrl?: string) => set((state) => ({
    members: state.members.map((member) => (
      member.id === userId
        ? {
            ...member,
            ...(avatarUrl ? { avatarUrl } : { avatarUrl: undefined }),
          }
        : member
    )),
  })),
  removeMember: (userId: string) => set((state) => ({
    members: state.members.filter((m) => m.id !== userId),
  })),
  clearError: () => set({ error: null }),
}));
