import { asc } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection.js';
import { users } from '../../db/schema.js';
import type { UserPublic } from 'discord-clone-shared';

export function getAllUsers(db: AppDatabase): UserPublic[] {
  const rows = db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.created_at,
    })
    .from(users)
    .orderBy(asc(users.username))
    .all();

  return rows.map((user) => ({
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }));
}
