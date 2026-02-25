import { users } from '../../db/schema.js';
import type { AppDatabase } from '../../db/connection.js';

export function getAllUsers(db: AppDatabase) {
  return db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    createdAt: users.created_at,
  }).from(users).all();
}
