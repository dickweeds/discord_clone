import React, { useEffect } from 'react';
import { useUpdateStore } from '../stores/useUpdateStore';
import { usePresenceStore } from '../stores/usePresenceStore';

export function UpdateNotification(): React.ReactNode {
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const downloadProgress = useUpdateStore((s) => s.downloadProgress);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const downloadUpdate = useUpdateStore((s) => s.downloadUpdate);
  const dismissAction = useUpdateStore((s) => s.dismiss);
  const quitAndInstall = useUpdateStore((s) => s.quitAndInstall);
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const error = useUpdateStore((s) => s.error);
  const lastAction = useUpdateStore((s) => s.lastAction);
  const connectionState = usePresenceStore((s) => s.connectionState);

  // Auto-dismiss error after 10 seconds by resetting to idle
  useEffect(() => {
    if (status !== 'error') return;
    const timer = setTimeout(() => {
      useUpdateStore.getState().reset();
    }, 10000);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === 'idle' || status === 'checking' || dismissed) {
    return null;
  }

  if (connectionState === 'disconnected' || connectionState === 'reconnecting') {
    return null;
  }

  if (status === 'available') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="px-4 py-2 text-sm font-medium text-center bg-bg-secondary text-text-primary rounded-lg mx-2 mt-2 motion-safe:animate-[fadeIn_200ms_ease-in] motion-reduce:animate-none flex items-center justify-center gap-3"
      >
        <span>A new version (v{version}) is available.</span>
        <button
          onClick={downloadUpdate}
          className="px-3 py-1 rounded bg-accent-primary text-text-primary text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          Download
        </button>
        <button
          onClick={dismissAction}
          className="px-3 py-1 rounded bg-bg-tertiary text-text-secondary text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          Later
        </button>
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="px-4 py-2 text-sm font-medium text-center bg-bg-secondary text-text-primary rounded-lg mx-2 mt-2"
      >
        Downloading update... {downloadProgress}%
      </div>
    );
  }

  if (status === 'downloaded') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="px-4 py-2 text-sm font-medium text-center bg-bg-secondary text-text-primary rounded-lg mx-2 mt-2 motion-safe:animate-[fadeIn_200ms_ease-in] motion-reduce:animate-none flex items-center justify-center gap-3"
      >
        <span>Update ready! It will be installed when you restart.</span>
        <button
          onClick={quitAndInstall}
          className="px-3 py-1 rounded bg-accent-primary text-text-primary text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          Restart Now
        </button>
      </div>
    );
  }

  if (status === 'error') {
    const isDownloadError = lastAction === 'download';
    return (
      <div
        role="status"
        aria-live="polite"
        className="px-4 py-2 text-sm font-medium text-center bg-bg-secondary text-[#f23f43] rounded-lg mx-2 mt-2 motion-safe:animate-[fadeIn_200ms_ease-in] motion-reduce:animate-none flex items-center justify-center gap-3"
      >
        <span>{isDownloadError ? 'Update download failed.' : 'Update check failed.'}</span>
        <button
          onClick={isDownloadError ? downloadUpdate : checkForUpdates}
          className="px-3 py-1 rounded bg-bg-tertiary text-text-secondary text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
}
