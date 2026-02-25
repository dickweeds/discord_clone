import { beforeEach, describe, expect, it, vi } from 'vitest';
import useMemberStore from './useMemberStore';
import { apiRequest } from '../services/apiClient';

vi.mock('../services/apiClient', () => ({
  apiRequest: vi.fn(),
}));

describe('useMemberStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMemberStore.setState({
      members: [],
      isLoading: false,
      error: null,
    });
  });

  it('fetchMembers populates members', async () => {
    vi.mocked(apiRequest).mockResolvedValue([
      { id: '1', username: 'owner', role: 'owner', createdAt: '' },
      { id: '2', username: 'user', role: 'user', createdAt: '' },
    ]);

    await useMemberStore.getState().fetchMembers();

    expect(useMemberStore.getState().members).toHaveLength(2);
    expect(useMemberStore.getState().error).toBeNull();
  });

  it('fetchMembers stores error on failure', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('failed to fetch members'));

    await useMemberStore.getState().fetchMembers();

    expect(useMemberStore.getState().error).toBe('failed to fetch members');
    expect(useMemberStore.getState().isLoading).toBe(false);
  });
});
