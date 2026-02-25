import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTimestamp } from './formatTimestamp';

describe('formatTimestamp', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today at HH:MM" for a timestamp from today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T14:00:00Z'));

    const result = formatTimestamp('2024-06-15T10:30:00Z');
    expect(result).toMatch(/^Today at \d{1,2}:\d{2}\s?(AM|PM)?$/);
  });

  it('returns "Yesterday at HH:MM" for a timestamp from yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T14:00:00Z'));

    const result = formatTimestamp('2024-06-14T18:00:00Z');
    expect(result).toMatch(/^Yesterday at \d{1,2}:\d{2}\s?(AM|PM)?$/);
  });

  it('returns "MM/DD/YYYY HH:MM" for older timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T14:00:00Z'));

    const result = formatTimestamp('2024-06-10T09:00:00Z');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}\s?(AM|PM)?$/);
  });

  it('returns empty string for invalid date string', () => {
    expect(formatTimestamp('not-a-date')).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(formatTimestamp('')).toBe('');
  });
});
