import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Mock window.api for non-Electron test environment
beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    onDeepLink: vi.fn(() => vi.fn()),
    updater: {
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
      onUpdateAvailable: vi.fn(() => vi.fn()),
      onUpdateNotAvailable: vi.fn(() => vi.fn()),
      onUpdateDownloaded: vi.fn(() => vi.fn()),
      onDownloadProgress: vi.fn(() => vi.fn()),
      onUpdateError: vi.fn(() => vi.fn()),
    },
  };
});

describe('App', () => {
  it('should render the login page when not authenticated', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    });
    expect(screen.getByText('Log In')).toBeInTheDocument();
  });
});
