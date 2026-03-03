import { describe, it, expect, beforeEach, vi } from 'vitest';
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

import { setupApp, seedOwner, seedRegularUser } from '../../test/helpers.js';
import { sounds } from '../../db/schema.js';

describe('GET /api/soundboard', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
  });

  it('returns sound list for authenticated user', async () => {
    const { id: userId, token } = await seedOwner(app);

    await app.db.insert(sounds).values([
      { name: 'airhorn', s3_key: 'sounds/airhorn.mp3', file_size: 1000, duration_ms: 3000, mime_type: 'audio/mpeg', uploaded_by: userId },
      { name: 'rimshot', s3_key: 'sounds/rimshot.mp3', file_size: 2000, duration_ms: 4000, mime_type: 'audio/mpeg', uploaded_by: userId },
    ]);

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
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
  });

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
    expect(body.data).toHaveProperty('s3Key');
    expect(body.data).toHaveProperty('soundId');
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
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
  });

  it('returns download URL for existing sound', async () => {
    const { id: userId, token } = await seedOwner(app);

    const [sound] = await app.db.insert(sounds).values({
      name: 'test',
      s3_key: 'sounds/test.mp3',
      file_size: 1000,
      duration_ms: 5000,
      mime_type: 'audio/mpeg',
      uploaded_by: userId,
    }).returning();

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
    expect(body.error.message).toContain('Sound not found');
  });
});

describe('DELETE /api/soundboard/:soundId', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await setupApp();
  });

  it('uploader can delete their own sound (204)', async () => {
    const { id: userId, token } = await seedRegularUser(app, 'uploader');

    const [sound] = await app.db.insert(sounds).values({
      name: 'test',
      s3_key: 'sounds/test.mp3',
      file_size: 1000,
      duration_ms: 5000,
      mime_type: 'audio/mpeg',
      uploaded_by: userId,
    }).returning();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/soundboard/${sound.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(204);

    // Verify sound is gone
    const remaining = await app.db.select().from(sounds);
    expect(remaining).toHaveLength(0);
  });

  it('non-uploader regular user gets 403', async () => {
    const { id: uploaderId } = await seedRegularUser(app, 'uploader');
    const { token: otherToken } = await seedRegularUser(app, 'other');

    const [sound] = await app.db.insert(sounds).values({
      name: 'test',
      s3_key: 'sounds/test.mp3',
      file_size: 1000,
      duration_ms: 5000,
      mime_type: 'audio/mpeg',
      uploaded_by: uploaderId,
    }).returning();

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

    const [sound] = await app.db.insert(sounds).values({
      name: 'test',
      s3_key: 'sounds/test.mp3',
      file_size: 1000,
      duration_ms: 5000,
      mime_type: 'audio/mpeg',
      uploaded_by: uploaderId,
    }).returning();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/soundboard/${sound.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(204);

    // Verify sound is gone
    const remaining = await app.db.select().from(sounds);
    expect(remaining).toHaveLength(0);
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
});
