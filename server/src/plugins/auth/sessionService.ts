import { eq, lt } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection.js';
import { sessions } from '../../db/schema.js';
import type { Session } from '../../db/schema.js';
import { hashToken } from './authService.js';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export function createSession(db: AppDatabase, userId: string, refreshToken: string): Session {
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  return db.insert(sessions).values({
    user_id: userId,
    refresh_token_hash: tokenHash,
    expires_at: expiresAt,
  }).returning().get();
}

export function findSessionByTokenHash(db: AppDatabase, tokenHash: string): Session | null {
  return db.select()
    .from(sessions)
    .where(eq(sessions.refresh_token_hash, tokenHash))
    .get() ?? null;
}

export function deleteSession(db: AppDatabase, sessionId: string): void {
  db.delete(sessions)
    .where(eq(sessions.id, sessionId))
    .run();
}

export function deleteUserSessions(db: AppDatabase, userId: string): void {
  db.delete(sessions)
    .where(eq(sessions.user_id, userId))
    .run();
}

export function cleanExpiredSessions(db: AppDatabase): number {
  const result = db.delete(sessions)
    .where(lt(sessions.expires_at, new Date()))
    .returning()
    .all();

  return result.length;
}
