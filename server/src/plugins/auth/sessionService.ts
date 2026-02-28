import { eq, lt } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection.js';
import { sessions } from '../../db/schema.js';
import type { Session } from '../../db/schema.js';
import { hashToken } from './authService.js';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export async function createSession(db: AppDatabase, userId: string, refreshToken: string): Promise<Session> {
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const [session] = await db.insert(sessions).values({
    user_id: userId,
    refresh_token_hash: tokenHash,
    expires_at: expiresAt,
  }).returning();

  return session;
}

export async function findSessionByTokenHash(db: AppDatabase, tokenHash: string): Promise<Session | null> {
  const [session] = await db.select()
    .from(sessions)
    .where(eq(sessions.refresh_token_hash, tokenHash));

  return session ?? null;
}

export async function deleteSession(db: AppDatabase, sessionId: string): Promise<void> {
  await db.delete(sessions)
    .where(eq(sessions.id, sessionId));
}

export async function deleteUserSessions(db: AppDatabase, userId: string): Promise<void> {
  await db.delete(sessions)
    .where(eq(sessions.user_id, userId));
}

export async function cleanExpiredSessions(db: AppDatabase): Promise<number> {
  const result = await db.delete(sessions)
    .where(lt(sessions.expires_at, new Date()))
    .returning();

  return result.length;
}
