---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-02-27'
inputDocuments:
  - architecture.md
  - prd.md
  - data-models-server.md
  - architecture-server.md
  - project-context.md
workflowType: 'architecture-migration'
project_name: 'discord_clone'
user_name: 'dickweeds'
date: '2026-02-27'
parentArchitecture: 'architecture.md'
---

# Supabase Migration Architecture — SQLite to Managed PostgreSQL

_Migration architecture document for transitioning discord_clone from embedded SQLite (better-sqlite3) to Supabase-hosted PostgreSQL. This is an additive document — the [original architecture](./architecture.md) remains the source of truth for all non-database decisions._

## Migration Scope & Boundaries

### What Changes

| Layer | Current | Target | Effort |
|-------|---------|--------|--------|
| Database engine | SQLite (embedded file) | PostgreSQL 15+ (Supabase-hosted) | Core change |
| SQLite driver | `better-sqlite3` (sync) | `postgres` / `@supabase/supabase-js` (async) | Medium |
| Drizzle dialect | `drizzle-orm/sqlite-core` | `drizzle-orm/pg-core` | Low |
| Drizzle driver | `drizzle-orm/better-sqlite3` | `drizzle-orm/postgres-js` | Low |
| Schema definitions | `sqliteTable` | `pgTable` | Low |
| Type mappings | `integer` booleans, `text` UUIDs, `integer` timestamps | `boolean`, `uuid`, `timestamp` | Low |
| Connection setup | Synchronous `new Database()` | Async `postgres()` connection | Low |
| Service layer calls | Synchronous `db.*.get()` / `.all()` / `.run()` | Async `await db.*.` | Medium |
| Migration tooling | `drizzle-orm/better-sqlite3/migrator` | `drizzle-orm/postgres-js/migrator` | Trivial |
| Drizzle config | `dialect: 'sqlite'` | `dialect: 'postgresql'` | Trivial |
| Docker volume | `./data/sqlite:/app/data` | Removed (database is external) | Trivial |
| Environment config | `DATABASE_PATH` (file path) | `DATABASE_URL` (connection string) | Trivial |
| Test database | In-memory SQLite (`:memory:`) | PGlite in-process Postgres (no Docker dependency for tests) | Low |
| SQLite PRAGMAs | WAL mode, foreign keys | Removed (Postgres handles natively) | Trivial |
| Backup strategy | File copy of `.db` file | Supabase automatic backups + `pg_dump` | Trivial |

### What Does NOT Change

Everything else. Specifically:

- **Fastify server** — same framework, same plugin architecture, same routes
- **Custom JWT auth** — same access/refresh token system, same bcrypt, same session table
- **WebSocket layer** — same Fastify WebSocket, same message routing, same handlers
- **mediasoup SFU** — voice/video completely unaffected (no DB dependency)
- **E2E encryption** — same libsodium, same client-side encrypt/decrypt, same opaque ciphertext storage
- **Electron client** — minimal changes limited to pagination cursor handling, transient error retry, and `TEXT_ERROR` WebSocket frame support (no UI redesign, no new features)
- **Nginx / coturn / certbot** — unchanged
- **Most API contracts** — same REST endpoints, same response envelopes. Exception: message list endpoint changes `before` (message ID) query param to `cursor` (opaque string) and adds `cursor` field to response
- **Supabase Auth** — NOT adopted. We keep our custom auth system.
- **Supabase Realtime** — NOT adopted. We keep our custom WebSocket layer.
- **Supabase client SDK** — NOT used in application code. Drizzle ORM talks directly to Postgres via connection string.

### Decision Rationale

**Why Supabase as managed Postgres (Option 4), not full Supabase adoption:**

