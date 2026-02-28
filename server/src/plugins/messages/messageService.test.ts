import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

import { setupApp, teardownApp, truncateAll, seedRegularUser } from '../../test/helpers.js';
import { channels, messages } from '../../db/schema.js';
import { createMessage, getMessagesByChannel } from './messageService.js';

describe('messageService', () => {
  let app: FastifyInstance;
  let channelId: string;
  let userId: string;

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
  });

  describe('createMessage', () => {
    it('stores encrypted content and nonce', async () => {
      const result = await createMessage(app.db, {
        channelId,
        userId,
        encryptedContent: 'encrypted-blob',
        nonce: 'nonce-value',
      });

      expect(result.id).toBeDefined();
      expect(result.channelId).toBe(channelId);
      expect(result.userId).toBe(userId);
      expect(result.encryptedContent).toBe('encrypted-blob');
      expect(result.nonce).toBe('nonce-value');
      expect(result.createdAt).toBeDefined();
    });

    it('returns ISO 8601 createdAt', async () => {
      const result = await createMessage(app.db, {
        channelId,
        userId,
        encryptedContent: 'content',
        nonce: 'nonce',
      });
      expect(() => new Date(result.createdAt)).not.toThrow();
      expect(new Date(result.createdAt).toISOString()).toBeTruthy();
    });

    it('generates unique IDs for each message', async () => {
      const msg1 = await createMessage(app.db, { channelId, userId, encryptedContent: 'content1', nonce: 'nonce1' });
      const msg2 = await createMessage(app.db, { channelId, userId, encryptedContent: 'content2', nonce: 'nonce2' });
      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  describe('getMessagesByChannel', () => {
    it('returns ordered messages for a channel', async () => {
      // Insert with explicit timestamps to guarantee deterministic ordering
      // (same-millisecond inserts would rely on random UUID tiebreaker)
      const now = Date.now();
      await app.db.insert(messages).values({
        channel_id: channelId, user_id: userId,
        encrypted_content: 'first', nonce: 'nonce1',
        created_at: new Date(now - 2000),
      });
      await app.db.insert(messages).values({
        channel_id: channelId, user_id: userId,
        encrypted_content: 'second', nonce: 'nonce2',
        created_at: new Date(now - 1000),
      });
      await app.db.insert(messages).values({
        channel_id: channelId, user_id: userId,
        encrypted_content: 'third', nonce: 'nonce3',
        created_at: new Date(now),
      });

      const { rows } = await getMessagesByChannel(app.db, channelId);
      expect(rows).toHaveLength(3);
      // Ordered by created_at DESC (newest first)
      expect(rows[0].encrypted_content).toBe('third');
      expect(rows[2].encrypted_content).toBe('first');
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await createMessage(app.db, { channelId, userId, encryptedContent: `msg-${i}`, nonce: `nonce-${i}` });
      }

      const { rows } = await getMessagesByChannel(app.db, channelId, 2);
      expect(rows).toHaveLength(2);
    });

    it('paginates with cursor parameter', async () => {
      await createMessage(app.db, { channelId, userId, encryptedContent: 'first', nonce: 'nonce1' });
      await createMessage(app.db, { channelId, userId, encryptedContent: 'second', nonce: 'nonce2' });
      await createMessage(app.db, { channelId, userId, encryptedContent: 'third', nonce: 'nonce3' });

      // Get first page with limit=1 to get a cursor
      const page1 = await getMessagesByChannel(app.db, channelId, 1);
      expect(page1.rows).toHaveLength(1);
      expect(page1.nextCursor).not.toBeNull();

      // Get second page using cursor
      const page2 = await getMessagesByChannel(app.db, channelId, 50, page1.nextCursor!);
      expect(page2.rows).toHaveLength(2);
      expect(page2.rows.every((m) => m.id !== page1.rows[0].id)).toBe(true);
    });

    it('returns empty array for non-existent channel', async () => {
      const { rows } = await getMessagesByChannel(app.db, '00000000-0000-0000-0000-000000000000');
      expect(rows).toHaveLength(0);
    });

    it('only returns messages for the specified channel', async () => {
      const [channel2] = await app.db.insert(channels).values({ name: 'other', type: 'text' }).returning();
      await createMessage(app.db, { channelId, userId, encryptedContent: 'msg-general', nonce: 'nonce1' });
      await createMessage(app.db, { channelId: channel2.id, userId, encryptedContent: 'msg-other', nonce: 'nonce2' });

      const { rows } = await getMessagesByChannel(app.db, channelId);
      expect(rows).toHaveLength(1);
      expect(rows[0].encrypted_content).toBe('msg-general');
    });
  });
});
