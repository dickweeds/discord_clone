import { BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { is } from '@electron-toolkit/utils';

function sendToRenderer(mainWindow: BrowserWindow, channel: string, ...args: unknown[]): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  if (is.dev) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Event listeners — forward to renderer via IPC
  autoUpdater.on('checking-for-update', () => {
    sendToRenderer(mainWindow, 'updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    sendToRenderer(mainWindow, 'updater:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer(mainWindow, 'updater:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer(mainWindow, 'updater:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    sendToRenderer(mainWindow, 'updater:downloaded');
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
    sendToRenderer(mainWindow, 'updater:error', { message: err.message });
  });

  // IPC handlers — renderer invokes these
  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      console.error('Failed to download update:', err);
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall();
  });

  // Check for updates 5 seconds after startup
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 5000);
}
