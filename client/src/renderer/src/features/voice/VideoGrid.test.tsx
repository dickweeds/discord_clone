import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoGrid } from './VideoGrid';
import { useVoiceStore } from '../../stores/useVoiceStore';
import useAuthStore from '../../stores/useAuthStore';
import { useMemberStore } from '../../stores/useMemberStore';

vi.mock('../../services/mediaService', () => ({
  getLocalVideoStream: vi.fn(),
  getVideoStreamByPeerId: vi.fn(),
}));

import * as mediaService from '../../services/mediaService';

const mockGetLocalVideoStream = mediaService.getLocalVideoStream as ReturnType<typeof vi.fn>;
const mockGetVideoStreamByPeerId = mediaService.getVideoStreamByPeerId as ReturnType<typeof vi.fn>;

function makeMockStream(id = 'stream'): MediaStream {
  return { id } as unknown as MediaStream;
}

beforeEach(() => {
  vi.clearAllMocks();
  useVoiceStore.setState({
    currentChannelId: 'voice-1',
    videoParticipants: new Set(),
    speakingUsers: new Set(),
  });
  useAuthStore.setState({
    user: { id: 'local-user', username: 'Me', role: 'member' },
  });
  useMemberStore.setState({
    members: [
      { id: 'local-user', username: 'Me', role: 'member' },
      { id: 'remote-1', username: 'Alice', role: 'member' },
      { id: 'remote-2', username: 'Bob', role: 'member' },
    ],
  });
  mockGetLocalVideoStream.mockReturnValue(null);
  mockGetVideoStreamByPeerId.mockReturnValue(null);
});

describe('VideoGrid', () => {
  it('renders nothing when videoParticipants is empty', () => {
    const { container } = render(<VideoGrid />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when currentChannelId is null', () => {
    mockGetLocalVideoStream.mockReturnValue(makeMockStream('local'));
    useVoiceStore.setState({
      currentChannelId: null,
      videoParticipants: new Set(['local-user']),
    });

    const { container } = render(<VideoGrid />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one tile for single participant (grid-cols-1)', () => {
    mockGetLocalVideoStream.mockReturnValue(makeMockStream('local'));
    useVoiceStore.setState({ videoParticipants: new Set(['local-user']) });

    const { container } = render(<VideoGrid />);

    expect(screen.getByText('Me')).toBeInTheDocument();
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid-cols-1');
  });

  it('renders tiles for multiple participants with adaptive grid', () => {
    mockGetLocalVideoStream.mockReturnValue(makeMockStream('local'));
    mockGetVideoStreamByPeerId.mockImplementation((peerId: string) => {
      if (peerId === 'remote-1') return makeMockStream('r1');
      if (peerId === 'remote-2') return makeMockStream('r2');
      return null;
    });
    useVoiceStore.setState({
      videoParticipants: new Set(['local-user', 'remote-1', 'remote-2']),
    });

    const { container } = render(<VideoGrid />);

    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid-cols-2');
  });

  it('includes local user tile when local user has video enabled', () => {
    mockGetLocalVideoStream.mockReturnValue(makeMockStream('local'));
    useVoiceStore.setState({ videoParticipants: new Set(['local-user']) });

    render(<VideoGrid />);

    expect(screen.getByText('Me')).toBeInTheDocument();
  });

  it('excludes audio-only participants not in videoParticipants', () => {
    mockGetLocalVideoStream.mockReturnValue(makeMockStream('local'));
    useVoiceStore.setState({
      videoParticipants: new Set(['local-user']),
    });

    render(<VideoGrid />);

    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('dynamically adds tile when new participant enables video', () => {
    mockGetLocalVideoStream.mockReturnValue(makeMockStream('local'));
    useVoiceStore.setState({ videoParticipants: new Set(['local-user']) });

    const { rerender } = render(<VideoGrid />);

    expect(screen.queryByText('Alice')).not.toBeInTheDocument();

    mockGetVideoStreamByPeerId.mockImplementation((peerId: string) =>
      peerId === 'remote-1' ? makeMockStream('r1') : null,
    );
    useVoiceStore.setState({ videoParticipants: new Set(['local-user', 'remote-1']) });

    rerender(<VideoGrid />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('dynamically removes tile when participant disables video', () => {
    mockGetLocalVideoStream.mockReturnValue(makeMockStream('local'));
    mockGetVideoStreamByPeerId.mockImplementation((peerId: string) =>
      peerId === 'remote-1' ? makeMockStream('r1') : null,
    );
    useVoiceStore.setState({ videoParticipants: new Set(['local-user', 'remote-1']) });

    const { rerender } = render(<VideoGrid />);

    expect(screen.getByText('Alice')).toBeInTheDocument();

    useVoiceStore.setState({ videoParticipants: new Set(['local-user']) });

    rerender(<VideoGrid />);

    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it.each([
    { count: 1, expected: 'grid-cols-1' },
    { count: 4, expected: 'grid-cols-2' },
    { count: 5, expected: 'grid-cols-3' },
    { count: 9, expected: 'grid-cols-3' },
    { count: 10, expected: 'grid-cols-4' },
    { count: 16, expected: 'grid-cols-4' },
    { count: 17, expected: 'grid-cols-5' },
  ])('renders $expected for $count participants', ({ count, expected }) => {
    const participants = new Set<string>();
    const memberList: Array<{ id: string; username: string; role: string }> = [];

    for (let i = 0; i < count; i++) {
      const id = i === 0 ? 'local-user' : `remote-${i}`;
      participants.add(id);
      memberList.push({ id, username: `User${i}`, role: 'member' });
    }

    useMemberStore.setState({ members: memberList });
    mockGetLocalVideoStream.mockReturnValue(makeMockStream('local'));
    mockGetVideoStreamByPeerId.mockImplementation((peerId: string) =>
      participants.has(peerId) ? makeMockStream(peerId) : null,
    );
    useVoiceStore.setState({ videoParticipants: participants });

    const { container } = render(<VideoGrid />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain(expected);
  });

  it('passes correct speaking state to each tile', () => {
    mockGetLocalVideoStream.mockReturnValue(makeMockStream('local'));
    mockGetVideoStreamByPeerId.mockImplementation((peerId: string) =>
      peerId === 'remote-1' ? makeMockStream('r1') : null,
    );
    useVoiceStore.setState({
      videoParticipants: new Set(['local-user', 'remote-1']),
      speakingUsers: new Set(['remote-1']),
    });

    const { container } = render(<VideoGrid />);

    // The tile for remote-1 (Alice) should have the speaking ring
    const tiles = container.querySelectorAll('.aspect-video');
    const speakingTile = Array.from(tiles).find((t) => t.className.includes('ring-[#23a55a]'));
    expect(speakingTile).toBeTruthy();
  });
});
