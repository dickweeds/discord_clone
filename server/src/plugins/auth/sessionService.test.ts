import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
});

import { createDatabase } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { users, sessions } from '../../db/schema.js';
import { hashToken } from './authService.js';
import {
  createSession,
  findSessionByTokenHash,
  deleteSession,
  deleteUserSessions,
  cleanExpiredSessions,
} from './sessionService.js';
import type { AppDatabase } from '../../db/connection.js';

vi.stubEnv('DATABASE_PATH', ':memory:');

function setupTestDb(): AppDatabase {
  const { db } = createDatabase(':memory:');
  runMigrations(db);
  return db;
}

function seedUser(db: AppDatabase, username = 'testuser'): string {
  const user = db.insert(users).values({
    username,
    password_hash: '$2b$12$fakehashfortest',
    role: 'user',
  }).returning().get();
  return user.id;
}

describe('sessionService', () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = setupTestDb();
  });

  describe('createSession', () => {
    it('should create a session with hashed refresh token', () => {
      const userId = seedUser(db);
      const refreshToken = 'my-refresh-token-value';

      const session = createSession(db, userId, refreshToken);

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
    it('should find a session by its token hash', () => {
      const userId = seedUser(db);
      const refreshToken = 'find-me-token';
      createSession(db, userId, refreshToken);

      const found = findSessionByTokenHash(db, hashToken(refreshToken));
      expect(found).not.toBeNull();
      expect(found!.user_id).toBe(userId);
    });

    it('should return null for non-existent token hash', () => {
      const found = findSessionByTokenHash(db, hashToken('nonexistent-token'));
      expect(found).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete a single session by id', () => {
      const userId = seedUser(db);
      const session = createSession(db, userId, 'token-to-delete');

      deleteSession(db, session.id);

      const found = findSessionByTokenHash(db, hashToken('token-to-delete'));
      expect(found).toBeNull();
    });
  });

  describe('deleteUserSessions', () => {
    it('should delete all sessions for a user', () => {
      const userId = seedUser(db);
      createSession(db, userId, 'token-1');
      createSession(db, userId, 'token-2');

      deleteUserSessions(db, userId);

      const found1 = findSessionByTokenHash(db, hashToken('token-1'));
      const found2 = findSessionByTokenHash(db, hashToken('token-2'));
      expect(found1).toBeNull();
      expect(found2).toBeNull();
    });

    it('should not delete sessions of other users', () => {
      const userId1 = seedUser(db, 'user1');
      const userId2 = seedUser(db, 'user2');
      createSession(db, userId1, 'token-user1');
      createSession(db, userId2, 'token-user2');

      deleteUserSessions(db, userId1);

      const found1 = findSessionByTokenHash(db, hashToken('token-user1'));
      const found2 = findSessionByTokenHash(db, hashToken('token-user2'));
      expect(found1).toBeNull();
      expect(found2).not.toBeNull();
    });
  });

  describe('cleanExpiredSessions', () => {
    it('should delete expired sessions and return count', () => {
      const userId = seedUser(db);
      // Create a session that's already expired (manually set expires_at in the past)
      db.insert(sessions).values({
        user_id: userId,
        refresh_token_hash: hashToken('expired-token'),
        expires_at: new Date(Date.now() - 1000), // 1 second ago
      }).run();

      // Create a valid session
      createSession(db, userId, 'valid-token');

      const deletedCount = cleanExpiredSessions(db);
      expect(deletedCount).toBe(1);

      // Valid session should still exist
      const found = findSessionByTokenHash(db, hashToken('valid-token'));
      expect(found).not.toBeNull();

      // Expired session should be gone
      const foundExpired = findSessionByTokenHash(db, hashToken('expired-token'));
      expect(foundExpired).toBeNull();
    });
  });
});
