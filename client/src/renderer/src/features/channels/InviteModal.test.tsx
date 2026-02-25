import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteModal } from './InviteModal';

const mockFetchInvites = vi.fn();
const mockGenerateInvite = vi.fn();
const mockRevokeInvite = vi.fn();

vi.mock('../../stores/useInviteStore', () => ({
  useInviteStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(mockStoreState),
}));

let mockStoreState: Record<string, unknown>;

describe('InviteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      invites: [],
      isLoading: false,
      error: null,
      fetchInvites: mockFetchInvites,
      generateInvite: mockGenerateInvite,
      revokeInvite: mockRevokeInvite,
    };
  });

  it('renders modal with title when open', () => {
    render(<InviteModal open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Invite People')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<InviteModal open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText('Invite People')).not.toBeInTheDocument();
  });

  it('calls fetchInvites on open', () => {
    render(<InviteModal open={true} onOpenChange={() => {}} />);
    expect(mockFetchInvites).toHaveBeenCalledOnce();
  });

  it('shows empty state when no invites', () => {
    render(<InviteModal open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('No active invites. Generate one above.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockStoreState.isLoading = true;
    render(<InviteModal open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error message', () => {
    mockStoreState.error = 'Something went wrong';
    render(<InviteModal open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays invite list with token and date', () => {
    mockStoreState.invites = [
      { id: '1', token: 'abc123', createdBy: 'u1', revoked: false, createdAt: '2026-01-15T00:00:00Z' },
      { id: '2', token: 'def456', createdBy: 'u1', revoked: false, createdAt: '2026-01-16T00:00:00Z' },
    ];
    render(<InviteModal open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getByText('def456')).toBeInTheDocument();
  });

  it('generates invite and copies to clipboard on generate click', async () => {
    const user = userEvent.setup();
    const clipSpy = vi.spyOn(navigator.clipboard, 'writeText');
    mockGenerateInvite.mockResolvedValueOnce({
      id: 'new-id',
      token: 'new-token',
      createdBy: 'u1',
      revoked: false,
      createdAt: '2026-01-20T00:00:00Z',
    });

    render(<InviteModal open={true} onOpenChange={() => {}} />);
    await user.click(screen.getByText('Generate Invite Link'));

    expect(mockGenerateInvite).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(clipSpy).toHaveBeenCalledWith(
        expect.stringContaining('/invite/new-token'),
      );
    });
  });

  it('copies invite link on copy button click', async () => {
    const user = userEvent.setup();
    const clipSpy = vi.spyOn(navigator.clipboard, 'writeText');
    mockStoreState.invites = [
      { id: '1', token: 'abc123', createdBy: 'u1', revoked: false, createdAt: '2026-01-15T00:00:00Z' },
    ];

    render(<InviteModal open={true} onOpenChange={() => {}} />);
    const copyButton = screen.getByTitle('Copy invite link');
    await user.click(copyButton);

    await waitFor(() => {
      expect(clipSpy).toHaveBeenCalledWith(
        expect.stringContaining('/invite/abc123'),
      );
    });
  });

  it('shows Copied! feedback after generating invite', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    mockGenerateInvite.mockResolvedValueOnce({
      id: 'new-id',
      token: 'new-token',
      createdBy: 'u1',
      revoked: false,
      createdAt: '2026-01-20T00:00:00Z',
    });

    render(<InviteModal open={true} onOpenChange={() => {}} />);
    await user.click(screen.getByText('Generate Invite Link'));

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('calls revokeInvite on revoke button click', async () => {
    const user = userEvent.setup();
    mockStoreState.invites = [
      { id: '1', token: 'abc123', createdBy: 'u1', revoked: false, createdAt: '2026-01-15T00:00:00Z' },
    ];

    render(<InviteModal open={true} onOpenChange={() => {}} />);
    const revokeButton = screen.getByTitle('Revoke invite');
    await user.click(revokeButton);

    expect(mockRevokeInvite).toHaveBeenCalledWith('1');
  });
});
