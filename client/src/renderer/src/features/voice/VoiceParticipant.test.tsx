import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceParticipant } from './VoiceParticipant';
import { useMemberStore } from '../../stores/useMemberStore';

beforeEach(() => {
  useMemberStore.setState({
    members: [
      { id: 'user-1', username: 'Alice', role: 'user', createdAt: '2024-01-01' },
      { id: 'user-2', username: 'Bob', role: 'user', createdAt: '2024-01-01' },
    ],
  });
});

describe('VoiceParticipant', () => {
  it('renders avatar with user initial', () => {
    render(<VoiceParticipant userId="user-1" />);

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders username', () => {
    render(<VoiceParticipant userId="user-1" />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders avatar with colored background', () => {
    render(<VoiceParticipant userId="user-1" />);

    const avatar = screen.getByText('A');
    expect(avatar).toHaveStyle({ backgroundColor: expect.any(String) });
  });

  it('has correct row height (32px = h-8)', () => {
    const { container } = render(<VoiceParticipant userId="user-1" />);
    const row = container.firstChild as HTMLElement;
    expect(row.className).toContain('h-8');
  });

  it('has left indent (pl-6 = 24px)', () => {
    const { container } = render(<VoiceParticipant userId="user-1" />);
    const row = container.firstChild as HTMLElement;
    expect(row.className).toContain('pl-6');
  });

  it('renders "Unknown" for unrecognized userId', () => {
    render(<VoiceParticipant userId="unknown-user" />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('U')).toBeInTheDocument();
  });
});
