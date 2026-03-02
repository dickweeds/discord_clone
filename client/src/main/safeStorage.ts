import { safeStorage, ipcMain, app } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const STORE_PATH = join(app.getPath('userData'), 'secure-tokens.json');
const PLAINTEXT_PREFIX = '__plain__:';
const allowInsecureFallback = process.env.NODE_ENV !== 'production';

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
    const store = getStore();
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value).toString('base64');
      store[key] = encrypted;
    } else if (allowInsecureFallback) {
      const plaintext = Buffer.from(value, 'utf-8').toString('base64');
      store[key] = `${PLAINTEXT_PREFIX}${plaintext}`;
    } else {
      throw new Error('Encryption unavailable');
    }
    saveStore(store);
  });

  ipcMain.handle('secure-storage:get', (_event, key: string): string | null => {
    const store = getStore();
    const raw = store[key];
    if (!raw) return null;

    if (raw.startsWith(PLAINTEXT_PREFIX)) {
      const payload = raw.slice(PLAINTEXT_PREFIX.length);
      return Buffer.from(payload, 'base64').toString('utf-8');
    }

    if (!safeStorage.isEncryptionAvailable()) return null;
    const buffer = Buffer.from(raw, 'base64');
    return safeStorage.decryptString(buffer);
  });

  ipcMain.handle('secure-storage:delete', (_event, key: string) => {
    const store = getStore();
    delete store[key];
    saveStore(store);
  });
}
