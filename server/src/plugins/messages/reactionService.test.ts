import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

import { setupApp, teardownApp, truncateAll, seedRegularUser } from '../../test/helpers.js';
import { channels, messages } from '../../db/schema.js';
import { addReaction, removeReaction, getReactionsForMessages } from './reactionService.js';

describe('reactionService', () => {
  let app: FastifyInstance;
  let channelId: string;
  let userId: string;
  let userId2: string;
  let messageId: string;

  beforeAll(async () => {
    app = await setupApp();
  });

  afterAll(async () => {
    await teardownApp();
  });

  beforeEach(async () => {
    await truncateAll(app.db);
    const [channel] = await app.db.insert(channels).values({ name: 'general', type: 'text' }).returning();
    channelId = channel.id;
    const user = await seedRegularUser(app, 'testuser');
    userId = user.id;
    const user2 = await seedRegularUser(app, 'testuser2');
    userId2 = user2.id;
    const [msg] = await app.db.insert(messages).values({
      channel_id: channelId,
      user_id: userId,
      encrypted_content: 'test-content',
      nonce: 'test-nonce',
    }).returning();
    messageId = msg.id;
  });

  describe('addReaction', () => {
    it('stores a reaction and returns correct shape', async () => {
      const result = await addReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });

      expect(result.id).toBeDefined();
      expect(result.messageId).toBe(messageId);
      expect(result.userId).toBe(userId);
      expect(result.emoji).toBe('\u{1F44D}');
      expect(result.createdAt).toBeDefined();
      expect(() => new Date(result.createdAt)).not.toThrow();
    });

    it('returns existing reaction on duplicate (idempotent)', async () => {
      const first = await addReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });
      const second = await addReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });

      expect(second.id).toBe(first.id);
      expect(second.emoji).toBe(first.emoji);
    });

    it('allows different emojis from same user', async () => {
      const r1 = await addReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });
      const r2 = await addReaction(app.db, { messageId, userId, emoji: '\u2764\uFE0F' });

      expect(r1.id).not.toBe(r2.id);
    });

    it('allows same emoji from different users', async () => {
      const r1 = await addReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });
      const r2 = await addReaction(app.db, { messageId, userId: userId2, emoji: '\u{1F44D}' });

      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('removeReaction', () => {
    it('removes an existing reaction and returns true', async () => {
      await addReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });
      const removed = await removeReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });

      expect(removed).toBe(true);
    });

    it('returns false for non-existent reaction', async () => {
      const removed = await removeReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });

      expect(removed).toBe(false);
    });
  });

  describe('getReactionsForMessages', () => {
    it('returns grouped summaries with correct counts', async () => {
      await addReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });
      await addReaction(app.db, { messageId, userId: userId2, emoji: '\u{1F44D}' });
      await addReaction(app.db, { messageId, userId, emoji: '\u2764\uFE0F' });

      const result = await getReactionsForMessages(app.db, [messageId]);
      const summaries = result.get(messageId);

      expect(summaries).toBeDefined();
      expect(summaries).toHaveLength(2);

      const thumbsUp = summaries!.find((s) => s.emoji === '\u{1F44D}');
      expect(thumbsUp).toBeDefined();
      expect(thumbsUp!.count).toBe(2);
      expect(thumbsUp!.userIds).toContain(userId);
      expect(thumbsUp!.userIds).toContain(userId2);

      const heart = summaries!.find((s) => s.emoji === '\u2764\uFE0F');
      expect(heart).toBeDefined();
      expect(heart!.count).toBe(1);
      expect(heart!.userIds).toContain(userId);
    });

    it('returns empty map when no reactions exist', async () => {
      const result = await getReactionsForMessages(app.db, [messageId]);

      expect(result.get(messageId)).toBeUndefined();
    });

    it('returns empty map for empty messageIds array', async () => {
      const result = await getReactionsForMessages(app.db, []);

      expect(result.size).toBe(0);
    });

    it('handles multiple messages in single call', async () => {
      const [msg2] = await app.db.insert(messages).values({
        channel_id: channelId,
        user_id: userId,
        encrypted_content: 'test-content-2',
        nonce: 'test-nonce-2',
      }).returning();

      await addReaction(app.db, { messageId, userId, emoji: '\u{1F44D}' });
      await addReaction(app.db, { messageId: msg2.id, userId, emoji: '\u{1F525}' });

      const result = await getReactionsForMessages(app.db, [messageId, msg2.id]);

      expect(result.get(messageId)).toHaveLength(1);
      expect(result.get(msg2.id)).toHaveLength(1);
      expect(result.get(msg2.id)![0].emoji).toBe('\u{1F525}');
    });
  });
});
