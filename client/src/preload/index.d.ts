import { ElectronAPI } from '@electron-toolkit/preload';

interface SecureStorageAPI {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      secureStorage: SecureStorageAPI;
      onDeepLink(callback: (url: string) => void): void;
    };
  }
}
