import { create } from 'zustand';

interface UIState {
  isMemberListVisible: boolean;
  toggleMemberList: () => void;
  setMemberListVisible: (visible: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isMemberListVisible: true,
  toggleMemberList: () => set((state) => ({ isMemberListVisible: !state.isMemberListVisible })),
  setMemberListVisible: (visible) => set({ isMemberListVisible: visible }),
}));
