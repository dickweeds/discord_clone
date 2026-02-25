import { asc } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection.js';
import { channels } from '../../db/schema.js';
import type { Channel } from 'discord-clone-shared';

export function getAllChannels(db: AppDatabase): Channel[] {
  const rows = db
    .select()
    .from(channels)
    .orderBy(asc(channels.type), asc(channels.name))
    .all();

  return rows.map((channel) => ({
    id: channel.id,
    serverId: 'default',
    name: channel.name,
    type: channel.type,
    position: 0,
    createdAt: channel.created_at.toISOString(),
    updatedAt: channel.created_at.toISOString(),
  }));
}
