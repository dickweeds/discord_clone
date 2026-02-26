import { ElectronAPI } from '@electron-toolkit/preload';

interface SecureStorageAPI {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

interface UpdaterAPI {
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  quitAndInstall(): Promise<void>;
  onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void;
  onUpdateNotAvailable(callback: () => void): () => void;
  onUpdateDownloaded(callback: () => void): () => void;
  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void;
  onUpdateError(callback: (error: { message: string }) => void): () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      secureStorage: SecureStorageAPI;
      onDeepLink(callback: (url: string) => void): () => void;
      updater: UpdaterAPI;
    };
  }
}
