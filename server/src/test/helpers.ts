import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { hashPassword, generateAccessToken, generateRefreshToken } from '../plugins/auth/authService.js';
import { createSession } from '../plugins/auth/sessionService.js';
import { users, invites, sounds } from '../db/schema.js';
import type { AppDatabase } from '../db/connection.js';

let currentApp: FastifyInstance | null = null;

export async function setupApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await runMigrations(app.migrate);
  currentApp = app;
  return app;
}

export async function teardownApp(): Promise<void> {
  if (currentApp) {
    await currentApp.close();
    currentApp = null;
  }
}

/** Truncate all tables for per-test isolation (faster than new PGlite instance).
 *  Uses TRUNCATE CASCADE — instant metadata-only operation, auto-handles FK ordering. */
export async function truncateAll(db: AppDatabase): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE sounds, messages, sessions, bans, invites, channels, users CASCADE`
  );
}

export async function seedOwner(app: FastifyInstance): Promise<{ id: string; token: string }> {
  const passwordHash = await hashPassword('ownerPass123');
  const [owner] = await app.db.insert(users).values({
    username: 'owner',
    password_hash: passwordHash,
    role: 'owner',
  }).returning();
  const token = generateAccessToken({ userId: owner.id, role: 'owner', username: 'owner' });
  return { id: owner.id, token };
}

export async function seedRegularUser(app: FastifyInstance, username = 'regular'): Promise<{ id: string; token: string }> {
  const passwordHash = await hashPassword('userPass123');
  const [user] = await app.db.insert(users).values({
    username,
    password_hash: passwordHash,
    role: 'user',
  }).returning();
  const token = generateAccessToken({ userId: user.id, role: 'user', username });
  return { id: user.id, token };
}

export async function seedUserWithSession(app: FastifyInstance, username = 'sessionuser'): Promise<{ id: string; accessToken: string; refreshToken: string }> {
  const passwordHash = await hashPassword('sessionPass123');
  const [user] = await app.db.insert(users).values({
    username,
    password_hash: passwordHash,
    role: 'user',
  }).returning();
  const accessToken = generateAccessToken({ userId: user.id, role: 'user', username });
  const refreshToken = generateRefreshToken({ userId: user.id, role: 'user', username });
  await createSession(app.db, user.id, refreshToken);
  return { id: user.id, accessToken, refreshToken };
}

export async function seedSound(
  app: FastifyInstance,
  uploadedBy: string,
  overrides: Partial<{ name: string; s3_key: string; file_size: number; duration_ms: number; mime_type: string }> = {},
) {
  const [sound] = await app.db.insert(sounds).values({
    name: overrides.name ?? 'Test Sound',
    s3_key: overrides.s3_key ?? `sounds/${crypto.randomUUID()}.mp3`,
    file_size: overrides.file_size ?? 1024,
    duration_ms: overrides.duration_ms ?? 5000,
    mime_type: overrides.mime_type ?? 'audio/mpeg',
    uploaded_by: uploadedBy,
  }).returning();
  return sound;
}

export async function seedInvite(app: FastifyInstance, createdBy: string, tokenValue = 'valid-invite-token'): Promise<string> {
  await app.db.insert(invites).values({
    token: tokenValue,
    created_by: createdBy,
  });
  return tokenValue;
}
