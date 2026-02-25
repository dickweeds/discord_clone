import { create } from 'zustand';

interface UIState {
  isMemberListVisible: boolean;
  toggleMemberList: () => void;
  setMemberListVisible: (visible: boolean) => void;
}

const useUIStore = create<UIState>((set) => ({
  isMemberListVisible: true,
  toggleMemberList: () => set((state) => ({ isMemberListVisible: !state.isMemberListVisible })),
  setMemberListVisible: (visible: boolean) => set({ isMemberListVisible: visible }),
}));

export default useUIStore;