1. **Minimal blast radius** — Only the database layer changes. Auth, WebSocket, and encryption remain untouched. This is a surgical swap, not a rewrite.
2. **No auth migration risk** — Our custom JWT + session + E2E key distribution system is battle-tested. Supabase Auth would require rethinking `encrypted_group_key` distribution and invite flow.
3. **No WebSocket conflict** — We already have a mature WS layer with custom message routing. Supabase Realtime would be redundant and add a second real-time transport to maintain.
4. **What we gain** — Managed backups, point-in-time recovery, a dashboard for inspecting data, connection pooling, and the ability to scale storage independently from the EC2 compute instance.
5. **What we lose** — Zero-dependency embedded database (SQLite). We now have a network hop to Supabase for every query. Acceptable for a 20-user app where text latency target is <1s.

---

## Core Architectural Decisions

### Decision 1: Database Driver — `postgres` (postgres.js)

| Option | Pros | Cons |
|--------|------|------|
| **`postgres` (postgres.js) — SELECTED** | Fastest Node.js Postgres driver, native ESM, zero dependencies, built-in connection pooling, first-class Drizzle support | Less established than `pg` |
| `pg` (node-postgres) | Most established, massive ecosystem | Callback-based API, needs `@types/pg`, heavier |
| `@supabase/supabase-js` | Supabase-native, includes auth/realtime/storage | Adds Supabase SDK dependency we don't need, bypasses Drizzle ORM, different query API |

**Rationale:** `postgres` is the recommended driver for Drizzle + PostgreSQL. It's fast, ESM-native (matches our `"type": "module"` setup), and has built-in connection pooling. We're using Supabase purely as managed Postgres, so the Supabase client SDK is unnecessary overhead.

**Connection string format:**
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Supabase provides two connection modes:
- **Transaction mode (port 6543)** — Connection pooling via Supavisor. Best for serverless. Each query may use a different connection.
- **Session mode (port 5432)** — Dedicated connection. Supports prepared statements and transactions.

**Selected: Session mode (port 5432)** — Our Fastify server is a long-lived process, not serverless. Session mode gives us full transaction support (needed for first-user registration race condition protection) and prepared statements.

### Decision 2: Schema Translation Strategy

**Drizzle makes this straightforward.** The schema changes are mechanical:

| SQLite (current) | PostgreSQL (target) | Notes |
|-------------------|---------------------|-------|
| `sqliteTable` | `pgTable` | Import swap |
| `text('id')` for UUIDs | `uuid('id')` | Native UUID type, use `defaultRandom()` |
| `integer('created_at', { mode: 'timestamp' })` | `timestamp('created_at', { withTimezone: true })` | Native timestamp with timezone |
| `integer('revoked', { mode: 'boolean' })` | `boolean('revoked')` | Native boolean |
| `text('role', { enum: [...] })` | `pgEnum` or `text` with check | Native enum support |
| `sql\`(unixepoch())\`` | `defaultNow()` | Postgres built-in |
| `index(...)` | `index(...)` | Same Drizzle API |
| `.unique()` | `.unique()` | Same Drizzle API |
| `.references()` | `.references()` | Same Drizzle API, Postgres enforces natively |

### Decision 3: Sync-to-Async Migration Strategy

This is the most impactful change. `better-sqlite3` is synchronous — all DB calls return values directly. `postgres` is async — all calls return Promises.

**Approach: Add `await` to all Drizzle calls, make calling functions `async`.**

