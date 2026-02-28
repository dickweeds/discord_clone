import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { invites } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';
import type { Invite } from '../../db/schema.js';

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createInvite(db: AppDatabase, createdBy: string): Promise<Invite> {
  const token = generateInviteToken();
  const [invite] = await db
    .insert(invites)
    .values({ token, created_by: createdBy })
    .returning();
  return invite;
}

export async function revokeInvite(db: AppDatabase, inviteId: string): Promise<boolean> {
  const result = await db.update(invites)
    .set({ revoked: true })
    .where(eq(invites.id, inviteId))
    .returning({ id: invites.id });
  return result.length > 0;
}

export async function validateInvite(
  db: AppDatabase,
  token: string,
): Promise<{ valid: boolean; serverName: string }> {
  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.token, token));

  if (!invite || invite.revoked) {
    return { valid: false, serverName: '' };
  }

  const serverName = process.env.SERVER_NAME || 'discord_clone';
  return { valid: true, serverName };
}

export async function getInvites(db: AppDatabase): Promise<Invite[]> {
  return await db.select().from(invites);
}
