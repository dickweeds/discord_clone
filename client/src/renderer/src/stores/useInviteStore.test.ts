import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInviteStore } from './useInviteStore';

vi.mock('../services/apiClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '../services/apiClient';

const mockApiRequest = vi.mocked(apiRequest);

describe('useInviteStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInviteStore.setState({
      invites: [],
      isLoading: false,
      error: null,
    });
  });

  describe('fetchInvites', () => {
    it('fetches and stores only non-revoked invites', async () => {
      mockApiRequest.mockResolvedValueOnce([
        { id: '1', token: 'abc', createdBy: 'u1', revoked: false, createdAt: '2026-01-01T00:00:00Z' },
        { id: '2', token: 'def', createdBy: 'u1', revoked: true, createdAt: '2026-01-02T00:00:00Z' },
        { id: '3', token: 'ghi', createdBy: 'u1', revoked: false, createdAt: '2026-01-03T00:00:00Z' },
      ]);

      await useInviteStore.getState().fetchInvites();

      const state = useInviteStore.getState();
      expect(state.invites).toHaveLength(2);
      expect(state.invites.map((i) => i.id)).toEqual(['1', '3']);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets isLoading during fetch', async () => {
      let resolvePromise: (value: unknown) => void;
      mockApiRequest.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      const fetchPromise = useInviteStore.getState().fetchInvites();
      expect(useInviteStore.getState().isLoading).toBe(true);

      resolvePromise!([]);
      await fetchPromise;

      expect(useInviteStore.getState().isLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      mockApiRequest.mockRejectedValueOnce(new Error('Network error'));

      await useInviteStore.getState().fetchInvites();

      const state = useInviteStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('generateInvite', () => {
    it('creates invite and prepends to list', async () => {
      useInviteStore.setState({
        invites: [{ id: '1', token: 'old', createdBy: 'u1', revoked: false, createdAt: '2026-01-01T00:00:00Z' }],
      });

      mockApiRequest.mockResolvedValueOnce({
        id: '2',
        token: 'new-token',
        createdBy: 'u1',
        revoked: false,
        createdAt: '2026-01-02T00:00:00Z',
      });

      const result = await useInviteStore.getState().generateInvite();

      expect(result.token).toBe('new-token');
      const state = useInviteStore.getState();
      expect(state.invites).toHaveLength(2);
      expect(state.invites[0].id).toBe('2');
      expect(state.invites[0].revoked).toBe(false);
    });

    it('returns null and sets error on failure', async () => {
      mockApiRequest.mockRejectedValueOnce(new Error('Server error'));

      const result = await useInviteStore.getState().generateInvite();
      expect(result).toBeNull();
      expect(useInviteStore.getState().error).toBe('Server error');
    });
  });

  describe('revokeInvite', () => {
    it('removes invite from list on success', async () => {
      useInviteStore.setState({
        invites: [
          { id: '1', token: 'abc', createdBy: 'u1', revoked: false, createdAt: '2026-01-01T00:00:00Z' },
          { id: '2', token: 'def', createdBy: 'u1', revoked: false, createdAt: '2026-01-02T00:00:00Z' },
        ],
      });

      mockApiRequest.mockResolvedValueOnce(undefined);

      await useInviteStore.getState().revokeInvite('1');

      const state = useInviteStore.getState();
      expect(state.invites).toHaveLength(1);
      expect(state.invites[0].id).toBe('2');
    });

    it('sets error on failure', async () => {
      useInviteStore.setState({
        invites: [{ id: '1', token: 'abc', createdBy: 'u1', revoked: false, createdAt: '2026-01-01T00:00:00Z' }],
      });

      mockApiRequest.mockRejectedValueOnce(new Error('Not found'));

      await useInviteStore.getState().revokeInvite('1');

      expect(useInviteStore.getState().error).toBe('Not found');
    });
  });

  describe('clearError', () => {
    it('resets error to null', () => {
      useInviteStore.setState({ error: 'Some error' });

      useInviteStore.getState().clearError();

      expect(useInviteStore.getState().error).toBeNull();
    });
  });
});
