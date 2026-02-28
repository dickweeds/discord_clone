import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

import { setupApp, teardownApp, truncateAll, seedOwner, seedRegularUser } from '../../test/helpers.js';
import { kickUser, banUser, unbanUser, resetPassword, getBannedUsers } from './adminService.js';
import { sessions, bans, users } from '../../db/schema.js';
import { createSession } from '../auth/sessionService.js';
import { generateRefreshToken, verifyPassword } from '../auth/authService.js';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

describe('adminService', () => {
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

  describe('kickUser', () => {
    it('deletes all sessions and returns user info', async () => {
      await seedOwner(app);
      const user = await seedRegularUser(app);

      // Create a session for the user
      const refreshToken = generateRefreshToken({ userId: user.id, role: 'user', username: 'regular' });
      await createSession(app.db, user.id, refreshToken);

      // Verify session exists
      const sessionsBefore = await app.db.select().from(sessions).where(eq(sessions.user_id, user.id));
      expect(sessionsBefore.length).toBe(1);

      const result = await kickUser(app.db, user.id);
      expect(result.id).toBe(user.id);
      expect(result.username).toBe('regular');

      // Verify sessions deleted
      const sessionsAfter = await app.db.select().from(sessions).where(eq(sessions.user_id, user.id));
      expect(sessionsAfter.length).toBe(0);
    });

    it('throws for non-existent user', async () => {
      await expect(kickUser(app.db, '00000000-0000-0000-0000-000000000099')).rejects.toThrow('User not found');
    });
  });

  describe('banUser', () => {
    it('creates ban record and deletes sessions', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);

      // Create a session
      const refreshToken = generateRefreshToken({ userId: user.id, role: 'user', username: 'regular' });
      await createSession(app.db, user.id, refreshToken);

      const ban = await banUser(app.db, user.id, owner.id);
      expect(ban.user_id).toBe(user.id);
      expect(ban.banned_by).toBe(owner.id);

      // Verify ban record exists
      const [banRecord] = await app.db.select().from(bans).where(eq(bans.user_id, user.id));
      expect(banRecord).toBeDefined();

      // Verify sessions deleted
      const userSessions = await app.db.select().from(sessions).where(eq(sessions.user_id, user.id));
      expect(userSessions.length).toBe(0);
    });

    it('throws for non-existent user', async () => {
      const owner = await seedOwner(app);
      await expect(banUser(app.db, '00000000-0000-0000-0000-000000000099', owner.id)).rejects.toThrow('User not found');
    });

    it('throws when user is already banned', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);

      await banUser(app.db, user.id, owner.id);
      await expect(banUser(app.db, user.id, owner.id)).rejects.toThrow('User is already banned');
    });
  });

  describe('unbanUser', () => {
    it('deletes ban record', async () => {
      const owner = await seedOwner(app);
      const user = await seedRegularUser(app);

      await banUser(app.db, user.id, owner.id);

      // Verify ban exists
      const [banBefore] = await app.db.select().from(bans).where(eq(bans.user_id, user.id));
      expect(banBefore).toBeDefined();

      await unbanUser(app.db, user.id);

      // Verify ban removed
      const [banAfter] = await app.db.select().from(bans).where(eq(bans.user_id, user.id));
      expect(banAfter).toBeUndefined();
    });

    it('throws for non-existent ban', async () => {
      await expect(unbanUser(app.db, '00000000-0000-0000-0000-000000000099')).rejects.toThrow('Ban not found');
    });
  });

  describe('resetPassword', () => {
    it('changes password hash, deletes sessions, and returns temp password', async () => {
      const user = await seedRegularUser(app);

      // Create a session
      const refreshToken = generateRefreshToken({ userId: user.id, role: 'user', username: 'regular' });
      await createSession(app.db, user.id, refreshToken);

      const temporaryPassword = await resetPassword(app.db, user.id);

      expect(temporaryPassword).toBeTruthy();
      expect(typeof temporaryPassword).toBe('string');
      expect(temporaryPassword.length).toBeGreaterThan(0);

      // Verify the temp password works with the new hash
      const [updatedUser] = await app.db.select().from(users).where(eq(users.id, user.id));
      expect(updatedUser).toBeDefined();
      const isValid = await verifyPassword(temporaryPassword, updatedUser!.password_hash);
      expect(isValid).toBe(true);

      // Verify sessions deleted
      const userSessions = await app.db.select().from(sessions).where(eq(sessions.user_id, user.id));
      expect(userSessions.length).toBe(0);
    });

    it('throws for non-existent user', async () => {
      await expect(resetPassword(app.db, '00000000-0000-0000-0000-000000000099')).rejects.toThrow('User not found');
    });
  });

  describe('getBannedUsers', () => {
    it('returns all banned users with usernames', async () => {
      const owner = await seedOwner(app);
      const user1 = await seedRegularUser(app, 'banned1');
      const user2 = await seedRegularUser(app, 'banned2');

      await banUser(app.db, user1.id, owner.id);
      await banUser(app.db, user2.id, owner.id);

      const result = await getBannedUsers(app.db);
      expect(result.length).toBe(2);
      expect(result.some(b => b.username === 'banned1')).toBe(true);
      expect(result.some(b => b.username === 'banned2')).toBe(true);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('userId');
      expect(result[0]).toHaveProperty('bannedBy');
      expect(result[0]).toHaveProperty('createdAt');
    });

    it('returns empty array when no bans exist', async () => {
      const result = await getBannedUsers(app.db);
      expect(result).toEqual([]);
    });
  });
});
