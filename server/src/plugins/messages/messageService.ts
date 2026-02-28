import { eq, and, or, lt, desc } from 'drizzle-orm';
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

interface Cursor { t: string; id: string; }

export class InvalidCursorError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidCursorError'; }
}

function encodeCursor(msg: { created_at: Date; id: string }): string {
  return Buffer.from(JSON.stringify({
    t: msg.created_at.toISOString(),
    id: msg.id,
  })).toString('base64url');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCursor(cursor: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (typeof parsed.t !== 'string' || typeof parsed.id !== 'string') throw new Error('invalid types');
    if (isNaN(new Date(parsed.t).getTime())) throw new Error('invalid timestamp');
    if (!UUID_RE.test(parsed.id)) throw new Error('invalid id format');
    return parsed;
  } catch {
    throw new InvalidCursorError('Invalid pagination cursor');
  }
}

export async function createMessage(
  db: AppDatabase,
  params: {
    channelId: string;
    userId: string;
    encryptedContent: string;
    nonce: string;
  },
): Promise<CreateMessageResult> {
  const [row] = await db.insert(messages).values({
    channel_id: params.channelId,
    user_id: params.userId,
    encrypted_content: params.encryptedContent,
    nonce: params.nonce,
  }).returning();

  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    encryptedContent: row.encrypted_content,
    nonce: row.nonce,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getMessagesByChannel(
  db: AppDatabase,
  channelId: string,
  limit = 50,
  cursor?: string,
): Promise<{ rows: (typeof messages.$inferSelect)[]; nextCursor: string | null }> {
  const conditions = [eq(messages.channel_id, channelId)];

  if (cursor) {
    const { t, id } = decodeCursor(cursor);
    const ts = new Date(t);
    const cursorCondition = or(
      lt(messages.created_at, ts),
      and(eq(messages.created_at, ts), lt(messages.id, id))
    );
    if (!cursorCondition) throw new InvalidCursorError('Failed to build cursor condition');
    conditions.push(cursorCondition);
  }

  const rows = await db.select().from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.created_at), desc(messages.id))
    .limit(limit);

  const nextCursor = rows.length === limit
    ? encodeCursor(rows[rows.length - 1])
    : null;

  return { rows, nextCursor };
}
