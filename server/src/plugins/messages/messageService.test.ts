import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});
vi.stubEnv('DATABASE_PATH', ':memory:');

import { setupApp, seedRegularUser } from '../../test/helpers.js';
import { channels } from '../../db/schema.js';
import { createMessage, getMessagesByChannel } from './messageService.js';

describe('messageService', () => {
  let app: FastifyInstance;
  let channelId: string;
  let userId: string;

  beforeEach(async () => {
    app = await setupApp();
    const channel = app.db.insert(channels).values({ name: 'general', type: 'text' }).returning().get();
    channelId = channel.id;
    const user = await seedRegularUser(app, 'testuser');
    userId = user.id;
  });

  describe('createMessage', () => {
    it('stores encrypted content and nonce', () => {
      const result = createMessage(app.db, channelId, userId, 'encrypted-blob', 'nonce-value');

      expect(result.id).toBeDefined();
      expect(result.channelId).toBe(channelId);
      expect(result.userId).toBe(userId);
      expect(result.encryptedContent).toBe('encrypted-blob');
      expect(result.nonce).toBe('nonce-value');
      expect(result.createdAt).toBeDefined();
    });

    it('returns ISO 8601 createdAt', () => {
      const result = createMessage(app.db, channelId, userId, 'content', 'nonce');
      expect(() => new Date(result.createdAt)).not.toThrow();
      expect(new Date(result.createdAt).toISOString()).toBeTruthy();
    });

    it('generates unique IDs for each message', () => {
      const msg1 = createMessage(app.db, channelId, userId, 'content1', 'nonce1');
      const msg2 = createMessage(app.db, channelId, userId, 'content2', 'nonce2');
      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  describe('getMessagesByChannel', () => {
    it('returns ordered messages for a channel', () => {
      createMessage(app.db, channelId, userId, 'first', 'nonce1');
      createMessage(app.db, channelId, userId, 'second', 'nonce2');
      createMessage(app.db, channelId, userId, 'third', 'nonce3');

      const messages = getMessagesByChannel(app.db, channelId);
      expect(messages).toHaveLength(3);
      // Ordered by created_at DESC (newest first)
      expect(messages[0].encrypted_content).toBe('third');
      expect(messages[2].encrypted_content).toBe('first');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        createMessage(app.db, channelId, userId, `msg-${i}`, `nonce-${i}`);
      }

      const messages = getMessagesByChannel(app.db, channelId, 2);
      expect(messages).toHaveLength(2);
    });

    it('paginates with before parameter', () => {
      createMessage(app.db, channelId, userId, 'first', 'nonce1');
      createMessage(app.db, channelId, userId, 'second', 'nonce2');
      const msg3 = createMessage(app.db, channelId, userId, 'third', 'nonce3');

      const messages = getMessagesByChannel(app.db, channelId, 50, msg3.id);
      // Should return messages before msg3 (i.e., msg1 and msg2)
      expect(messages).toHaveLength(2);
      expect(messages.every((m) => m.id !== msg3.id)).toBe(true);
    });

    it('returns empty array for non-existent channel', () => {
      const messages = getMessagesByChannel(app.db, 'non-existent-channel');
      expect(messages).toHaveLength(0);
    });

    it('only returns messages for the specified channel', () => {
      const channel2 = app.db.insert(channels).values({ name: 'other', type: 'text' }).returning().get();
      createMessage(app.db, channelId, userId, 'msg-general', 'nonce1');
      createMessage(app.db, channel2.id, userId, 'msg-other', 'nonce2');

      const messages = getMessagesByChannel(app.db, channelId);
      expect(messages).toHaveLength(1);
      expect(messages[0].encrypted_content).toBe('msg-general');
    });
  });
});
