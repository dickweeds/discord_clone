import { eq, and, inArray } from 'drizzle-orm';
import type { ReactionSummary } from 'discord-clone-shared';
import { messageReactions } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';

export type { ReactionSummary };

export interface ReactionResult {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export async function addReaction(
  db: AppDatabase,
  params: { messageId: string; userId: string; emoji: string },
): Promise<ReactionResult> {
  const rows = await db.insert(messageReactions).values({
    message_id: params.messageId,
    user_id: params.userId,
    emoji: params.emoji,
  }).onConflictDoNothing({
    target: [messageReactions.message_id, messageReactions.user_id, messageReactions.emoji],
  }).returning();

  if (rows.length > 0) {
    const row = rows[0];
    return {
      id: row.id,
      messageId: row.message_id,
      userId: row.user_id,
      emoji: row.emoji,
      createdAt: row.created_at.toISOString(),
    };
  }

  // Duplicate — return existing
  const [existing] = await db.select().from(messageReactions).where(
    and(
      eq(messageReactions.message_id, params.messageId),
      eq(messageReactions.user_id, params.userId),
      eq(messageReactions.emoji, params.emoji),
    ),
  );
  return {
    id: existing.id,
    messageId: existing.message_id,
    userId: existing.user_id,
    emoji: existing.emoji,
    createdAt: existing.created_at.toISOString(),
  };
}

export async function removeReaction(
  db: AppDatabase,
  params: { messageId: string; userId: string; emoji: string },
): Promise<boolean> {
  const deleted = await db.delete(messageReactions).where(
    and(
      eq(messageReactions.message_id, params.messageId),
      eq(messageReactions.user_id, params.userId),
      eq(messageReactions.emoji, params.emoji),
    ),
  ).returning();

  return deleted.length > 0;
}

export async function getReactionsForMessages(
  db: AppDatabase,
  messageIds: string[],
): Promise<Map<string, ReactionSummary[]>> {
  const result = new Map<string, ReactionSummary[]>();

  if (messageIds.length === 0) return result;

  const rows = await db.select().from(messageReactions)
    .where(inArray(messageReactions.message_id, messageIds))
    .orderBy(messageReactions.created_at);

  const grouped = new Map<string, Map<string, string[]>>();
  for (const row of rows) {
    let msgMap = grouped.get(row.message_id);
    if (!msgMap) {
      msgMap = new Map();
      grouped.set(row.message_id, msgMap);
    }
    let userIds = msgMap.get(row.emoji);
    if (!userIds) {
      userIds = [];
      msgMap.set(row.emoji, userIds);
    }
    userIds.push(row.user_id);
  }

  for (const [messageId, emojiMap] of grouped) {
    const summaries: ReactionSummary[] = [];
    for (const [emoji, userIds] of emojiMap) {
      summaries.push({ emoji, count: userIds.length, userIds });
    }
    result.set(messageId, summaries);
  }

  return result;
}
