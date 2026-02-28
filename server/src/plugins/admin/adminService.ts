import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection.js';
import { users, bans, type User, type Ban } from '../../db/schema.js';
import { deleteUserSessions } from '../auth/sessionService.js';
import { hashPassword } from '../auth/authService.js';
import { removeUser as removePresence } from '../presence/presenceService.js';

export class UserNotFoundError extends Error {
  constructor() {
    super('User not found');
    this.name = 'UserNotFoundError';
  }
}

export class BanNotFoundError extends Error {
  constructor() {
    super('Ban not found');
    this.name = 'BanNotFoundError';
  }
}

export class UserAlreadyBannedError extends Error {
  constructor() {
    super('User is already banned');
    this.name = 'UserAlreadyBannedError';
  }
}

export interface BannedUser {
  id: string;
  userId: string;
  username: string;
  bannedBy: string;
  createdAt: Date;
}

export async function kickUser(db: AppDatabase, userId: string): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new UserNotFoundError();
  }
  await deleteUserSessions(db, userId);
  removePresence(userId);
  return user;
}

export async function banUser(db: AppDatabase, userId: string, bannedBy: string): Promise<Ban> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new UserNotFoundError();
  }
  const [existingBan] = await db.select().from(bans).where(eq(bans.user_id, userId));
  if (existingBan) {
    throw new UserAlreadyBannedError();
  }
  const [ban] = await db.insert(bans).values({
    user_id: userId,
    banned_by: bannedBy,
  }).returning();
  await deleteUserSessions(db, userId);
  removePresence(userId);
  return ban;
}

export async function unbanUser(db: AppDatabase, userId: string): Promise<void> {
  const [ban] = await db.select().from(bans).where(eq(bans.user_id, userId));
  if (!ban) {
    throw new BanNotFoundError();
  }
  await db.delete(bans).where(eq(bans.user_id, userId));
}

export async function resetPassword(db: AppDatabase, userId: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new UserNotFoundError();
  }
  const temporaryPassword = crypto.randomBytes(16).toString('base64url');
  const newHash = await hashPassword(temporaryPassword);
  await db.update(users).set({ password_hash: newHash }).where(eq(users.id, userId));
  await deleteUserSessions(db, userId);
  return temporaryPassword;
}

export async function getBannedUsers(db: AppDatabase): Promise<BannedUser[]> {
  return await db
    .select({
      id: bans.id,
      userId: bans.user_id,
      username: users.username,
      bannedBy: bans.banned_by,
      createdAt: bans.created_at,
    })
    .from(bans)
    .innerJoin(users, eq(bans.user_id, users.id));
}
