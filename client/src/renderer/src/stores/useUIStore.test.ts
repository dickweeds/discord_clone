import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './useUIStore';

beforeEach(() => {
  useUIStore.setState({ isMemberListVisible: true });
});

describe('useUIStore', () => {
  it('should default to member list visible', () => {
    expect(useUIStore.getState().isMemberListVisible).toBe(true);
  });

  it('should toggle member list visibility', () => {
    useUIStore.getState().toggleMemberList();
    expect(useUIStore.getState().isMemberListVisible).toBe(false);

    useUIStore.getState().toggleMemberList();
    expect(useUIStore.getState().isMemberListVisible).toBe(true);
  });

  it('should set member list visibility directly', () => {
    useUIStore.getState().setMemberListVisible(false);
    expect(useUIStore.getState().isMemberListVisible).toBe(false);

    useUIStore.getState().setMemberListVisible(true);
    expect(useUIStore.getState().isMemberListVisible).toBe(true);
  });
});
