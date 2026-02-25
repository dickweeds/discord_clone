import { eq } from 'drizzle-orm';
import { channels } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';

export function getAllChannels(db: AppDatabase) {
  return db.select({
    id: channels.id,
    name: channels.name,
    type: channels.type,
    createdAt: channels.created_at,
  }).from(channels).all();
}

export function getChannelById(db: AppDatabase, channelId: string) {
  return db.select({
    id: channels.id,
    name: channels.name,
    type: channels.type,
  }).from(channels).where(eq(channels.id, channelId)).get();
}