The good news: most service functions are already `async` (because they're called from async Fastify route handlers). The main change is adding `await` before `db.*` calls.

**Pattern before (sync):**
```typescript
const user = db.insert(users).values({ ... }).returning().get();
```

**Pattern after (async):**
```typescript
const [user] = await db.insert(users).values({ ... }).returning();
```

**Key difference:** SQLite's `.get()` returns a single row. Postgres returns an array. We destructure `[user]` to get the single row.

**Affected methods:**
| SQLite method | Postgres equivalent |
|---------------|-------------------|
| `.get()` | `[result] = await ...` (destructure first element) |
| `.all()` | `await ...` (already returns array) |
| `.run()` | `await ...` |
| `.returning().get()` | `[result] = await .returning()` |

### Decision 4: Migration Data Strategy

**Fresh start — no data migration.**

Rationale:
- This is a 20-user app with encrypted messages. There's no way to "migrate" encrypted content meaningfully — the ciphertext is portable but the message history isn't critical enough to justify a migration script.
- User accounts can be re-created via invite flow.
- The schema is small (6 tables) — seeding fresh is trivial.
- If the owner wants to preserve data: export SQLite rows via script, transform timestamps, and insert into Postgres. But this is optional and can be a separate utility.

**Schema migration: regenerate from scratch.**
- Delete existing `server/drizzle/` migration files
- Run `drizzle-kit generate` against the new Postgres schema
- This creates a clean initial Postgres migration

### Decision 5: Test Database Strategy

| Option | Pros | Cons |
|--------|------|------|
| Local Postgres via Docker | Fast, isolated, matches production, free, no network latency | Requires Docker for local dev — friction for `npm test` |
| Supabase test project | Matches production exactly | Network latency in tests, costs money, shared state risk |
| **Embedded PGlite — SELECTED** | In-process like SQLite was, zero Docker dependency for tests, fast, `pgTable`-compatible | Minor Postgres compatibility gaps (validated via Task 6b against real Supabase) |

**Approach:**
- `createDatabase()` dual-mode: uses PGlite when `DATABASE_URL` is not set (tests), postgres.js when set (production)
- Single PGlite instance per test file (created in `beforeAll`, closed in `afterAll`) — avoids ~200-500ms startup cost per test
- `beforeEach` truncates all tables for per-test isolation
- No Docker dependency for `npm test` — developers can run tests immediately after clone
- `docker-compose.dev.yml` includes a local Postgres service for optional manual dev/testing against real Postgres

**PGlite risk mitigation:** Generated Drizzle migrations are validated against a real Supabase instance (Task 6b) before any code changes. PGlite may accept SQL that Supabase rejects — the validation step catches this. `pgEnum` and `uuid` generation are explicitly verified against both PGlite and Supabase.

### Decision 6: Connection Pooling & Lifecycle

**`postgres` (postgres.js) has built-in connection pooling.** No need for a separate pooler like `pgbouncer`.

```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
const client = postgres(connectionString, {
  max: 10,           // Max connections in pool (plenty for 20 users)
  idle_timeout: 20,  // Close idle connections after 20s
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
```

**Graceful shutdown:** Register a Fastify `onClose` hook to call `client.end()` — drains the pool cleanly.

### Decision 7: Environment Variable Changes

| Current | New | Notes |
|---------|-----|-------|
| `DATABASE_PATH=./data/discord_clone.db` | `DATABASE_URL=postgresql://...` | Supabase connection string |
| — | `DATABASE_URL_TEST=postgresql://...` | Test database (local Postgres) |

All other env vars remain unchanged: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GROUP_ENCRYPTION_KEY`, `CLIENT_ORIGIN`, `TURN_SECRET`, etc.

---

## Affected Files — Complete Inventory

### Database Core (5 files — all require changes)

| File | Change Required |
|------|-----------------|
| `server/src/db/schema.ts` | Rewrite: `sqliteTable` → `pgTable`, type mappings (uuid, timestamp, boolean, enum) |
| `server/src/db/connection.ts` | Rewrite: Replace `better-sqlite3` with `postgres` + Drizzle Postgres setup. Remove PRAGMAs. |
| `server/src/db/migrate.ts` | Update: `drizzle-orm/better-sqlite3/migrator` → `drizzle-orm/postgres-js/migrator`. Make async. |
| `server/src/db/seed.ts` | Update: Add `await` to insert calls. |
| `server/drizzle.config.ts` | Update: `dialect: 'sqlite'` → `'postgresql'`, `url` → `DATABASE_URL`. |

### Fastify Infrastructure (2 files)

| File | Change Required |
|------|-----------------|
| `server/src/plugins/db.ts` | Update: `AppDatabase` type changes. Async connection. Add `onClose` hook for pool drain. |
| `server/src/index.ts` | Update: `runMigrations()` becomes async. `runSeed()` becomes async. |

### Auth Domain (3 files)

| File | Change Required |
|------|-----------------|
| `server/src/plugins/auth/authRoutes.ts` | Update: Add `await` to DB calls. Update UNIQUE constraint error from SQLite string match to Postgres error code `23505`. |
| `server/src/plugins/auth/sessionService.ts` | Update: Add `await` to all session CRUD. `.get()` → destructured array. |
| `server/src/plugins/auth/sessionService.test.ts` | Update: Add `await`, use PGlite in-memory. |

### Channel Domain (3 files)

| File | Change Required |
|------|-----------------|
| `server/src/plugins/channels/channelRoutes.ts` | Update: Add `await`. |
| `server/src/plugins/channels/channelService.ts` | Update: Add `await`. `.get()` → destructured array. |
| `server/src/plugins/channels/channelService.test.ts` | Update: Add `await`, use test Postgres. |

### Message Domain (4 files)

| File | Change Required |
|------|-----------------|
| `server/src/plugins/messages/messageRoutes.ts` | Update: Add `await`. |
| `server/src/plugins/messages/messageService.ts` | Update: Add `await`. |
| `server/src/plugins/messages/messageWsHandler.ts` | Update: Add `await` to store call. |
| `server/src/plugins/messages/messageRoutes.test.ts` | Update: Add `await`, use test Postgres. |

### Other Domains (5 files)

| File | Change Required |
|------|-----------------|
| `server/src/plugins/invites/inviteService.ts` | Update: Add `await`. |
| `server/src/plugins/users/userService.ts` | Update: Add `await`. |
| `server/src/plugins/admin/adminRoutes.ts` | Update: Add `await`. |
| `server/src/plugins/admin/adminService.ts` | Update: Add `await`. |
| `server/src/plugins/admin/adminService.test.ts` | Update: Add `await`, use test Postgres. |

### Voice Domain (1 file)

| File | Change Required |
|------|-----------------|
| `server/src/plugins/voice/voiceWsHandler.ts` | Update: Add `await` if any DB calls exist. |

### WebSocket Infrastructure (1 file)

| File | Change Required |
|------|-----------------|
| `server/src/ws/wsRouter.ts` | Update: `WsHandler` return type from `void` to `void | Promise<void>`. `routeMessage` awaits async handlers with `.catch()` error frame fallback. |

### Test Infrastructure (1 file)

| File | Change Required |
|------|-----------------|
| `server/src/test/helpers.ts` | Rewrite: Replace in-memory SQLite with PGlite via `createDatabase()`. Add `await` to all seed functions. `.returning().get()` → `[result] = await .returning()`. Add `teardownApp()` and `truncateAll()` exports. |

### Configuration & Deployment (4 files)

| File | Change Required |
|------|-----------------|
| `server/package.json` | Update: Remove `better-sqlite3` + `@types/better-sqlite3`. Add `postgres`. Add `@electric-sql/pglite` (devDependency). |
| `docker-compose.yml` | Update: Remove `./data/sqlite:/app/data` volume from `app` service. |
| `docker-compose.dev.yml` | Update: Add `postgres` service for optional local dev/test. |
| `.env.example` | Update: Replace `DATABASE_PATH` with `DATABASE_URL`. |

### Shared Package (3 files)

| File | Change Required |
|------|-----------------|
| `shared/src/ws-messages.ts` | Update: Add `TEXT_ERROR: 'text:error'` to `WS_TYPES`. Add `TextErrorPayload` interface with `error` and `tempId` fields. |
| `shared/src/types.ts` | Update: Add `ApiPaginatedList<T>` interface with `data`, `cursor`, and `count` fields for opaque cursor pagination. |
| `shared/src/index.ts` | Update: Export `TextErrorPayload` and `ApiPaginatedList`. |

### Client (4 files)

| File | Change Required |
|------|-----------------|
| `client/src/renderer/src/stores/useMessageStore.ts` | Update: Add `cursors: Map<string, string | null>` state, `setCursor`/`getCursor` methods. Update `setMessages`/`prependMessages` to accept cursor. |
| `client/src/renderer/src/services/messageService.ts` | Update: Replace message-ID `before` param with opaque `cursor` from server. Use `cursor !== null` for `hasMore` instead of length heuristic. |
| `client/src/renderer/src/services/apiClient.ts` | Update: Add `RetryableError` class, `withRetry` wrapper for transient GET failures (2 retries, linear backoff). Add `returnFullBody` param to `apiRequest`. Export `apiGet` convenience function. |
| `client/src/renderer/src/services/wsClient.ts` | Update: Add `TEXT_ERROR` handler that calls `markMessageFailed(tempId)` — keeps WS connection open instead of full reconnect. |

### Files NOT Affected

- `server/src/plugins/auth/authService.ts` (pure bcrypt/JWT/crypto — no DB calls)
- `server/src/plugins/auth/authService.test.ts` (pure function tests — no DB)
- `server/src/plugins/auth/authMiddleware.ts` (no DB calls)
- `server/src/plugins/presence/presenceService.ts` (in-memory only)
- `server/src/plugins/voice/mediasoupManager.ts` (no DB calls)
- `server/src/plugins/voice/voiceService.ts` (in-memory state only)
- `server/src/ws/wsServer.ts` (no DB calls)
- `server/src/services/encryptionService.ts` (no DB calls)
- `docker/nginx/` configs
- `docker/coturn/` configs
- `.github/workflows/` (CI/CD unchanged — tests run against PGlite in CI, no Docker Postgres needed)

**Total: ~30 server files, 3 shared files, 4 client files modified (~37 files total).**

---

## Detailed Schema Translation

### Current Schema (SQLite via Drizzle)

```typescript
// server/src/db/schema.ts — CURRENT
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
```

### Target Schema (PostgreSQL via Drizzle)

```typescript
// server/src/db/schema.ts — TARGET
import crypto from 'node:crypto';
import { pgTable, pgEnum, text, uuid, timestamp, boolean, index } from 'drizzle-orm/pg-core';
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
});

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
]);

