import { beforeEach, describe, expect, it } from 'vitest';
import useUIStore from './useUIStore';

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({ isMemberListVisible: true });
  });

  it('toggleMemberList toggles visibility', () => {
    useUIStore.getState().toggleMemberList();
    expect(useUIStore.getState().isMemberListVisible).toBe(false);

    useUIStore.getState().toggleMemberList();
    expect(useUIStore.getState().isMemberListVisible).toBe(true);
  });

  it('setMemberListVisible sets explicit value', () => {
    useUIStore.getState().setMemberListVisible(false);
    expect(useUIStore.getState().isMemberListVisible).toBe(false);
  });
});
