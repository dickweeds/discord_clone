import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUpdateStore } from './useUpdateStore';

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

beforeEach(() => {
  useUpdateStore.setState({
    status: 'idle',
    version: null,
    downloadProgress: 0,
    error: null,
    dismissed: false,
    lastAction: null,
  });
  vi.clearAllMocks();
  // @ts-expect-error mock window.api.updater
  window.api = { updater: mockUpdater };
});

describe('useUpdateStore', () => {
  it('should have correct initial state', () => {
    const state = useUpdateStore.getState();
    expect(state.status).toBe('idle');
    expect(state.version).toBeNull();
    expect(state.downloadProgress).toBe(0);
    expect(state.error).toBeNull();
    expect(state.dismissed).toBe(false);
    expect(state.lastAction).toBeNull();
  });

  it('should set status to checking when checkForUpdates is called', () => {
    useUpdateStore.getState().checkForUpdates();
    expect(useUpdateStore.getState().status).toBe('checking');
    expect(useUpdateStore.getState().lastAction).toBe('check');
    expect(mockUpdater.checkForUpdates).toHaveBeenCalled();
  });

  it('should set status to available with version info via onUpdateAvailable', () => {
    const cleanup = useUpdateStore.getState().initUpdateListeners();
    const onAvailableCallback = mockUpdater.onUpdateAvailable.mock.calls[0][0];

    onAvailableCallback({ version: '2.0.0', releaseNotes: 'New stuff' });

    expect(useUpdateStore.getState().status).toBe('available');
    expect(useUpdateStore.getState().version).toBe('2.0.0');
    cleanup();
  });

  it('should set status to idle via onUpdateNotAvailable', () => {
    useUpdateStore.setState({ status: 'checking' });
    const cleanup = useUpdateStore.getState().initUpdateListeners();
    const onNotAvailableCallback = mockUpdater.onUpdateNotAvailable.mock.calls[0][0];

    onNotAvailableCallback();

    expect(useUpdateStore.getState().status).toBe('idle');
    cleanup();
  });

  it('should set status to downloading when downloadUpdate is called', () => {
    useUpdateStore.getState().downloadUpdate();
    expect(useUpdateStore.getState().status).toBe('downloading');
    expect(useUpdateStore.getState().downloadProgress).toBe(0);
    expect(useUpdateStore.getState().lastAction).toBe('download');
    expect(mockUpdater.downloadUpdate).toHaveBeenCalled();
  });

  it('should update downloadProgress via onDownloadProgress', () => {
    const cleanup = useUpdateStore.getState().initUpdateListeners();
    const onProgressCallback = mockUpdater.onDownloadProgress.mock.calls[0][0];

    onProgressCallback({ percent: 55.7, bytesPerSecond: 1000, transferred: 500, total: 1000 });

    expect(useUpdateStore.getState().downloadProgress).toBe(56);
    cleanup();
  });

  it('should set status to downloaded via onUpdateDownloaded', () => {
    const cleanup = useUpdateStore.getState().initUpdateListeners();
    const onDownloadedCallback = mockUpdater.onUpdateDownloaded.mock.calls[0][0];

    onDownloadedCallback();

    expect(useUpdateStore.getState().status).toBe('downloaded');
    cleanup();
  });

  it('should set status to error with message via onUpdateError', () => {
    const cleanup = useUpdateStore.getState().initUpdateListeners();
    const onErrorCallback = mockUpdater.onUpdateError.mock.calls[0][0];

    onErrorCallback({ message: 'Network failed' });

    expect(useUpdateStore.getState().status).toBe('error');
    expect(useUpdateStore.getState().error).toBe('Network failed');
    cleanup();
  });

  it('should set dismissed to true when dismiss is called', () => {
    useUpdateStore.getState().dismiss();
    expect(useUpdateStore.getState().dismissed).toBe(true);
  });

  it('should reset all state when reset is called', () => {
    useUpdateStore.setState({
      status: 'error',
      version: '1.0.0',
      downloadProgress: 50,
      error: 'fail',
      dismissed: true,
      lastAction: 'download',
    });

    useUpdateStore.getState().reset();

    const state = useUpdateStore.getState();
    expect(state.status).toBe('idle');
    expect(state.version).toBeNull();
    expect(state.downloadProgress).toBe(0);
    expect(state.error).toBeNull();
    expect(state.dismissed).toBe(false);
    expect(state.lastAction).toBeNull();
  });

  it('should return cleanup function from initUpdateListeners', () => {
    const cleanupAvailable = vi.fn();
    const cleanupNotAvailable = vi.fn();
    const cleanupDownloaded = vi.fn();
    const cleanupProgress = vi.fn();
    const cleanupError = vi.fn();
    mockUpdater.onUpdateAvailable.mockReturnValue(cleanupAvailable);
    mockUpdater.onUpdateNotAvailable.mockReturnValue(cleanupNotAvailable);
    mockUpdater.onUpdateDownloaded.mockReturnValue(cleanupDownloaded);
    mockUpdater.onDownloadProgress.mockReturnValue(cleanupProgress);
    mockUpdater.onUpdateError.mockReturnValue(cleanupError);

    const cleanup = useUpdateStore.getState().initUpdateListeners();
    cleanup();

    expect(cleanupAvailable).toHaveBeenCalled();
    expect(cleanupNotAvailable).toHaveBeenCalled();
    expect(cleanupDownloaded).toHaveBeenCalled();
    expect(cleanupProgress).toHaveBeenCalled();
    expect(cleanupError).toHaveBeenCalled();
  });
});
