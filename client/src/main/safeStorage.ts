import { safeStorage, ipcMain, app } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const STORE_PATH = join(app.getPath('userData'), 'secure-tokens.json');

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
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption unavailable');
    const encrypted = safeStorage.encryptString(value).toString('base64');
    const store = getStore();
    store[key] = encrypted;
    saveStore(store);
  });

  ipcMain.handle('secure-storage:get', (_event, key: string): string | null => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const store = getStore();
    if (!store[key]) return null;
    const buffer = Buffer.from(store[key], 'base64');
    return safeStorage.decryptString(buffer);
  });

  ipcMain.handle('secure-storage:delete', (_event, key: string) => {
    const store = getStore();
    delete store[key];
    saveStore(store);
  });
}