// --- Invites ---
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  revoked: boolean('revoked').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Bans ---
export const bans = pgTable('bans', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  banned_by: uuid('banned_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_bans_user_id').on(table.user_id),
]);

// --- Channels ---
export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  type: channelTypeEnum('type').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_channels_type').on(table.type),
]);

// --- Messages ---
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel_id: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encrypted_content: text('encrypted_content').notNull(),
  nonce: text('nonce').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_messages_channel_id').on(table.channel_id),
  index('idx_messages_created_at').on(table.created_at),
]);

// --- Inferred Types (unchanged API) ---
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
```

**Key differences from current schema:**
1. `uuid().defaultRandom()` — Postgres generates UUIDs natively via `gen_random_uuid()`. No more `crypto.randomUUID()` in application code.
2. `timestamp({ withTimezone: true }).defaultNow()` — Postgres handles timestamps natively. No more Unix epoch integers.
3. `boolean()` — Real boolean type. No more `integer({ mode: 'boolean' })`.
4. `pgEnum` — Native Postgres enums for `role` and `channel_type`.
5. All `.references()` and `.index()` calls remain identical in API.

**Type impact:** The inferred types will change — `created_at` becomes `Date` instead of `Date` (already was mapped by Drizzle's `mode: 'timestamp'`), `id` becomes `string` (UUID is still a string in JS). `revoked` was already mapped to boolean by Drizzle. **Net impact on consuming code: minimal.**

---

## Connection Layer Translation

### Current (SQLite)

```typescript
// server/src/db/connection.ts — CURRENT
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export function createDatabase(dbPath?: string): { db: AppDatabase; sqlite: Database.Database } {
  const sqlite = new Database(resolvedPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
```

### Target (PostgreSQL)

```typescript
// server/src/db/connection.ts — TARGET
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export type AppDatabase = PostgresJsDatabase<typeof schema>;

export function createDatabase(connectionString?: string): {
  db: AppDatabase;
  client: ReturnType<typeof postgres>;
} {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(client, { schema });
  return { db, client };
}
```

**Changes:**
- No more file path — connection string only
- No more PRAGMAs — Postgres handles foreign keys and journaling natively
- No more `fs.mkdirSync` for data directory creation
- Connection pooling built into `postgres` driver
- Returns `client` instead of `sqlite` for graceful shutdown

### Migration Runner Translation

```typescript
// server/src/db/migrate.ts — TARGET
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { AppDatabase } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

export async function runMigrations(db: AppDatabase): Promise<void> {
  await migrate(db, { migrationsFolder });
}
```

**Change:** `migrate()` becomes async. Import path changes from `better-sqlite3/migrator` to `postgres-js/migrator`.

---

## Service Layer Async Pattern

### Before (sync SQLite)

```typescript
// Example: channelService.ts — CURRENT
export function getChannels(db: AppDatabase): Channel[] {
  return db.select().from(channels).all();
}

export function createChannel(db: AppDatabase, name: string, type: string): Channel {
  const channel = db.insert(channels).values({ name, type }).returning().get();
  return channel;
}
```

### After (async Postgres)

```typescript
// Example: channelService.ts — TARGET
export async function getChannels(db: AppDatabase): Promise<Channel[]> {
  return db.select().from(channels);
}

export async function createChannel(db: AppDatabase, name: string, type: string): Promise<Channel> {
  const [channel] = await db.insert(channels).values({ name, type }).returning();
  return channel;
}
```

**Mechanical pattern:**
1. Add `async` to function signature
2. Add `Promise<T>` return type
3. Add `await` before `db.*` calls
4. Replace `.get()` with array destructure `[result] = await ...`
5. Remove `.all()` — Postgres already returns arrays

---

## Test Infrastructure Translation

### Current Test Helper

```typescript
// In-memory SQLite — synchronous, fast, isolated
const app = await buildApp(); // uses ':memory:' SQLite
runMigrations(app.db);        // sync
const owner = app.db.insert(users).values({ ... }).returning().get(); // sync
```

### Target Test Helper

```typescript
// PGlite in-process Postgres — async, no Docker required, isolated
const app = await buildApp(); // PGlite auto-detected (no DATABASE_URL)
await runMigrations(app.migrate);  // async, uses drizzle-orm/pglite/migrator
const [owner] = await app.db.insert(users).values({ ... }).returning(); // async
```

**Test isolation strategy:**
- Single PGlite instance per test **file** (created in `beforeAll`, closed in `afterAll`) — avoids ~200-500ms PGlite startup cost per test
- `beforeEach` truncates all tables via `TRUNCATE ... CASCADE` for per-test isolation
- Explicit `close()` in `afterAll` prevents resource leaks (PGlite manages file descriptors and memory-mapped state)

**CI pipeline:** No Postgres service container needed — PGlite runs in-process. Tests execute with `npm test` immediately, zero infrastructure dependencies.

---

## Deployment Architecture Changes

### Current Docker Compose

```
EC2: app (Fastify + SQLite file) + coturn + nginx + certbot
     └── volume: ./data/sqlite:/app/data
```

### Target Docker Compose

```
EC2: app (Fastify → Supabase Postgres) + coturn + nginx + certbot
     └── no local DB volume needed
     └── DATABASE_URL points to Supabase

Supabase Cloud: PostgreSQL 15+ (managed)
     └── automatic backups
     └── dashboard for data inspection
     └── connection pooling via Supavisor
```

**docker-compose.yml changes:**
- Remove `./data/sqlite:/app/data` volume from `app` service
- Add `DATABASE_URL` to env_file or environment block
- No new containers needed (Supabase is external)

**Network considerations:**
- Supabase connection goes over the internet — add `?sslmode=require` to connection string
- Latency: Supabase region should match EC2 region (e.g., both `us-east-1`)
- Connection pooling via `postgres` driver (max 10) prevents connection exhaustion

---

## Supabase Project Setup

### One-time Setup Steps

1. Create Supabase project at [supabase.com](https://supabase.com)
2. Select same region as EC2 instance
3. Copy connection string from Project Settings → Database
4. Add connection string to `.env` as `DATABASE_URL`
5. Run `drizzle-kit push` or `drizzle-kit migrate` to create schema
6. Run seed to create default channels

### Supabase Dashboard Benefits

- **Table Editor** — Visual inspection of users, channels, messages, sessions
- **SQL Editor** — Run ad-hoc queries for debugging
- **Backups** — Automatic daily backups with point-in-time recovery (Pro plan)
- **Logs** — Query performance insights
- **Auth** — NOT USED (we keep custom JWT auth)
- **Realtime** — NOT USED (we keep custom WebSocket)
- **Storage** — NOT USED (no file uploads in MVP)

### Cost Estimate

Supabase Free tier includes:
- 500 MB database storage
- Unlimited API requests
- 2 projects

For 20 users with encrypted text messages, 500 MB is more than enough. If needed, Pro plan is $25/month for 8 GB storage and daily backups.

---

## Implementation Sequence

### Phase 1: Schema & Connection (Foundation)

1. Install `postgres` package, remove `better-sqlite3` and `@types/better-sqlite3`
2. Rewrite `server/src/db/schema.ts` with `pgTable` definitions
3. Rewrite `server/src/db/connection.ts` with `postgres` driver
4. Update `server/drizzle.config.ts` to `dialect: 'postgresql'`
5. Update `server/src/db/migrate.ts` to async Postgres migrator
6. Delete old SQLite migrations in `server/drizzle/`
7. Run `drizzle-kit generate` to create fresh Postgres migrations
8. Update `AppDatabase` type exports

### Phase 2: Fastify Infrastructure & Shared Types

9. Update `server/src/db/seed.ts` — async inserts
10. Update `server/src/plugins/db.ts` — new type, onClose hook, health check
11. Update `server/src/index.ts` — async migrations + seed
12. Update `shared/src/ws-messages.ts` — add `TEXT_ERROR` type and `TextErrorPayload`
13. Update `shared/src/types.ts` — add `ApiPaginatedList<T>`
14. Update `shared/src/index.ts` — export new types
15. Update `server/src/ws/wsRouter.ts` — async handler support with error frame fallback

### Phase 3: Service Layer (Async Migration)

16. Update `server/src/plugins/auth/sessionService.ts` — async CRUD
17. Update `server/src/plugins/auth/authRoutes.ts` — await service calls, Postgres error code
18. Update `server/src/plugins/channels/channelService.ts` — async CRUD
19. Update `server/src/plugins/channels/channelRoutes.ts` — await
20. Update `server/src/plugins/messages/messageService.ts` — async + opaque cursor pagination
21. Update `server/src/plugins/messages/messageRoutes.ts` — await + cursor response
22. Update `server/src/plugins/messages/messageWsHandler.ts` — async + TEXT_ERROR
23. Update `server/src/plugins/invites/inviteService.ts` — async
24. Update `server/src/plugins/users/userService.ts` — async
25. Update `server/src/plugins/admin/adminService.ts` — async
26. Update `server/src/plugins/admin/adminRoutes.ts` — await
27. Update `server/src/plugins/voice/voiceWsHandler.ts` — await

### Phase 4: Tests & Configuration

28. Update `server/src/test/helpers.ts` — PGlite test connection, async seeds, truncateAll
29. Update all test files — async DB calls, PGlite in-memory
30. Update `docker-compose.yml` — remove SQLite volume
31. Update `docker-compose.dev.yml` — add optional Postgres service
32. Update `.env.example` — `DATABASE_URL`
33. Update `server/package.json` — dependency swap

### Phase 5: Client Updates

34. Update `client/src/renderer/src/stores/useMessageStore.ts` — cursor state
35. Update `client/src/renderer/src/services/messageService.ts` — opaque cursor pagination
36. Update `client/src/renderer/src/services/apiClient.ts` — retry wrapper for GET requests
37. Update `client/src/renderer/src/services/wsClient.ts` — TEXT_ERROR handler

### Phase 6: Validation

38. Run full test suite against PGlite
39. Validate migration against real Supabase (mandatory gate)
40. Deploy to staging Supabase project
41. Run smoke tests (register, login, send message, join voice)
42. Verify backup/restore works via Supabase dashboard
43. Cut over production

---

## Rollback Plan

If the migration fails or Supabase proves problematic:

1. **Code rollback:** `git revert` the migration branch — reverts server, shared, and client changes
2. **Data:** SQLite database file is still on disk in `./data/sqlite/` — just restore the volume mount
3. **Client rollback:** Client changes (cursor pagination, retry, TEXT_ERROR) are reverted with the git revert — the old message-ID pagination is restored
4. **Supabase project:** Can be paused or deleted — no vendor lock-in

---

## Privacy & Security Considerations

### Data Sovereignty

**Current:** All data on your EC2 instance. Full control.
**After:** Message data (encrypted ciphertext) stored on Supabase's infrastructure. User passwords (bcrypt hashed), sessions (SHA-256 hashed tokens), and encryption keys (sealed boxes) also on Supabase.

**Mitigations:**
- Message content is E2E encrypted — Supabase sees only ciphertext + nonce. Cannot read messages.
- Passwords are bcrypt hashed — cannot be reversed.
- Refresh tokens are SHA-256 hashed — cannot be used if leaked.
- Encrypted group keys are sealed boxes — require user's private key (never leaves client).
- Supabase region selection keeps data in chosen geography.
- For maximum sovereignty: use Supabase self-hosted (requires running your own Postgres + Supabase stack). This is an escape hatch, not the recommended path.

**Net assessment:** The privacy posture remains strong. Supabase has access to encrypted blobs and hashed credentials — the same data a compromised EC2 instance would expose. The meaningful secret (plaintext messages) is never stored anywhere except client memory.

### Connection Security

- `?sslmode=require` enforced on all Supabase connections
- Connection string stored in `.env` (same as current JWT secrets)
- No Supabase API keys needed (we're not using their client SDK)

---

## Updates to Project Context & Documentation

After implementation, update these files to reflect the new architecture:

| File | Changes |
|------|---------|
| `_bmad-output/project-context.md` | Update Technology Stack table: `better-sqlite3` → `postgres`, `SQLite` → `PostgreSQL (Supabase)`. Update Database Naming notes. Remove SQLite-specific PRAGMAs from rules. |
| `docs/data-models-server.md` | Update ORM/Database sections. Replace SQLite config with Postgres connection details. Update type columns (uuid, timestamp, boolean). |
| `docs/architecture-server.md` | Update Database Architecture section. Update deployment diagram to show external Supabase. |
| `docs/development-guide.md` | Update local dev setup: Docker Postgres required. Update env var documentation. |

---

## Architecture Completeness Checklist

- [x] Migration scope clearly bounded (database layer + pagination/error handling ripple to shared/client)
- [x] All ~37 affected files identified with specific changes required (server, shared, client)
- [x] Schema translation fully specified with target code
- [x] Connection layer translation fully specified with target code (dual-mode: postgres.js + PGlite)
- [x] Sync-to-async migration pattern documented with before/after examples
- [x] Test infrastructure strategy defined (PGlite in-process — no Docker dependency)
- [x] Deployment changes documented (Docker Compose, env vars)
- [x] CI/CD pipeline unchanged (PGlite runs in-process, no Postgres service container needed)
- [x] Supabase project setup documented
- [x] Privacy/security impact assessed
- [x] Rollback plan defined
- [x] Implementation sequence ordered with phases (6 phases)
- [x] Documentation update list provided
- [x] Client-side changes scoped (cursor pagination, retry, TEXT_ERROR — no UI redesign)
- [x] Shared package changes scoped (TextErrorPayload, ApiPaginatedList types)
- [x] No auth system changes required (verified — authService.ts is pure functions, no DB)
- [x] WebSocket infrastructure changes scoped (async handler support in wsRouter.ts, TEXT_ERROR in messageWsHandler.ts)

**Status: READY FOR IMPLEMENTATION**
