import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

const api = {
  secureStorage: {
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('secure-storage:set', key, value),
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke('secure-storage:get', key),
    delete: (key: string): Promise<void> =>
      ipcRenderer.invoke('secure-storage:delete', key),
  },
  onDeepLink: (callback: (url: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => callback(url);
    ipcRenderer.on('deep-link', handler);
    return () => {
      ipcRenderer.removeListener('deep-link', handler);
    };
  },
  updater: {
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updater:check'),
    downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    onUpdateAvailable: (
      callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void,
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        info: { version: string; releaseNotes?: string; releaseDate?: string },
      ): void => callback(info);
      ipcRenderer.on('updater:available', handler);
      return () => {
        ipcRenderer.removeListener('updater:available', handler);
      };
    },
    onUpdateDownloaded: (callback: () => void): (() => void) => {
      const handler = (): void => callback();
      ipcRenderer.on('updater:downloaded', handler);
      return () => {
        ipcRenderer.removeListener('updater:downloaded', handler);
      };
    },
    onDownloadProgress: (
      callback: (progress: {
        percent: number;
        bytesPerSecond: number;
        transferred: number;
        total: number;
      }) => void,
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: { percent: number; bytesPerSecond: number; transferred: number; total: number },
      ): void => callback(progress);
      ipcRenderer.on('updater:download-progress', handler);
      return () => {
        ipcRenderer.removeListener('updater:download-progress', handler);
      };
    },
    onUpdateNotAvailable: (callback: () => void): (() => void) => {
      const handler = (): void => callback();
      ipcRenderer.on('updater:not-available', handler);
      return () => {
        ipcRenderer.removeListener('updater:not-available', handler);
      };
    },
    onUpdateError: (callback: (error: { message: string }) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        error: { message: string },
      ): void => callback(error);
      ipcRenderer.on('updater:error', handler);
      return () => {
        ipcRenderer.removeListener('updater:error', handler);
      };
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error Fallback for non-isolated context
  window.electron = electronAPI;
  // @ts-expect-error Fallback for non-isolated context
  window.api = api;
}
