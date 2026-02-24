import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { invites } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';
import type { Invite } from '../../db/schema.js';

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function createInvite(db: AppDatabase, createdBy: string): Invite {
  const token = generateInviteToken();
  return db
    .insert(invites)
    .values({ token, created_by: createdBy })
    .returning()
    .get();
}

export function revokeInvite(db: AppDatabase, inviteId: string): void {
  db.update(invites)
    .set({ revoked: true })
    .where(eq(invites.id, inviteId))
    .run();
}

export function validateInvite(
  db: AppDatabase,
  token: string,
): { valid: boolean; serverName: string } {
  const invite = db
    .select()
    .from(invites)
    .where(eq(invites.token, token))
    .get();

  if (!invite || invite.revoked) {
    return { valid: false, serverName: '' };
  }

  const serverName = process.env.SERVER_NAME || 'discord_clone';
  return { valid: true, serverName };
}

export function getInvites(db: AppDatabase): Invite[] {
  return db.select().from(invites).all();
}
