import { eq, sql } from 'drizzle-orm';
import { messages } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';

export interface CreateMessageResult {
  id: string;
  channelId: string;
  userId: string;
  encryptedContent: string;
  nonce: string;
  createdAt: string;
}

export function createMessage(
  db: AppDatabase,
  channelId: string,
  userId: string,
  encryptedContent: string,
  nonce: string,
): CreateMessageResult {
  const row = db.insert(messages).values({
    channel_id: channelId,
    user_id: userId,
    encrypted_content: encryptedContent,
    nonce,
  }).returning().get();

  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    encryptedContent: row.encrypted_content,
    nonce: row.nonce,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at as unknown as number * 1000).toISOString(),
  };
}

export function getMessagesByChannel(
  db: AppDatabase,
  channelId: string,
  limit = 50,
  before?: string,
) {
  // Use rowid for stable ordering (handles same-second timestamps)
  if (before) {
    return db.select()
      .from(messages)
      .where(sql`${messages.channel_id} = ${channelId} AND rowid < (SELECT rowid FROM messages WHERE id = ${before})`)
      .orderBy(sql`rowid DESC`)
      .limit(limit)
      .all();
  }

  return db.select()
    .from(messages)
    .where(eq(messages.channel_id, channelId))
    .orderBy(sql`rowid DESC`)
    .limit(limit)
    .all();
}
