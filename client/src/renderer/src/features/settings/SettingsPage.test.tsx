import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SettingsPage } from './SettingsPage';
import useAuthStore from '../../stores/useAuthStore';
import { useUpdateStore } from '../../stores/useUpdateStore';

const mockUpdater = {
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  onUpdateAvailable: vi.fn(() => vi.fn()),
  onUpdateNotAvailable: vi.fn(() => vi.fn()),
  onUpdateDownloaded: vi.fn(() => vi.fn()),
  onDownloadProgress: vi.fn(() => vi.fn()),
  onUpdateError: vi.fn(() => vi.fn()),
};

vi.mock('./AudioSettings', () => ({
  AudioSettings: () => <div>Audio Settings</div>,
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthStore.setState({
      user: { id: 'u1', username: 'testuser', role: 'user' },
      accessToken: 'token',
      refreshToken: 'refresh',
      groupKey: null,
      isLoading: false,
      error: null,
      needsSetup: false,
      logout: vi.fn().mockResolvedValue(undefined),
    });

    useUpdateStore.setState({
      status: 'idle',
      version: null,
      downloadProgress: 0,
      error: null,
      dismissed: false,
      lastAction: null,
    });

    // @ts-expect-error test mock
    window.api = {
      secureStorage: {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      updater: mockUpdater,
    };
  });

  function renderSettingsPage() {
    return render(
      <MemoryRouter>
        <SettingsPage onClose={vi.fn()} />
      </MemoryRouter>,
    );
  }

  it('renders update controls and existing settings actions', () => {
    renderSettingsPage();

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('App Updates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for Updates' })).toBeInTheDocument();
    expect(screen.getByLabelText('Close settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeInTheDocument();
  });

  it('checks for updates when button is clicked', () => {
    renderSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));

    expect(useUpdateStore.getState().status).toBe('checking');
    expect(mockUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('shows checking state and disables button while checking', () => {
    useUpdateStore.setState({ status: 'checking' });
    renderSettingsPage();

    const button = screen.getByRole('button', { name: 'Checking...' });
    expect(button).toBeDisabled();
  });

  it('disables check button while downloading', () => {
    useUpdateStore.setState({ status: 'downloading' });
    renderSettingsPage();

    const button = screen.getByRole('button', { name: 'Check for Updates' });
    expect(button).toBeDisabled();
  });
});
