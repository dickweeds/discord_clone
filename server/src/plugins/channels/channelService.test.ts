import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

import { setupApp, teardownApp, truncateAll, seedOwner } from '../../test/helpers.js';
import { channels, messages } from '../../db/schema.js';
import { createChannel, deleteChannel, ChannelValidationError, ChannelNotFoundError } from './channelService.js';

describe('channelService', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await setupApp();
  });

  afterAll(async () => {
    await teardownApp();
  });

  beforeEach(async () => {
    await truncateAll(app.db);
  });

  describe('createChannel', () => {
    it('creates and returns a channel', async () => {
      const channel = await createChannel(app.db, 'general', 'text');

      expect(channel).toHaveProperty('id');
      expect(channel.name).toBe('general');
      expect(channel.type).toBe('text');
      expect(channel).toHaveProperty('createdAt');
    });

    it('trims channel name', async () => {
      const channel = await createChannel(app.db, '  spaced  ', 'text');
      expect(channel.name).toBe('spaced');
    });

    it('throws ChannelValidationError for empty name', async () => {
      await expect(createChannel(app.db, '', 'text')).rejects.toThrow(ChannelValidationError);
      await expect(createChannel(app.db, '   ', 'text')).rejects.toThrow(ChannelValidationError);
    });

    it('throws ChannelValidationError for name over 50 chars', async () => {
      const longName = 'a'.repeat(51);
      await expect(createChannel(app.db, longName, 'text')).rejects.toThrow(ChannelValidationError);
    });

    it('allows name of exactly 50 chars', async () => {
      const name = 'a'.repeat(50);
      const channel = await createChannel(app.db, name, 'text');
      expect(channel.name).toBe(name);
    });

    it('throws ChannelValidationError for duplicate name', async () => {
      await createChannel(app.db, 'general', 'text');
      await expect(createChannel(app.db, 'general', 'voice')).rejects.toThrow(ChannelValidationError);
      await expect(createChannel(app.db, 'general', 'voice')).rejects.toThrow('already exists');
    });

    it('throws ChannelValidationError when channel limit is reached', async () => {
      // Seed channels up to the limit
      for (let i = 0; i < 50; i++) {
        await app.db.insert(channels).values({ name: `channel-${i}`, type: 'text' });
      }

      await expect(createChannel(app.db, 'one-too-many', 'text')).rejects.toThrow(ChannelValidationError);
      await expect(createChannel(app.db, 'one-too-many', 'text')).rejects.toThrow('Channel limit reached');
    });
  });

  describe('deleteChannel', () => {
    it('deletes a channel', async () => {
      const [channel] = await app.db.insert(channels).values({ name: 'to-delete', type: 'text' }).returning();

      await deleteChannel(app.db, channel.id);

      const remaining = await app.db.select().from(channels);
      expect(remaining).toHaveLength(0);
    });

    it('deletes channel messages before deleting channel', async () => {
      const { id: ownerId } = await seedOwner(app);
      const [channel] = await app.db.insert(channels).values({ name: 'with-msgs', type: 'text' }).returning();

      await app.db.insert(messages).values([
        { channel_id: channel.id, user_id: ownerId, encrypted_content: 'msg1', nonce: 'n1' },
        { channel_id: channel.id, user_id: ownerId, encrypted_content: 'msg2', nonce: 'n2' },
      ]);

      await deleteChannel(app.db, channel.id);

      const remainingMessages = await app.db.select().from(messages);
      expect(remainingMessages).toHaveLength(0);
      const remainingChannels = await app.db.select().from(channels);
      expect(remainingChannels).toHaveLength(0);
    });

    it('throws ChannelNotFoundError for non-existent channel', async () => {
      await expect(deleteChannel(app.db, '00000000-0000-0000-0000-000000000099')).rejects.toThrow(ChannelNotFoundError);
    });
  });
});
