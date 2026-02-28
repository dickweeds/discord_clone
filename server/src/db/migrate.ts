import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

export async function runMigrations(migrate: (folder: string) => Promise<void>): Promise<void> {
  await migrate(migrationsFolder);
}
