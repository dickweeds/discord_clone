import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { sounds, users } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';
import * as s3Service from '../../services/s3Service.js';
import {
  SOUNDBOARD_MAX_FILE_SIZE,
  SOUNDBOARD_MAX_DURATION_MS,
  SOUNDBOARD_ALLOWED_MIME_TYPES,
} from 'discord-clone-shared';

let log: FastifyBaseLogger;

export function initSoundboardService(logger: FastifyBaseLogger): void {
  log = logger;
}

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
    .innerJoin(users, eq(sounds.uploaded_by, users.id))
    .orderBy(desc(sounds.created_at));

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
  if (!SOUNDBOARD_ALLOWED_MIME_TYPES.includes(contentType as typeof SOUNDBOARD_ALLOWED_MIME_TYPES[number])) {
    throw new SoundValidationError(`Unsupported audio format. Allowed: ${SOUNDBOARD_ALLOWED_MIME_TYPES.join(', ')}`);
  }
  if (fileSize <= 0 || !Number.isInteger(fileSize)) {
    throw new SoundValidationError('File size must be a positive integer');
  }
  if (fileSize > SOUNDBOARD_MAX_FILE_SIZE) {
    throw new SoundValidationError(`File size exceeds maximum of ${SOUNDBOARD_MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  if (durationMs <= 0 || !Number.isInteger(durationMs)) {
    throw new SoundValidationError('Duration must be a positive integer');
  }
  if (durationMs > SOUNDBOARD_MAX_DURATION_MS) {
    throw new SoundValidationError(`Duration exceeds maximum of ${SOUNDBOARD_MAX_DURATION_MS / 1000} seconds`);
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

  try {
    await s3Service.deleteObject(sound.s3Key);
  } catch (err) {
    log.warn({ soundId, s3Key: sound.s3Key, err }, 'Failed to delete S3 object — orphaned');
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
