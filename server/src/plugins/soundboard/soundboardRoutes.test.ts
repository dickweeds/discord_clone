import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

// Mock s3Service to avoid real AWS calls
vi.mock('../../services/s3Service.js', () => ({
  getUploadUrl: vi.fn().mockResolvedValue('https://s3.example.com/upload'),
  getDownloadUrl: vi.fn().mockResolvedValue('https://s3.example.com/download'),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

import { setupApp, teardownApp, truncateAll, seedOwner, seedRegularUser, seedSound } from '../../test/helpers.js';

describe('Soundboard Routes', () => {
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

  describe('GET /api/soundboard', () => {
    it('returns sound list for authenticated user', async () => {
      const { id: userId, token } = await seedOwner(app);
      await seedSound(app, userId, { name: 'airhorn' });
      await seedSound(app, userId, { name: 'rimshot' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/soundboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.count).toBe(2);
      expect(body.data.some((s: { name: string }) => s.name === 'airhorn')).toBe(true);
      expect(body.data.some((s: { name: string }) => s.name === 'rimshot')).toBe(true);
    });

    it('does not expose s3Key in response', async () => {
      const { id: userId, token } = await seedOwner(app);
      await seedSound(app, userId);

      const response = await app.inject({
        method: 'GET',
        url: '/api/soundboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data[0]).not.toHaveProperty('s3Key');
    });

    it('returns empty list when no sounds exist', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'GET',
        url: '/api/soundboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/soundboard',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/soundboard/upload-url', () => {
    it('returns 201 with upload URL for valid request', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/soundboard/upload-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'airhorn.mp3',
          contentType: 'audio/mpeg',
          fileSize: 5000,
          durationMs: 3000,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveProperty('uploadUrl');
      expect(body.data).toHaveProperty('soundId');
      expect(body.data).not.toHaveProperty('s3Key');
      expect(body.data.uploadUrl).toBe('https://s3.example.com/upload');
    });

    it('rejects invalid mime type with 400 VALIDATION_ERROR', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/soundboard/upload-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'song.txt',
          contentType: 'text/plain',
          fileSize: 5000,
          durationMs: 3000,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Unsupported audio format');
    });

    it('rejects file size exceeding 20MB with 400', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/soundboard/upload-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'huge.mp3',
          contentType: 'audio/mpeg',
          fileSize: 21 * 1024 * 1024, // 21MB
          durationMs: 5000,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('File size exceeds');
    });

    it('rejects duration exceeding 20000ms with 400', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/soundboard/upload-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'long.mp3',
          contentType: 'audio/mpeg',
          fileSize: 5000,
          durationMs: 25000,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Duration exceeds');
    });

    it('rejects negative fileSize at schema level', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/soundboard/upload-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'test.mp3',
          contentType: 'audio/mpeg',
          fileSize: -1,
          durationMs: 3000,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects zero durationMs at schema level', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/soundboard/upload-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'test.mp3',
          contentType: 'audio/mpeg',
          fileSize: 5000,
          durationMs: 0,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('strips extra properties from body', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/soundboard/upload-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'test.mp3',
          contentType: 'audio/mpeg',
          fileSize: 5000,
          durationMs: 3000,
          extraProp: 'should-be-stripped',
        },
      });

      // Fastify's AJV strips additional properties rather than rejecting — request still succeeds
      expect(response.statusCode).toBe(201);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/soundboard/upload-url',
        payload: {
          fileName: 'airhorn.mp3',
          contentType: 'audio/mpeg',
          fileSize: 5000,
          durationMs: 3000,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/soundboard/:soundId/download-url', () => {
    it('returns download URL for existing sound', async () => {
      const { id: userId, token } = await seedOwner(app);
      const sound = await seedSound(app, userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/soundboard/${sound.id}/download-url`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveProperty('downloadUrl');
      expect(body.data.downloadUrl).toBe('https://s3.example.com/download');
    });

    it('returns 404 for non-existent sound', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'GET',
        url: '/api/soundboard/00000000-0000-0000-0000-000000000099/download-url',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid UUID format', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'GET',
        url: '/api/soundboard/not-a-uuid/download-url',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/soundboard/:soundId', () => {
    it('uploader can delete their own sound (204)', async () => {
      const { id: userId, token } = await seedRegularUser(app, 'uploader');
      const sound = await seedSound(app, userId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/soundboard/${sound.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('non-uploader regular user gets 403', async () => {
      const { id: uploaderId } = await seedRegularUser(app, 'uploader');
      const { token: otherToken } = await seedRegularUser(app, 'other');
      const sound = await seedSound(app, uploaderId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/soundboard/${sound.id}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('admin (owner role) can delete any sound (204)', async () => {
      const { id: uploaderId } = await seedRegularUser(app, 'uploader');
      const { token: adminToken } = await seedOwner(app);
      const sound = await seedSound(app, uploaderId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/soundboard/${sound.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 404 for non-existent sound', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/soundboard/00000000-0000-0000-0000-000000000099',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid UUID format', async () => {
      const { token } = await seedOwner(app);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/soundboard/not-a-uuid',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
