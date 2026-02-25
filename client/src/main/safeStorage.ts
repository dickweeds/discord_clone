import { safeStorage, ipcMain, app } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const STORE_PATH = join(app.getPath('userData'), 'secure-tokens.json');
const PLAINTEXT_PREFIX = 'plain:';

function getStore(): Record<string, string> {
  if (!existsSync(STORE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, string>): void {
  writeFileSync(STORE_PATH, JSON.stringify(store));
}

export function registerSafeStorageHandlers(): void {
  ipcMain.handle('secure-storage:set', (_event, key: string, value: string) => {
    const encoded = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value).toString('base64')
      : `${PLAINTEXT_PREFIX}${Buffer.from(value, 'utf-8').toString('base64')}`;
    const store = getStore();
    store[key] = encoded;
    saveStore(store);
  });

  ipcMain.handle('secure-storage:get', (_event, key: string): string | null => {
    const store = getStore();
    const storedValue = store[key];
    if (!storedValue) return null;

    if (storedValue.startsWith(PLAINTEXT_PREFIX)) {
      const encoded = storedValue.slice(PLAINTEXT_PREFIX.length);
      return Buffer.from(encoded, 'base64').toString('utf-8');
    }

    if (!safeStorage.isEncryptionAvailable()) return null;

    const buffer = Buffer.from(storedValue, 'base64');
    return safeStorage.decryptString(buffer);
  });

  ipcMain.handle('secure-storage:delete', (_event, key: string) => {
    const store = getStore();
    delete store[key];
    saveStore(store);
  });
}
