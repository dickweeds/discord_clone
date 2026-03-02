import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';
import type { UserPublic } from 'discord-clone-shared';

export interface UserSelf {
  id: string;
  username: string;
  role: 'owner' | 'user';
  avatarUrl?: string;
  createdAt: string;
}

function mapAvatarUrl<T extends { avatarUrl: string | null }>(row: T): Omit<T, 'avatarUrl'> & { avatarUrl?: string } {
  const { avatarUrl, ...rest } = row;
  return {
    ...rest,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

export async function getAllUsers(db: AppDatabase): Promise<UserPublic[]> {
  const rows = await db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    avatarUrl: users.avatar_url,
    createdAt: users.created_at,
  }).from(users);

  return rows.map((row) => mapAvatarUrl({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getUserById(db: AppDatabase, userId: string): Promise<UserSelf | null> {
  const [row] = await db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    avatarUrl: users.avatar_url,
    createdAt: users.created_at,
  }).from(users).where(eq(users.id, userId));

  if (!row) return null;
  return mapAvatarUrl({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function updateUserAvatarUrl(
  db: AppDatabase,
  userId: string,
  avatarUrl: string | null,
): Promise<UserSelf | null> {
  const [updated] = await db.update(users)
    .set({ avatar_url: avatarUrl })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      username: users.username,
      role: users.role,
      avatarUrl: users.avatar_url,
      createdAt: users.created_at,
    });

  if (!updated) return null;
  return mapAvatarUrl({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
  });
}
