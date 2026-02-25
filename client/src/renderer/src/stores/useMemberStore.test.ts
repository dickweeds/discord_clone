import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/apiClient', () => ({
  apiRequest: vi.fn(),
}));

import { useMemberStore } from './useMemberStore';
import { apiRequest } from '../services/apiClient';

const mockApiRequest = vi.mocked(apiRequest);

beforeEach(() => {
  useMemberStore.setState({
    members: [],
    isLoading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe('useMemberStore', () => {
  it('should have correct initial state', () => {
    const state = useMemberStore.getState();
    expect(state.members).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should fetch members', async () => {
    const mockMembers = [
      { id: '1', username: 'owner', role: 'owner', createdAt: '2024-01-01' },
      { id: '2', username: 'user1', role: 'user', createdAt: '2024-01-02' },
    ];
    mockApiRequest.mockResolvedValueOnce(mockMembers);

    await useMemberStore.getState().fetchMembers();

    const state = useMemberStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.members).toEqual(mockMembers);
  });

  it('should handle fetch error', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('Failed to load'));

    await useMemberStore.getState().fetchMembers();

    const state = useMemberStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Failed to load');
  });

  it('should clear error', () => {
    useMemberStore.setState({ error: 'some error' });
    useMemberStore.getState().clearError();
    expect(useMemberStore.getState().error).toBeNull();
  });
});
