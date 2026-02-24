import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

vi.stubEnv('JWT_ACCESS_SECRET', 'test-secret-key-for-testing');

import { createDatabase } from './connection.js';
import { runMigrations } from './migrate.js';
import { runSeed } from './seed.js';
import { users, channels } from './schema.js';
import type { AppDatabase } from './connection.js';

function setupTestDb(): AppDatabase {
  const { db } = createDatabase(':memory:');
  runMigrations(db);
  return db;
}

describe('runSeed', () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = setupTestDb();
  });

  it('should create owner account with correct credentials on first run', async () => {
    vi.stubEnv('OWNER_USERNAME', 'testadmin');
    vi.stubEnv('OWNER_PASSWORD', 'testpassword123');

    await runSeed(db);

    const owner = db.select().from(users).where(eq(users.role, 'owner')).get();
    expect(owner).toBeDefined();
    expect(owner!.username).toBe('testadmin');
    expect(owner!.password_hash).toMatch(/^\$2b\$12\$/);
    expect(owner!.role).toBe('owner');
  });

  it('should seed default channels on first run', async () => {
    vi.stubEnv('OWNER_USERNAME', 'testadmin');
    vi.stubEnv('OWNER_PASSWORD', 'testpassword123');

    await runSeed(db);

    const allChannels = db.select().from(channels).all();
    expect(allChannels).toHaveLength(2);

    const general = allChannels.find(c => c.name === 'general');
    const gaming = allChannels.find(c => c.name === 'Gaming');

    expect(general).toBeDefined();
    expect(general!.type).toBe('text');
    expect(gaming).toBeDefined();
    expect(gaming!.type).toBe('voice');
  });

  it('should skip seeding when owner already exists', async () => {
    vi.stubEnv('OWNER_USERNAME', 'testadmin');
    vi.stubEnv('OWNER_PASSWORD', 'testpassword123');

    // First seed
    await runSeed(db);

    // Verify initial state
    const ownersBefore = db.select().from(users).where(eq(users.role, 'owner')).all();
    expect(ownersBefore).toHaveLength(1);

    // Second seed should be a no-op
    await runSeed(db);

    const ownersAfter = db.select().from(users).where(eq(users.role, 'owner')).all();
    expect(ownersAfter).toHaveLength(1);

    // Channels should still be 2 (not doubled)
    const allChannels = db.select().from(channels).all();
    expect(allChannels).toHaveLength(2);
  });

  it('should skip when env vars are missing and log warning', async () => {
    vi.stubEnv('OWNER_USERNAME', '');
    vi.stubEnv('OWNER_PASSWORD', '');

    const warnMessages: string[] = [];
    const logger = {
      info: () => {},
      warn: (msg: string) => { warnMessages.push(msg); },
    };

    await runSeed(db, logger);

    const allUsers = db.select().from(users).all();
    expect(allUsers).toHaveLength(0);
    expect(warnMessages.length).toBeGreaterThan(0);
  });
});
