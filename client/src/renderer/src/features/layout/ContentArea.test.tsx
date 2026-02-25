import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useChannelStore } from '../../stores/useChannelStore';
import { useUIStore } from '../../stores/useUIStore';
import { ContentArea } from './ContentArea';

beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
});

beforeEach(() => {
  useChannelStore.setState({
    channels: [
      { id: 'ch-1', name: 'general', type: 'text', createdAt: '2024-01-01' },
      { id: 'ch-2', name: 'help', type: 'text', createdAt: '2024-01-01' },
    ],
    activeChannelId: null,
    isLoading: false,
    error: null,
  });
  useUIStore.setState({ isMemberListVisible: true });
});

function renderContentArea(channelId?: string) {
  const initialEntry = channelId ? `/app/channels/${channelId}` : '/app/channels';
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/app/channels/:channelId" element={<ContentArea />} />
        <Route path="/app/channels" element={<ContentArea />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ContentArea', () => {
  it('shows "Select a channel" when no channel is selected', () => {
    renderContentArea();
    expect(screen.getByText('Select a channel')).toBeInTheDocument();
  });

  it('shows welcome message for selected channel', () => {
    renderContentArea('ch-1');
    expect(screen.getByText('Welcome to #general')).toBeInTheDocument();
    expect(screen.getByText('This is the start of the #general channel.')).toBeInTheDocument();
  });

  it('shows channel name in header', () => {
    renderContentArea('ch-1');
    expect(screen.getByText('general')).toBeInTheDocument();
  });

  it('syncs channelId param to store activeChannelId', () => {
    renderContentArea('ch-1');
    expect(useChannelStore.getState().activeChannelId).toBe('ch-1');
  });

  it('renders toggle member list button with aria-label', () => {
    renderContentArea('ch-1');
    expect(screen.getByLabelText('Toggle member list')).toBeInTheDocument();
  });

  it('toggles member list visibility when button is clicked', async () => {
    renderContentArea('ch-1');
    const user = userEvent.setup();
    expect(useUIStore.getState().isMemberListVisible).toBe(true);

    await user.click(screen.getByLabelText('Toggle member list'));
    expect(useUIStore.getState().isMemberListVisible).toBe(false);
  });

  it('shows "Select a channel" when channelId does not match any channel', () => {
    renderContentArea('nonexistent');
    expect(screen.getByText('Select a channel')).toBeInTheDocument();
  });
});
