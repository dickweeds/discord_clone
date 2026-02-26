import { app, shell, BrowserWindow, session } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { registerSafeStorageHandlers } from './safeStorage';

function setupContentSecurityPolicy(): void {
  const apiUrl = is.dev ? 'http://localhost:3000' : (process.env.API_URL || 'http://localhost:3000');
  const wsUrl = is.dev ? 'ws://localhost:3000' : (process.env.WS_URL || 'ws://localhost:3000');
  const wssUrl = wsUrl.replace(/^ws:/, 'wss:');

  // In development, allow the electron-vite dev server for HMR
  const devSources = is.dev ? ' http://localhost:* ws://localhost:*' : '';

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${apiUrl} ${wsUrl} ${wssUrl}${devSources}`,
    "media-src 'self' blob: mediastream:",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,

      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.discord-clone');
  registerSafeStorageHandlers();
  setupContentSecurityPolicy();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
