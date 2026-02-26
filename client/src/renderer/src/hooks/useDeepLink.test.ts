import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

import { useDeepLink } from './useDeepLink';

describe('useDeepLink', () => {
  let deepLinkCallback: ((url: string) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    deepLinkCallback = null;

    Object.defineProperty(window, 'api', {
      value: {
        onDeepLink: (cb: (url: string) => void) => {
          deepLinkCallback = cb;
        },
        secureStorage: {
          set: vi.fn(),
          get: vi.fn(),
          delete: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a deep link listener on mount', () => {
    renderHook(() => useDeepLink());
    expect(deepLinkCallback).toBeTypeOf('function');
  });

  it('navigates to /register/:token when receiving a valid invite URL', () => {
    renderHook(() => useDeepLink());
    deepLinkCallback!('discord-clone://invite/abc123');
    expect(mockNavigate).toHaveBeenCalledWith('/register/abc123');
  });

  it('ignores non-invite protocol URLs', () => {
    renderHook(() => useDeepLink());
    deepLinkCallback!('discord-clone://other/path');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ignores invite URL with empty token', () => {
    renderHook(() => useDeepLink());
    deepLinkCallback!('discord-clone://invite/');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not crash when window.api is undefined', () => {
    Object.defineProperty(window, 'api', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => renderHook(() => useDeepLink())).not.toThrow();
  });

  it('does not crash when onDeepLink is not available', () => {
    Object.defineProperty(window, 'api', {
      value: { secureStorage: {} },
      writable: true,
      configurable: true,
    });
    expect(() => renderHook(() => useDeepLink())).not.toThrow();
  });
});
