import { eq } from 'drizzle-orm';
import { users, channels } from './schema.js';
import { hashPassword } from '../plugins/auth/authService.js';
import type { AppDatabase } from './connection.js';

export async function runSeed(db: AppDatabase, logger?: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  const log = logger ?? { info: () => {}, warn: () => {} };

  // Check if owner already exists
  const existingOwner = db.select().from(users).where(eq(users.role, 'owner')).get();
  if (existingOwner) {
    log.info('Seeding skipped — owner already exists');
    return;
  }

  const ownerUsername = process.env.OWNER_USERNAME;
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerUsername || !ownerPassword) {
    log.warn('OWNER_USERNAME and OWNER_PASSWORD not set — skipping owner creation');
    return;
  }

  const passwordHash = await hashPassword(ownerPassword);
  db.insert(users).values({
    username: ownerUsername,
    password_hash: passwordHash,
    role: 'owner',
  }).run();
  log.info('Owner account created');

  // Seed default channels
  db.insert(channels).values([
    { name: 'general', type: 'text' },
    { name: 'Gaming', type: 'voice' },
  ]).run();
  log.info('Default channels seeded');
}
