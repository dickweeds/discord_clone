import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoTile } from './VideoTile';

function makeMockStream(): MediaStream {
  return { id: 'mock-stream' } as unknown as MediaStream;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VideoTile', () => {
  it('renders a video element with srcObject from stream prop', () => {
    const stream = makeMockStream();
    const { container } = render(
      <VideoTile userId="u1" stream={stream} isSpeaking={false} username="Alice" isLocal={false} />,
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.srcObject).toBe(stream);
  });

  it('displays username overlay', () => {
    render(
      <VideoTile userId="u1" stream={makeMockStream()} isSpeaking={false} username="Alice" isLocal={false} />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows green ring when isSpeaking is true', () => {
    const { container } = render(
      <VideoTile userId="u1" stream={makeMockStream()} isSpeaking={true} username="Alice" isLocal={false} />,
    );

    const tile = container.firstChild as HTMLElement;
    expect(tile.className).toContain('ring-2');
    expect(tile.className).toContain('ring-[#23a55a]');
  });

  it('does not show green ring when isSpeaking is false', () => {
    const { container } = render(
      <VideoTile userId="u1" stream={makeMockStream()} isSpeaking={false} username="Alice" isLocal={false} />,
    );

    const tile = container.firstChild as HTMLElement;
    expect(tile.className).not.toContain('ring-2');
    expect(tile.className).not.toContain('ring-[#23a55a]');
  });

  it('applies mirror transform for local preview', () => {
    const { container } = render(
      <VideoTile userId="u1" stream={makeMockStream()} isSpeaking={false} username="Alice" isLocal={true} />,
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.className).toContain('scale-x-[-1]');
  });

  it('does not apply mirror transform for remote video', () => {
    const { container } = render(
      <VideoTile userId="u1" stream={makeMockStream()} isSpeaking={false} username="Alice" isLocal={false} />,
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.className).not.toContain('scale-x-[-1]');
  });

  it('has autoPlay, playsInline, and muted attributes', () => {
    const { container } = render(
      <VideoTile userId="u1" stream={makeMockStream()} isSpeaking={false} username="Alice" isLocal={false} />,
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.autoplay).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.muted).toBe(true);
  });
});
