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
