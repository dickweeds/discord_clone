import { describe, it, expect } from 'vitest';
import { groupMessages } from './groupMessages';
import type { DecryptedMessage } from '../stores/useMessageStore';

function makeMsg(overrides: Partial<DecryptedMessage> & { id: string; authorId: string; createdAt: string }): DecryptedMessage {
  return {
    channelId: 'ch-1',
    content: `Message ${overrides.id}`,
    status: 'sent',
    ...overrides,
  };
}

describe('groupMessages', () => {
  it('returns empty array for empty input', () => {
    expect(groupMessages([])).toEqual([]);
  });

  it('single message produces single group', () => {
    const msgs = [makeMsg({ id: '1', authorId: 'a', createdAt: '2024-01-01T12:00:00Z' })];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].authorId).toBe('a');
    expect(groups[0].messages).toHaveLength(1);
    expect(groups[0].firstTimestamp).toBe('2024-01-01T12:00:00Z');
  });

  it('consecutive messages from same author within 5 min are grouped together', () => {
    const msgs = [
      makeMsg({ id: '1', authorId: 'a', createdAt: '2024-01-01T12:00:00Z' }),
      makeMsg({ id: '2', authorId: 'a', createdAt: '2024-01-01T12:02:00Z' }),
      makeMsg({ id: '3', authorId: 'a', createdAt: '2024-01-01T12:04:00Z' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toHaveLength(3);
  });

  it('messages from different authors create separate groups', () => {
    const msgs = [
      makeMsg({ id: '1', authorId: 'a', createdAt: '2024-01-01T12:00:00Z' }),
      makeMsg({ id: '2', authorId: 'b', createdAt: '2024-01-01T12:01:00Z' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(2);
    expect(groups[0].authorId).toBe('a');
    expect(groups[1].authorId).toBe('b');
  });

  it('messages from same author >5 min apart create separate groups', () => {
    const msgs = [
      makeMsg({ id: '1', authorId: 'a', createdAt: '2024-01-01T12:00:00Z' }),
      makeMsg({ id: '2', authorId: 'a', createdAt: '2024-01-01T12:06:00Z' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages).toHaveLength(1);
    expect(groups[1].messages).toHaveLength(1);
  });

  it('messages at exactly 5 min boundary are still grouped', () => {
    const msgs = [
      makeMsg({ id: '1', authorId: 'a', createdAt: '2024-01-01T12:00:00Z' }),
      makeMsg({ id: '2', authorId: 'a', createdAt: '2024-01-01T12:05:00Z' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toHaveLength(2);
  });

  it('mixed scenario with multiple authors and time gaps', () => {
    const msgs = [
      makeMsg({ id: '1', authorId: 'a', createdAt: '2024-01-01T12:00:00Z' }),
      makeMsg({ id: '2', authorId: 'a', createdAt: '2024-01-01T12:02:00Z' }),
      makeMsg({ id: '3', authorId: 'b', createdAt: '2024-01-01T12:03:00Z' }),
      makeMsg({ id: '4', authorId: 'b', createdAt: '2024-01-01T12:04:00Z' }),
      makeMsg({ id: '5', authorId: 'a', createdAt: '2024-01-01T12:05:00Z' }),
      makeMsg({ id: '6', authorId: 'a', createdAt: '2024-01-01T12:15:00Z' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(4);
    expect(groups[0].authorId).toBe('a');
    expect(groups[0].messages).toHaveLength(2);
    expect(groups[1].authorId).toBe('b');
    expect(groups[1].messages).toHaveLength(2);
    expect(groups[2].authorId).toBe('a');
    expect(groups[2].messages).toHaveLength(1);
    expect(groups[3].authorId).toBe('a');
    expect(groups[3].messages).toHaveLength(1);
  });
});
