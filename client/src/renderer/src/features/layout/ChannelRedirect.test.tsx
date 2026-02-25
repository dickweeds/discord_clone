import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { useChannelStore } from '../../stores/useChannelStore';
import { ChannelRedirect } from './ChannelRedirect';

beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
});

let capturedPathname = '';

function LocationSpy() {
  const location = useLocation();
  capturedPathname = location.pathname;
  return null;
}

beforeEach(() => {
  capturedPathname = '';
  useChannelStore.setState({
    channels: [
      { id: 'ch-1', name: 'general', type: 'text', createdAt: '2024-01-01' },
      { id: 'ch-2', name: 'Gaming', type: 'voice', createdAt: '2024-01-01' },
    ],
    activeChannelId: null,
    isLoading: false,
    error: null,
  });
});

function renderRedirect() {
  return render(
    <MemoryRouter initialEntries={['/app/channels']}>
      <LocationSpy />
      <Routes>
        <Route path="/app/channels" element={<ChannelRedirect />} />
        <Route path="/app/channels/:channelId" element={<div>Channel View</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChannelRedirect', () => {
  it('redirects to first text channel', () => {
    renderRedirect();
    expect(capturedPathname).toBe('/app/channels/ch-1');
  });

  it('renders nothing while loading', () => {
    useChannelStore.setState({ isLoading: true, channels: [] });
    const { container } = renderRedirect();
    expect(container.textContent).toBe('');
  });

  it('shows "No channels available" when no text channels exist', () => {
    useChannelStore.setState({
      channels: [{ id: 'ch-2', name: 'Gaming', type: 'voice', createdAt: '2024-01-01' }],
      isLoading: false,
    });
    renderRedirect();
    expect(screen.getByText('No channels available')).toBeInTheDocument();
  });

  it('shows "No channels available" when channel list is empty', () => {
    useChannelStore.setState({ channels: [], isLoading: false });
    renderRedirect();
    expect(screen.getByText('No channels available')).toBeInTheDocument();
  });
});
