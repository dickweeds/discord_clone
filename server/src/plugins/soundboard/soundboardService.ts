import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { sounds, users } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';
import * as s3Service from '../../services/s3Service.js';

const ALLOWED_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/webm',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_DURATION_MS = 20_000; // 20s

function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/aac': 'aac',
    'audio/webm': 'webm',
  };
  return map[mimeType] || 'bin';
}

export async function getAllSounds(db: AppDatabase) {
  const rows = await db
    .select({
      id: sounds.id,
      name: sounds.name,
      s3Key: sounds.s3_key,
      fileSize: sounds.file_size,
      durationMs: sounds.duration_ms,
      mimeType: sounds.mime_type,
      uploadedBy: sounds.uploaded_by,
      uploadedByUsername: users.username,
      createdAt: sounds.created_at,
    })
    .from(sounds)
    .innerJoin(users, eq(sounds.uploaded_by, users.id));

  return rows;
}

export async function getSoundById(db: AppDatabase, soundId: string) {
  const [row] = await db
    .select({
      id: sounds.id,
      name: sounds.name,
      s3Key: sounds.s3_key,
      fileSize: sounds.file_size,
      durationMs: sounds.duration_ms,
      mimeType: sounds.mime_type,
      uploadedBy: sounds.uploaded_by,
      createdAt: sounds.created_at,
    })
    .from(sounds)
    .where(eq(sounds.id, soundId));

  return row ?? null;
}

export async function requestUploadUrl(
  db: AppDatabase,
  userId: string,
  fileName: string,
  contentType: string,
  fileSize: number,
  durationMs: number,
): Promise<{ uploadUrl: string; s3Key: string; soundId: string }> {
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    throw new SoundValidationError(`Unsupported audio format. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }
  if (fileSize > MAX_FILE_SIZE) {
    throw new SoundValidationError(`File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  if (durationMs > MAX_DURATION_MS) {
    throw new SoundValidationError(`Duration exceeds maximum of ${MAX_DURATION_MS / 1000} seconds`);
  }

  const ext = getExtensionFromMime(contentType);
  const soundId = randomUUID();
  const s3Key = `sounds/${soundId}.${ext}`;

  // Strip extension from display name if present
  const name = fileName.replace(/\.[^.]+$/, '');

  const [inserted] = await db.insert(sounds).values({
    id: soundId,
    name,
    s3_key: s3Key,
    file_size: fileSize,
    duration_ms: durationMs,
    mime_type: contentType,
    uploaded_by: userId,
  }).returning({ id: sounds.id });

  const uploadUrl = await s3Service.getUploadUrl(s3Key, contentType);

  return { uploadUrl, s3Key, soundId: inserted.id };
}

export async function getDownloadUrl(s3Key: string): Promise<string> {
  return s3Service.getDownloadUrl(s3Key);
}

export async function deleteSound(
  db: AppDatabase,
  soundId: string,
  userId: string,
  userRole: string,
): Promise<void> {
  const sound = await getSoundById(db, soundId);
  if (!sound) {
    throw new SoundNotFoundError('Sound not found');
  }

  if (sound.uploadedBy !== userId && userRole !== 'owner') {
    throw new SoundPermissionError('You can only delete your own sounds');
  }

  await db.delete(sounds).where(eq(sounds.id, soundId));

  // Delete from S3 — fire-and-forget, don't fail the request if S3 delete fails
  try {
    await s3Service.deleteObject(sound.s3Key);
  } catch {
    // S3 deletion failure is non-critical — the DB row is already gone
  }
}

export class SoundNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SoundNotFoundError';
  }
}

export class SoundValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SoundValidationError';
  }
}

export class SoundPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SoundPermissionError';
  }
}
