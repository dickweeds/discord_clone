import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

vi.mock('../../services/s3Service.js', () => ({
  getUploadUrl: vi.fn().mockResolvedValue('https://s3.example.com/upload?signed'),
  getDownloadUrl: vi.fn().mockResolvedValue('https://s3.example.com/download?signed'),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

import { setupApp, teardownApp, truncateAll, seedOwner, seedRegularUser } from '../../test/helpers.js';
import { sounds } from '../../db/schema.js';
import {
  getAllSounds,
  getSoundById,
  requestUploadUrl,
  deleteSound,
  SoundNotFoundError,
  SoundValidationError,
  SoundPermissionError,
} from './soundboardService.js';

describe('soundboardService', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await setupApp();
  });

  afterAll(async () => {
    await teardownApp();
  });

  beforeEach(async () => {
    await app.db.delete(sounds);
    await truncateAll(app.db);
  });

  describe('getAllSounds', () => {
    it('returns joined data with uploadedByUsername populated', async () => {
      const { id: ownerId } = await seedOwner(app);

      await app.db.insert(sounds).values({
        name: 'airhorn',
        s3_key: 'sounds/test-uuid.mp3',
        file_size: 1024,
        duration_ms: 3000,
        mime_type: 'audio/mpeg',
        uploaded_by: ownerId,
      });

      const result = await getAllSounds(app.db);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('airhorn');
      expect(result[0].uploadedBy).toBe(ownerId);
      expect(result[0].uploadedByUsername).toBe('owner');
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('s3Key');
      expect(result[0]).toHaveProperty('fileSize');
      expect(result[0]).toHaveProperty('durationMs');
      expect(result[0]).toHaveProperty('mimeType');
      expect(result[0]).toHaveProperty('createdAt');
    });

    it('returns empty array when no sounds exist', async () => {
      const result = await getAllSounds(app.db);
      expect(result).toHaveLength(0);
    });
  });

  describe('getSoundById', () => {
    it('returns sound when it exists', async () => {
      const { id: ownerId } = await seedOwner(app);

      const [inserted] = await app.db.insert(sounds).values({
        name: 'bruh',
        s3_key: 'sounds/bruh.ogg',
        file_size: 2048,
        duration_ms: 1500,
        mime_type: 'audio/ogg',
        uploaded_by: ownerId,
      }).returning();

      const result = await getSoundById(app.db, inserted.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(inserted.id);
      expect(result!.name).toBe('bruh');
      expect(result!.s3Key).toBe('sounds/bruh.ogg');
      expect(result!.fileSize).toBe(2048);
      expect(result!.durationMs).toBe(1500);
      expect(result!.mimeType).toBe('audio/ogg');
      expect(result!.uploadedBy).toBe(ownerId);
    });

    it('returns null for non-existent sound', async () => {
      const result = await getSoundById(app.db, '00000000-0000-0000-0000-000000000099');
      expect(result).toBeNull();
    });
  });

  describe('requestUploadUrl', () => {
    it('rejects unsupported mime type', async () => {
      const { id: userId } = await seedOwner(app);

      await expect(
        requestUploadUrl(app.db, userId, 'cat.png', 'image/png', 1024, 3000),
      ).rejects.toThrow(SoundValidationError);

      await expect(
        requestUploadUrl(app.db, userId, 'cat.png', 'image/png', 1024, 3000),
      ).rejects.toThrow('Unsupported audio format');
    });

    it('rejects file size exceeding 20MB', async () => {
      const { id: userId } = await seedOwner(app);
      const oversized = 20 * 1024 * 1024 + 1;

      await expect(
        requestUploadUrl(app.db, userId, 'big.mp3', 'audio/mpeg', oversized, 3000),
      ).rejects.toThrow(SoundValidationError);

      await expect(
        requestUploadUrl(app.db, userId, 'big.mp3', 'audio/mpeg', oversized, 3000),
      ).rejects.toThrow('File size exceeds maximum');
    });

    it('rejects duration exceeding 20000ms', async () => {
      const { id: userId } = await seedOwner(app);

      await expect(
        requestUploadUrl(app.db, userId, 'long.mp3', 'audio/mpeg', 1024, 20001),
      ).rejects.toThrow(SoundValidationError);

      await expect(
        requestUploadUrl(app.db, userId, 'long.mp3', 'audio/mpeg', 1024, 20001),
      ).rejects.toThrow('Duration exceeds maximum');
    });

    it('creates DB row and returns uploadUrl, s3Key, and soundId', async () => {
      const { id: userId } = await seedOwner(app);

      const result = await requestUploadUrl(
        app.db, userId, 'airhorn.mp3', 'audio/mpeg', 5000, 3000,
      );

      expect(result).toHaveProperty('uploadUrl');
      expect(result).toHaveProperty('s3Key');
      expect(result).toHaveProperty('soundId');
      expect(result.uploadUrl).toBe('https://s3.example.com/upload?signed');
      expect(result.s3Key).toMatch(/^sounds\/.*\.mp3$/);

      // Verify DB row was created
      const sound = await getSoundById(app.db, result.soundId);
      expect(sound).not.toBeNull();
      expect(sound!.name).toBe('airhorn');
      expect(sound!.mimeType).toBe('audio/mpeg');
      expect(sound!.fileSize).toBe(5000);
      expect(sound!.durationMs).toBe(3000);
      expect(sound!.uploadedBy).toBe(userId);
    });

    it('accepts file size exactly at 20MB', async () => {
      const { id: userId } = await seedOwner(app);
      const exactMax = 20 * 1024 * 1024;

      const result = await requestUploadUrl(
        app.db, userId, 'exact.wav', 'audio/wav', exactMax, 3000,
      );

      expect(result).toHaveProperty('soundId');
    });

    it('accepts duration exactly at 20000ms', async () => {
      const { id: userId } = await seedOwner(app);

      const result = await requestUploadUrl(
        app.db, userId, 'exact.ogg', 'audio/ogg', 1024, 20000,
      );

      expect(result).toHaveProperty('soundId');
    });
  });

  describe('deleteSound', () => {
    it('allows the uploader to delete their own sound', async () => {
      const { id: userId } = await seedRegularUser(app, 'uploader');

      const [inserted] = await app.db.insert(sounds).values({
        name: 'my-sound',
        s3_key: 'sounds/my-sound.mp3',
        file_size: 1024,
        duration_ms: 2000,
        mime_type: 'audio/mpeg',
        uploaded_by: userId,
      }).returning();

      await deleteSound(app.db, inserted.id, userId, 'user');

      const result = await getSoundById(app.db, inserted.id);
      expect(result).toBeNull();
    });

    it('throws SoundPermissionError when another user tries to delete', async () => {
      const { id: uploaderId } = await seedRegularUser(app, 'uploader2');
      const { id: otherId } = await seedRegularUser(app, 'other');

      const [inserted] = await app.db.insert(sounds).values({
        name: 'not-yours',
        s3_key: 'sounds/not-yours.mp3',
        file_size: 1024,
        duration_ms: 2000,
        mime_type: 'audio/mpeg',
        uploaded_by: uploaderId,
      }).returning();

      await expect(
        deleteSound(app.db, inserted.id, otherId, 'user'),
      ).rejects.toThrow(SoundPermissionError);

      await expect(
        deleteSound(app.db, inserted.id, otherId, 'user'),
      ).rejects.toThrow('You can only delete your own sounds');

      // Verify sound still exists
      const result = await getSoundById(app.db, inserted.id);
      expect(result).not.toBeNull();
    });

    it('allows admin (role owner) to delete any sound', async () => {
      const { id: uploaderId } = await seedRegularUser(app, 'uploader3');
      const { id: adminId } = await seedOwner(app);

      const [inserted] = await app.db.insert(sounds).values({
        name: 'any-sound',
        s3_key: 'sounds/any-sound.mp3',
        file_size: 1024,
        duration_ms: 2000,
        mime_type: 'audio/mpeg',
        uploaded_by: uploaderId,
      }).returning();

      await deleteSound(app.db, inserted.id, adminId, 'owner');

      const result = await getSoundById(app.db, inserted.id);
      expect(result).toBeNull();
    });

    it('throws SoundNotFoundError for non-existent sound', async () => {
      const { id: userId } = await seedOwner(app);

      await expect(
        deleteSound(app.db, '00000000-0000-0000-0000-000000000099', userId, 'owner'),
      ).rejects.toThrow(SoundNotFoundError);

      await expect(
        deleteSound(app.db, '00000000-0000-0000-0000-000000000099', userId, 'owner'),
      ).rejects.toThrow('Sound not found');
    });
  });
});
