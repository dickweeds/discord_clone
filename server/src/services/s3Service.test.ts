import { describe, it, expect, vi, beforeEach } from 'vitest';

const { MOCK_BUCKET, mockSend, mockGetSignedUrl } = vi.hoisted(() => {
  const MOCK_BUCKET = 'test-soundboard-bucket';
  process.env.SOUNDBOARD_BUCKET_NAME = MOCK_BUCKET;
  return {
    MOCK_BUCKET,
    mockSend: vi.fn(),
    mockGetSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
  };
});

vi.mock('@aws-sdk/client-s3', () => {
  const S3Client = vi.fn().mockImplementation(function () {
    return { send: mockSend };
  });
  const PutObjectCommand = vi.fn().mockImplementation(function (this: Record<string, unknown>, input: Record<string, unknown>) {
    Object.assign(this, input);
  });
  const GetObjectCommand = vi.fn().mockImplementation(function (this: Record<string, unknown>, input: Record<string, unknown>) {
    Object.assign(this, input);
  });
  const DeleteObjectCommand = vi.fn().mockImplementation(function (this: Record<string, unknown>, input: Record<string, unknown>) {
    Object.assign(this, input);
  });
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

import { getUploadUrl, getDownloadUrl, deleteObject } from './s3Service.js';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

describe('s3Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUploadUrl', () => {
    it('should create a PutObjectCommand with correct Bucket, Key, and ContentType', async () => {
      await getUploadUrl('sounds/abc.mp3', 'audio/mpeg');

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: MOCK_BUCKET,
        Key: 'sounds/abc.mp3',
        ContentType: 'audio/mpeg',
      });
    });

    it('should call getSignedUrl with 900s expiry', async () => {
      const url = await getUploadUrl('sounds/abc.mp3', 'audio/mpeg');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ send: mockSend }),
        expect.objectContaining({ Bucket: MOCK_BUCKET, Key: 'sounds/abc.mp3', ContentType: 'audio/mpeg' }),
        { expiresIn: 900 },
      );
      expect(url).toBe('https://signed-url.example.com');
    });
  });

  describe('getDownloadUrl', () => {
    it('should create a GetObjectCommand with correct Bucket and Key', async () => {
      await getDownloadUrl('sounds/xyz.ogg');

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: MOCK_BUCKET,
        Key: 'sounds/xyz.ogg',
      });
    });

    it('should call getSignedUrl with 3600s expiry', async () => {
      const url = await getDownloadUrl('sounds/xyz.ogg');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ send: mockSend }),
        expect.objectContaining({ Bucket: MOCK_BUCKET, Key: 'sounds/xyz.ogg' }),
        { expiresIn: 3600 },
      );
      expect(url).toBe('https://signed-url.example.com');
    });
  });

  describe('deleteObject', () => {
    it('should create a DeleteObjectCommand with correct Bucket and Key', async () => {
      await deleteObject('sounds/old.wav');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: MOCK_BUCKET,
        Key: 'sounds/old.wav',
      });
    });

    it('should call client.send with the command', async () => {
      await deleteObject('sounds/old.wav');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: MOCK_BUCKET, Key: 'sounds/old.wav' }),
      );
    });
  });

  describe('environment variable', () => {
    it('should use SOUNDBOARD_BUCKET_NAME from process.env', async () => {
      await getUploadUrl('test-key', 'audio/wav');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: MOCK_BUCKET }),
      );
    });
  });
});
