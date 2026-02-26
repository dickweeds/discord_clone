import { create } from 'zustand';

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  version: string | null;
  downloadProgress: number;
  error: string | null;
  dismissed: boolean;
}

interface UpdateActions {
  checkForUpdates: () => void;
  downloadUpdate: () => void;
  quitAndInstall: () => void;
  dismiss: () => void;
  reset: () => void;
  initUpdateListeners: () => () => void;
}

const initialState: UpdateState = {
  status: 'idle',
  version: null,
  downloadProgress: 0,
  error: null,
  dismissed: false,
};

export const useUpdateStore = create<UpdateState & UpdateActions>()((set) => ({
  ...initialState,

  checkForUpdates: () => {
    set({ status: 'checking', error: null });
    window.api.updater.checkForUpdates();
  },

  downloadUpdate: () => {
    set({ status: 'downloading', downloadProgress: 0 });
    window.api.updater.downloadUpdate();
  },

  quitAndInstall: () => {
    window.api.updater.quitAndInstall();
  },

  dismiss: () => {
    set({ dismissed: true });
  },

  reset: () => {
    set(initialState);
  },

  initUpdateListeners: () => {
    const cleanupAvailable = window.api.updater.onUpdateAvailable((info) => {
      set({
        status: 'available',
        version: info.version,
      });
    });

    const cleanupNotAvailable = window.api.updater.onUpdateNotAvailable(() => {
      set({ status: 'idle' });
    });

    const cleanupDownloaded = window.api.updater.onUpdateDownloaded(() => {
      set({ status: 'downloaded' });
    });

    const cleanupProgress = window.api.updater.onDownloadProgress((progress) => {
      set({ downloadProgress: Math.round(progress.percent) });
    });

    const cleanupError = window.api.updater.onUpdateError((error) => {
      set({ status: 'error', error: error.message });
    });

    return () => {
      cleanupAvailable();
      cleanupNotAvailable();
      cleanupDownloaded();
      cleanupProgress();
      cleanupError();
    };
  },
}));
