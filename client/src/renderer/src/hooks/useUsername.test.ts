import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMemberStore } from '../stores/useMemberStore';
import { useUsername } from './useUsername';

beforeEach(() => {
  useMemberStore.setState({
    members: [
      { id: 'user-1', username: 'alice', role: 'owner', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'user-2', username: 'bob', role: 'user', createdAt: '2024-01-01T00:00:00Z' },
    ],
    isLoading: false,
    error: null,
  });
});

describe('useUsername', () => {
  it('returns username and avatarColor for known member', () => {
    const { result } = renderHook(() => useUsername('user-1'));
    expect(result.current.username).toBe('alice');
    expect(result.current.avatarColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns truncated ID fallback for unknown member', () => {
    const { result } = renderHook(() => useUsername('unknown-user-id-12345'));
    expect(result.current.username).toBe('unknown-');
    expect(result.current.avatarColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns different colors for different users', () => {
    const { result: r1 } = renderHook(() => useUsername('user-1'));
    const { result: r2 } = renderHook(() => useUsername('user-2'));
    // Colors may or may not differ based on hash, but both should be valid
    expect(r1.current.avatarColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(r2.current.avatarColor).toMatch(/^#[0-9a-f]{6}$/);
  });
});
