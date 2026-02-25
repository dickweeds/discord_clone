import { beforeEach, describe, expect, it, vi } from 'vitest';
import useChannelStore from './useChannelStore';
import { apiRequest } from '../services/apiClient';

vi.mock('../services/apiClient', () => ({
  apiRequest: vi.fn(),
}));

describe('useChannelStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChannelStore.setState({
      channels: [],
      activeChannelId: null,
      isLoading: false,
      error: null,
    });
  });

  it('fetchChannels populates channels and default active channel', async () => {
    vi.mocked(apiRequest).mockResolvedValue([
      { id: '2', serverId: 'default', name: 'voice room', type: 'voice', position: 0, createdAt: '', updatedAt: '' },
      { id: '1', serverId: 'default', name: 'general', type: 'text', position: 0, createdAt: '', updatedAt: '' },
    ]);

    await useChannelStore.getState().fetchChannels();

    const state = useChannelStore.getState();
    expect(state.channels.map((c) => c.id)).toEqual(['1', '2']);
    expect(state.activeChannelId).toBe('1');
    expect(state.error).toBeNull();
  });

  it('setActiveChannel updates activeChannelId', () => {
    useChannelStore.getState().setActiveChannel('abc');
    expect(useChannelStore.getState().activeChannelId).toBe('abc');
  });

  it('fetchChannels stores error on failure', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('network down'));

    await useChannelStore.getState().fetchChannels();

    expect(useChannelStore.getState().error).toBe('network down');
    expect(useChannelStore.getState().isLoading).toBe(false);
  });
});
