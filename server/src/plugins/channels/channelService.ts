import { eq, sql } from 'drizzle-orm';
import { MAX_CHANNELS_PER_SERVER } from 'discord-clone-shared';
import { channels, messages } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';

export async function getAllChannels(db: AppDatabase) {
  return await db.select({
    id: channels.id,
    name: channels.name,
    type: channels.type,
    createdAt: channels.created_at,
  }).from(channels);
}

export async function getChannelById(db: AppDatabase, channelId: string) {
  const [channel] = await db.select({
    id: channels.id,
    name: channels.name,
    type: channels.type,
  }).from(channels).where(eq(channels.id, channelId));

  return channel ?? null;
}

export async function createChannel(db: AppDatabase, name: string, type: 'text' | 'voice') {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 50) {
    throw new ChannelValidationError('Channel name must be between 1 and 50 characters');
  }

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(channels);
  if (countResult && Number(countResult.count) >= MAX_CHANNELS_PER_SERVER) {
    throw new ChannelValidationError(`Channel limit reached (max ${MAX_CHANNELS_PER_SERVER})`);
  }

  const [existing] = await db.select({ id: channels.id }).from(channels).where(eq(channels.name, trimmed));
  if (existing) {
    throw new ChannelValidationError('A channel with this name already exists');
  }

  const [channel] = await db.insert(channels).values({
    name: trimmed,
    type,
  }).returning({
    id: channels.id,
    name: channels.name,
    type: channels.type,
    createdAt: channels.created_at,
  });

  return channel;
}

export async function deleteChannel(db: AppDatabase, channelId: string) {
  const [channel] = await db.select({ id: channels.id }).from(channels).where(eq(channels.id, channelId));
  if (!channel) {
    throw new ChannelNotFoundError('Channel not found');
  }

  await db.transaction(async (tx) => {
    await tx.delete(messages).where(eq(messages.channel_id, channelId));
    await tx.delete(channels).where(eq(channels.id, channelId));
  });
}

export class ChannelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelValidationError';
  }
}

export class ChannelNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelNotFoundError';
  }
}
