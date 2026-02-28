import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, type AppDatabase } from './connection.js';
import { users, sessions, invites, bans, channels } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

describe('Database Connection', () => {
  let testDb: AppDatabase;
  let closeDb: () => Promise<void>;

  afterEach(async () => {
    if (closeDb) await closeDb();
  });

  it('creates an in-memory PGlite database connection', async () => {
    const result = createDatabase();
    testDb = result.db;
    closeDb = result.close;

    expect(testDb).toBeDefined();
  });

  it('runs migrations successfully', async () => {
    const result = createDatabase();
    testDb = result.db;
    closeDb = result.close;

    await result.migrate(migrationsFolder);

    // Verify tables exist by querying pg_tables
    const { sql: sqlTag } = await import('drizzle-orm');
    const tables = await testDb.execute(
      sqlTag`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '__drizzle%' ORDER BY tablename`,
    );
    // PGlite returns results as rows
    expect(tables).toBeDefined();
  });

  describe('CRUD operations', () => {
    async function setupTestDb(): Promise<void> {
      const result = createDatabase();
      testDb = result.db;
      closeDb = result.close;
      await result.migrate(migrationsFolder);
    }

    it('inserts and selects a user', async () => {
      await setupTestDb();

      await testDb.insert(users).values({
        username: 'testuser',
        password_hash: 'hashed_password',
        role: 'user',
      });

      const allUsers = await testDb.select().from(users);
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].username).toBe('testuser');
      expect(allUsers[0].password_hash).toBe('hashed_password');
      expect(allUsers[0].role).toBe('user');
      expect(allUsers[0].id).toBeDefined();
      expect(allUsers[0].created_at).toBeInstanceOf(Date);
    });

    it('inserts and selects a session', async () => {
      await setupTestDb();

      // Create a user first (FK requirement)
      const [user] = await testDb.insert(users).values({
        username: 'sessionuser',
        password_hash: 'hash',
      }).returning();

      await testDb.insert(sessions).values({
        user_id: user.id,
        refresh_token_hash: 'refresh_hash',
        expires_at: new Date(Date.now() + 86400000),
      });

      const allSessions = await testDb.select().from(sessions);
      expect(allSessions).toHaveLength(1);
      expect(allSessions[0].user_id).toBe(user.id);
      expect(allSessions[0].refresh_token_hash).toBe('refresh_hash');
      expect(allSessions[0].expires_at).toBeInstanceOf(Date);
    });

    it('inserts and selects an invite', async () => {
      await setupTestDb();

      const [user] = await testDb.insert(users).values({
        username: 'inviter',
        password_hash: 'hash',
      }).returning();

      await testDb.insert(invites).values({
        token: 'unique-invite-token',
        created_by: user.id,
      });

      const allInvites = await testDb.select().from(invites);
      expect(allInvites).toHaveLength(1);
      expect(allInvites[0].token).toBe('unique-invite-token');
      expect(allInvites[0].created_by).toBe(user.id);
      expect(allInvites[0].revoked).toBe(false);
    });

    it('inserts and selects a ban', async () => {
      await setupTestDb();

      const [admin] = await testDb.insert(users).values({
        username: 'admin',
        password_hash: 'hash',
        role: 'owner',
      }).returning();

      const [banned] = await testDb.insert(users).values({
        username: 'banned_user',
        password_hash: 'hash',
      }).returning();

      await testDb.insert(bans).values({
        user_id: banned.id,
        banned_by: admin.id,
      });

      const allBans = await testDb.select().from(bans);
      expect(allBans).toHaveLength(1);
      expect(allBans[0].user_id).toBe(banned.id);
      expect(allBans[0].banned_by).toBe(admin.id);
    });

    it('inserts and selects channels', async () => {
      await setupTestDb();

      await testDb.insert(channels).values({
        name: 'general',
        type: 'text',
      });

      await testDb.insert(channels).values({
        name: 'voice-chat',
        type: 'voice',
      });

      const allChannels = await testDb.select().from(channels);
      expect(allChannels).toHaveLength(2);
      expect(allChannels.map((c) => c.name)).toContain('general');
      expect(allChannels.map((c) => c.type)).toContain('text');
      expect(allChannels.map((c) => c.type)).toContain('voice');
    });
  });

  describe('Foreign key constraints', () => {
    async function setupTestDb(): Promise<void> {
      const result = createDatabase();
      testDb = result.db;
      closeDb = result.close;
      await result.migrate(migrationsFolder);
    }

    it('rejects session with non-existent user_id', async () => {
      await setupTestDb();

      await expect(
        testDb.insert(sessions).values({
          user_id: '00000000-0000-0000-0000-000000000000',
          refresh_token_hash: 'hash',
          expires_at: new Date(Date.now() + 86400000),
        }),
      ).rejects.toThrow();
    });

    it('rejects invite with non-existent created_by', async () => {
      await setupTestDb();

      await expect(
        testDb.insert(invites).values({
          token: 'invite-token',
          created_by: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow();
    });

    it('rejects ban with non-existent user_id', async () => {
      await setupTestDb();

      const [admin] = await testDb.insert(users).values({
        username: 'admin',
        password_hash: 'hash',
        role: 'owner',
      }).returning();

      await expect(
        testDb.insert(bans).values({
          user_id: '00000000-0000-0000-0000-000000000000',
          banned_by: admin.id,
        }),
      ).rejects.toThrow();
    });

    it('rejects ban with non-existent banned_by', async () => {
      await setupTestDb();

      const [user] = await testDb.insert(users).values({
        username: 'user',
        password_hash: 'hash',
      }).returning();

      await expect(
        testDb.insert(bans).values({
          user_id: user.id,
          banned_by: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow();
    });
  });
});
