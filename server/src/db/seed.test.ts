import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
});

import { createDatabase } from './connection.js';
import { runSeed } from './seed.js';
import { channels } from './schema.js';
import type { AppDatabase } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

describe('runSeed', () => {
  let db: AppDatabase;
  let closeDb: () => Promise<void>;

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
    await db.execute(sql`TRUNCATE TABLE messages, sessions, bans, invites, channels, users CASCADE`);
  });

  it('should seed default channels on empty database', async () => {
    await runSeed(db);

    const allChannels = await db.select().from(channels);
    expect(allChannels).toHaveLength(2);

    const general = allChannels.find((c: typeof allChannels[0]) => c.name === 'general');
    const gaming = allChannels.find((c: typeof allChannels[0]) => c.name === 'Gaming');

    expect(general).toBeDefined();
    expect(general!.type).toBe('text');
    expect(gaming).toBeDefined();
    expect(gaming!.type).toBe('voice');
  });

  it('should be idempotent (running twice does not duplicate channels)', async () => {
    await runSeed(db);
    await runSeed(db);

    const allChannels = await db.select().from(channels);
    expect(allChannels).toHaveLength(2);
  });

  it('should skip seeding when channels already exist', async () => {
    // Manually insert a channel
    await db.insert(channels).values({ name: 'existing', type: 'text' });

    const infoMessages: string[] = [];
    const logger = {
      info: (msg: string) => { infoMessages.push(msg); },
      warn: () => {},
    };

    await runSeed(db, logger);

    // Should not have added default channels
    const allChannels = await db.select().from(channels);
    expect(allChannels).toHaveLength(1);
    expect(allChannels[0].name).toBe('existing');
    expect(infoMessages).toContain('Seeding skipped — channels already exist');
  });
});
