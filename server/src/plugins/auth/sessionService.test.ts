import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
});

import { createDatabase, type AppDatabase } from '../../db/connection.js';
import { users, sessions } from '../../db/schema.js';
import { hashToken } from './authService.js';
import {
  createSession,
  findSessionByTokenHash,
  deleteSession,
  deleteUserSessions,
  cleanExpiredSessions,
} from './sessionService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../../drizzle');

let db: AppDatabase;
let closeDb: () => Promise<void>;

async function seedUser(username = 'testuser'): Promise<string> {
  const [user] = await db.insert(users).values({
    username,
    password_hash: '$2b$12$fakehashfortest',
    role: 'user',
  }).returning();
  return user.id;
}

beforeAll(async () => {
  const conn = createDatabase();
  await conn.migrate(migrationsFolder);
  db = conn.db;
  closeDb = conn.close;
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.delete(sessions);
  await db.delete(users);
});

describe('sessionService', () => {
  describe('createSession', () => {
    it('should create a session with hashed refresh token', async () => {
      const userId = await seedUser();
      const refreshToken = 'my-refresh-token-value';

      const session = await createSession(db, userId, refreshToken);

      expect(session.id).toBeDefined();
      expect(session.user_id).toBe(userId);
      expect(session.refresh_token_hash).toBe(hashToken(refreshToken));
      expect(session.expires_at).toBeInstanceOf(Date);
      expect(session.created_at).toBeInstanceOf(Date);

      // Expiry should be ~7 days from now
      const diffMs = session.expires_at.getTime() - Date.now();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(6.9);
      expect(diffDays).toBeLessThanOrEqual(7);
    });
  });

  describe('findSessionByTokenHash', () => {
    it('should find a session by its token hash', async () => {
      const userId = await seedUser();
      const refreshToken = 'find-me-token';
      await createSession(db, userId, refreshToken);

      const found = await findSessionByTokenHash(db, hashToken(refreshToken));
      expect(found).not.toBeNull();
      expect(found!.user_id).toBe(userId);
    });

    it('should return null for non-existent token hash', async () => {
      const found = await findSessionByTokenHash(db, hashToken('nonexistent-token'));
      expect(found).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete a single session by id', async () => {
      const userId = await seedUser();
      const session = await createSession(db, userId, 'token-to-delete');

      await deleteSession(db, session.id);

      const found = await findSessionByTokenHash(db, hashToken('token-to-delete'));
      expect(found).toBeNull();
    });
  });

  describe('deleteUserSessions', () => {
    it('should delete all sessions for a user', async () => {
      const userId = await seedUser();
      await createSession(db, userId, 'token-1');
      await createSession(db, userId, 'token-2');

      await deleteUserSessions(db, userId);

      const found1 = await findSessionByTokenHash(db, hashToken('token-1'));
      const found2 = await findSessionByTokenHash(db, hashToken('token-2'));
      expect(found1).toBeNull();
      expect(found2).toBeNull();
    });

    it('should not delete sessions of other users', async () => {
      const userId1 = await seedUser('user1');
      const userId2 = await seedUser('user2');
      await createSession(db, userId1, 'token-user1');
      await createSession(db, userId2, 'token-user2');

      await deleteUserSessions(db, userId1);

      const found1 = await findSessionByTokenHash(db, hashToken('token-user1'));
      const found2 = await findSessionByTokenHash(db, hashToken('token-user2'));
      expect(found1).toBeNull();
      expect(found2).not.toBeNull();
    });
  });

  describe('cleanExpiredSessions', () => {
    it('should delete expired sessions and return count', async () => {
      const userId = await seedUser();
      // Create a session that's already expired (manually set expires_at in the past)
      await db.insert(sessions).values({
        user_id: userId,
        refresh_token_hash: hashToken('expired-token'),
        expires_at: new Date(Date.now() - 1000), // 1 second ago
      });

      // Create a valid session
      await createSession(db, userId, 'valid-token');

      const deletedCount = await cleanExpiredSessions(db);
      expect(deletedCount).toBe(1);

      // Valid session should still exist
      const found = await findSessionByTokenHash(db, hashToken('valid-token'));
      expect(found).not.toBeNull();

      // Expired session should be gone
      const foundExpired = await findSessionByTokenHash(db, hashToken('expired-token'));
      expect(foundExpired).toBeNull();
    });
  });
});
