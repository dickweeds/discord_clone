import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SoundboardUploadDialog } from './SoundboardUploadDialog';
import { useSoundboardStore } from '../../stores/useSoundboardStore';

beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof window.api;
});

const mockUploadSound = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  useSoundboardStore.setState({
    uploadSound: mockUploadSound,
  });
});

describe('SoundboardUploadDialog', () => {
  it('renders dialog with "Upload Sound" title', () => {
    render(<SoundboardUploadDialog onClose={vi.fn()} />);

    expect(screen.getByText('Upload Sound')).toBeInTheDocument();
  });

  it('shows file format and size info text', () => {
    render(<SoundboardUploadDialog onClose={vi.fn()} />);

    expect(screen.getByText(/MP3, WAV, OGG, FLAC, AAC, WEBM/)).toBeInTheDocument();
    expect(screen.getByText(/20MB/)).toBeInTheDocument();
    expect(screen.getByText(/20s/)).toBeInTheDocument();
  });

  it('cancel button is rendered', () => {
    render(<SoundboardUploadDialog onClose={vi.fn()} />);

    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('submit button is disabled without a file selected', () => {
    render(<SoundboardUploadDialog onClose={vi.fn()} />);

    const submitButton = screen.getByRole('button', { name: /upload$/i });
    expect(submitButton).toBeDisabled();
  });

  it('onClose is called when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<SoundboardUploadDialog onClose={onClose} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalled();
  });
});
