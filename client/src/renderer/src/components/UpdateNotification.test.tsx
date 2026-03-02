import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useUpdateStore } from '../stores/useUpdateStore';
import { usePresenceStore } from '../stores/usePresenceStore';
import { UpdateNotification } from './UpdateNotification';

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
  });
  usePresenceStore.setState({ connectionState: 'connected' });
  vi.clearAllMocks();
  vi.useFakeTimers();
  // @ts-expect-error mock window.api.updater
  window.api = { updater: mockUpdater };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UpdateNotification', () => {
  it('should render nothing when status is idle', () => {
    const { container } = render(<UpdateNotification />);
    expect(container.innerHTML).toBe('');
  });

  it('should render nothing when status is checking', () => {
    useUpdateStore.setState({ status: 'checking' });
    const { container } = render(<UpdateNotification />);
    expect(container.innerHTML).toBe('');
  });

  it('should render nothing when dismissed is true', () => {
    useUpdateStore.setState({ status: 'available', version: '2.0.0', dismissed: true });
    const { container } = render(<UpdateNotification />);
    expect(container.innerHTML).toBe('');
  });

  it('should render available banner with version and buttons', () => {
    useUpdateStore.setState({ status: 'available', version: '2.0.0' });
    render(<UpdateNotification />);
    expect(screen.getByText(/A new version \(v2\.0\.0\) is available\./)).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
  });

  it('should call downloadUpdate when Download is clicked', () => {
    useUpdateStore.setState({ status: 'available', version: '2.0.0' });
    render(<UpdateNotification />);
    fireEvent.click(screen.getByText('Download'));
    expect(useUpdateStore.getState().status).toBe('downloading');
    expect(mockUpdater.downloadUpdate).toHaveBeenCalled();
  });

  it('should call dismiss when Later is clicked', () => {
    useUpdateStore.setState({ status: 'available', version: '2.0.0' });
    render(<UpdateNotification />);
    fireEvent.click(screen.getByText('Later'));
    expect(useUpdateStore.getState().dismissed).toBe(true);
  });

  it('should render downloading banner with progress', () => {
    useUpdateStore.setState({ status: 'downloading', downloadProgress: 42 });
    render(<UpdateNotification />);
    expect(screen.getByText('Downloading update... 42%')).toBeInTheDocument();
  });

  it('should render downloaded banner with Restart Now button', () => {
    useUpdateStore.setState({ status: 'downloaded' });
    render(<UpdateNotification />);
    expect(screen.getByText(/Update ready!/)).toBeInTheDocument();
    expect(screen.getByText('Restart Now')).toBeInTheDocument();
  });

  it('should call quitAndInstall when Restart Now is clicked', () => {
    useUpdateStore.setState({ status: 'downloaded' });
    render(<UpdateNotification />);
    fireEvent.click(screen.getByText('Restart Now'));
    expect(mockUpdater.quitAndInstall).toHaveBeenCalled();
  });

  it('should render check error banner with Retry button', () => {
    useUpdateStore.setState({ status: 'error', error: 'Network failed', lastAction: 'check' });
    render(<UpdateNotification />);
    expect(screen.getByText('Update check failed.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should render download error banner with Retry button', () => {
    useUpdateStore.setState({ status: 'error', error: 'Network failed', lastAction: 'download' });
    render(<UpdateNotification />);
    expect(screen.getByText('Update download failed.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should call checkForUpdates when Retry is clicked after check error', () => {
    useUpdateStore.setState({ status: 'error', error: 'Network failed', lastAction: 'check' });
    render(<UpdateNotification />);
    fireEvent.click(screen.getByText('Retry'));
    expect(useUpdateStore.getState().status).toBe('checking');
    expect(mockUpdater.checkForUpdates).toHaveBeenCalled();
  });

  it('should call downloadUpdate when Retry is clicked after download error', () => {
    useUpdateStore.setState({ status: 'error', error: 'Network failed', lastAction: 'download' });
    render(<UpdateNotification />);
    fireEvent.click(screen.getByText('Retry'));
    expect(useUpdateStore.getState().status).toBe('downloading');
    expect(mockUpdater.downloadUpdate).toHaveBeenCalled();
  });

  it('should auto-dismiss error after 10 seconds by resetting to idle', () => {
    useUpdateStore.setState({ status: 'error', error: 'fail', lastAction: 'check' });
    render(<UpdateNotification />);
    expect(screen.getByText('Update check failed.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    const state = useUpdateStore.getState();
    expect(state.status).toBe('idle');
    expect(state.dismissed).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should render nothing when disconnected', () => {
    useUpdateStore.setState({ status: 'available', version: '2.0.0' });
    usePresenceStore.setState({ connectionState: 'disconnected' });
    const { container } = render(<UpdateNotification />);
    expect(container.innerHTML).toBe('');
  });

  it('should render nothing when reconnecting', () => {
    useUpdateStore.setState({ status: 'available', version: '2.0.0' });
    usePresenceStore.setState({ connectionState: 'reconnecting' });
    const { container } = render(<UpdateNotification />);
    expect(container.innerHTML).toBe('');
  });
});
