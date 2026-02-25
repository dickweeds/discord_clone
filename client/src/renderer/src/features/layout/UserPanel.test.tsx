import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import useAuthStore from '../../stores/useAuthStore';
import { UserPanel } from './UserPanel';

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
  useAuthStore.setState({
    user: { id: 'u1', username: 'testuser', role: 'user' },
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    groupKey: null,
    isLoading: false,
    error: null,
  });
});

describe('UserPanel', () => {
  it('renders username', () => {
    render(<UserPanel />);
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('renders avatar with first letter uppercase', () => {
    render(<UserPanel />);
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('renders settings button with aria-label', () => {
    render(<UserPanel />);
    expect(screen.getByLabelText('User settings')).toBeInTheDocument();
  });

  it('renders nothing when user is null', () => {
    useAuthStore.setState({ user: null });
    const { container } = render(<UserPanel />);
    expect(container.innerHTML).toBe('');
  });
});
