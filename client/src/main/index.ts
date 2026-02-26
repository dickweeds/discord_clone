import { app, shell, BrowserWindow } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { registerSafeStorageHandlers } from './safeStorage';

const PROTOCOL = 'discord-clone';

// Single instance lock — prevent multiple instances when protocol handler opens the app
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Register custom protocol handler before app is ready
app.setAsDefaultProtocolClient(PROTOCOL);

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: string | null = null;

function sendDeepLink(url: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('deep-link', url);
  }
}

function findProtocolUrl(args: string[]): string | undefined {
  return args.find((arg) => arg.startsWith(`${PROTOCOL}://`));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
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
    mainWindow!.show();
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

  // Handle cold start deep link:
  // - Windows/Linux: URL passed via process.argv
  // - macOS: URL queued from open-url event (fires before window exists)
  const coldStartUrl = findProtocolUrl(process.argv) || pendingDeepLink;
  if (coldStartUrl) {
    mainWindow.webContents.once('did-finish-load', () => {
      sendDeepLink(coldStartUrl);
    });
    pendingDeepLink = null;
  }
}

// macOS: open-url fires when protocol URL is clicked (app already running or cold start)
// On cold start, this fires BEFORE mainWindow exists — queue the URL for later
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    sendDeepLink(url);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingDeepLink = url;
  }
});

// Windows/Linux: second-instance fires when a second instance opens with the URL
app.on('second-instance', (_event, commandLine) => {
  const url = findProtocolUrl(commandLine);
  if (url) {
    sendDeepLink(url);
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.discord-clone');
  registerSafeStorageHandlers();

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
