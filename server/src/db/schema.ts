import { pgTable, pgEnum, text, uuid, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// --- Enums ---
export const roleEnum = pgEnum('role', ['owner', 'user']);
export const channelTypeEnum = pgEnum('channel_type', ['text', 'voice']);

// --- Users ---
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('user'),
  public_key: text('public_key'),
  encrypted_group_key: text('encrypted_group_key'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// --- Sessions ---
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refresh_token_hash: text('refresh_token_hash').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_sessions_user_id').on(table.user_id),
  index('idx_sessions_token_hash').on(table.refresh_token_hash),
]).enableRLS();

// --- Invites ---
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  revoked: boolean('revoked').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// --- Bans ---
export const bans = pgTable('bans', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  banned_by: uuid('banned_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_bans_user_id').on(table.user_id),
]).enableRLS();

// --- Channels ---
export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  type: channelTypeEnum('type').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_channels_type').on(table.type),
]).enableRLS();

// --- Messages ---
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel_id: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encrypted_content: text('encrypted_content').notNull(),
  nonce: text('nonce').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Composite index covers channel_id prefix queries — no standalone indexes needed
  index('messages_channel_created_idx').on(table.channel_id, table.created_at, table.id),
]).enableRLS();

// --- Message Reactions ---
export const messageReactions = pgTable('message_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  message_id: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_message_reactions_message_user_emoji').on(table.message_id, table.user_id, table.emoji),
  index('idx_message_reactions_message_id').on(table.message_id),
]).enableRLS();

// --- Inferred Types ---
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

export type Invite = InferSelectModel<typeof invites>;
export type NewInvite = InferInsertModel<typeof invites>;

export type Ban = InferSelectModel<typeof bans>;
export type NewBan = InferInsertModel<typeof bans>;

export type Channel = InferSelectModel<typeof channels>;
export type NewChannel = InferInsertModel<typeof channels>;

export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;

export type MessageReaction = InferSelectModel<typeof messageReactions>;
export type NewMessageReaction = InferInsertModel<typeof messageReactions>;