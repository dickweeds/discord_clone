import postgres from 'postgres';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as pgMigrate } from 'drizzle-orm/postgres-js/migrator';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

// The `any` for the HKT slot is intentional — postgres.js and PGlite return
// compatible query builders but their HKT types differ. The difference is
// encapsulated here so callers get a single unified type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppDatabase = PgDatabase<any, typeof schema>;

export interface DatabaseConnection {
  db: AppDatabase;
  close: () => Promise<void>;
  migrate: (folder: string) => Promise<void>;
}

function validateConnectionUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid DATABASE_URL: malformed URL`);
  }

  if (!parsed.protocol.startsWith('postgres')) {
    throw new Error(`Invalid DATABASE_URL: protocol must be postgres or postgresql`);
  }

  if (parsed.hostname.includes('supabase.com') && !url.includes('sslmode=require')) {
    throw new Error(`Supabase DATABASE_URL must include sslmode=require`);
  }
}

export function createDatabase(connectionString?: string): DatabaseConnection {
  const connectionUrl = connectionString ?? process.env.DATABASE_URL;

  if (connectionUrl) {
    validateConnectionUrl(connectionUrl);

    const client = postgres(connectionUrl, {
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || '20', 10),
      connect_timeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10', 10),
      max_lifetime: 60 * 30, // 30 min — rotate connections to handle Supabase infra updates
      onnotice: (notice) => {
        // Suppress Supabase's automatic RLS reminder notices
        if (notice.message?.includes('row-level security') || notice.message?.includes('RLS')) return;
        // Log all other Postgres notices — they may indicate real issues
        console.warn('[postgres notice]', notice.message);
      },
      connection: {
        statement_timeout: 30000, // 30 seconds — prevent slow queries from holding pool connections
      },
    });

    const db = drizzlePostgres(client, { schema }) as unknown as AppDatabase;

    const migrate = async (folder: string): Promise<void> => {
      // Migration runner uses a separate connection without statement_timeout
      // to avoid DDL operations hitting the 30s limit
      const migrationClient = postgres(connectionUrl, {
        max: 1,
        onnotice: () => {},
      });
      const migrationDb = drizzlePostgres(migrationClient, { schema });
      await pgMigrate(migrationDb, { migrationsFolder: folder });
      await migrationClient.end();
    };

    return {
      db,
      close: () => client.end(),
      migrate,
    };
  }

  // PGlite mode — in-memory Postgres for tests (no DATABASE_URL set)
  const pglite = new PGlite();
  const pgliteDb = drizzlePglite(pglite, { schema });
  const db = pgliteDb as unknown as AppDatabase;

  return {
    db,
    close: () => pglite.close(),
    migrate: (folder: string) => pgliteMigrate(pgliteDb, { migrationsFolder: folder }),
  };
}
