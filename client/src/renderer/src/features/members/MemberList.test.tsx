import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import useAuthStore from '../../stores/useAuthStore';
import useMemberStore from '../../stores/useMemberStore';
import { MemberList } from './MemberList';

describe('MemberList', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'u1', username: 'owner', role: 'owner' },
      isLoading: false,
    });
  });

  it('groups members into online and offline buckets', () => {
    useMemberStore.setState({
      members: [
        { id: 'u1', username: 'owner', role: 'owner', createdAt: '' },
        { id: 'u2', username: 'member', role: 'user', createdAt: '' },
      ],
      isLoading: false,
      error: null,
    });

    render(<MemberList />);

    expect(screen.getByText('ONLINE - 1')).toBeInTheDocument();
    expect(screen.getByText('OFFLINE - 1')).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();
  });

  it('shows loading skeletons while member list is loading', () => {
    useMemberStore.setState({
      members: [],
      isLoading: true,
      error: null,
    });

    render(<MemberList />);

    expect(screen.getByText('ONLINE - 0')).toBeInTheDocument();
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
