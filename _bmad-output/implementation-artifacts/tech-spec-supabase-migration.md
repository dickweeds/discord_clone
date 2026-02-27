---
title: 'Supabase Migration — SQLite to PostgreSQL'
slug: 'supabase-migration'
created: '2026-02-27'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['postgres (postgres.js)', 'drizzle-orm/pg-core', 'drizzle-orm/postgres-js', 'drizzle-orm/pglite', '@electric-sql/pglite', 'Supabase (managed Postgres)', 'Fastify v5.7.x', 'TypeScript 5.x strict', 'Vitest']
files_to_modify: ['server/src/db/schema.ts', 'server/src/db/connection.ts', 'server/src/db/migrate.ts', 'server/src/db/seed.ts', 'server/drizzle.config.ts', 'server/src/plugins/db.ts', 'server/src/index.ts', 'server/src/plugins/auth/authRoutes.ts', 'server/src/plugins/auth/sessionService.ts', 'server/src/plugins/channels/channelRoutes.ts', 'server/src/plugins/channels/channelService.ts', 'server/src/plugins/messages/messageRoutes.ts', 'server/src/plugins/messages/messageService.ts', 'server/src/plugins/messages/messageWsHandler.ts', 'server/src/plugins/invites/inviteService.ts', 'server/src/plugins/users/userService.ts', 'server/src/plugins/admin/adminRoutes.ts', 'server/src/plugins/admin/adminService.ts', 'server/src/plugins/voice/voiceWsHandler.ts', 'server/src/test/helpers.ts', 'server/src/plugins/auth/sessionService.test.ts', 'server/src/plugins/channels/channelService.test.ts', 'server/src/plugins/messages/messageRoutes.test.ts', 'server/src/plugins/admin/adminService.test.ts', 'server/package.json', 'docker-compose.yml', 'docker-compose.dev.yml', '.env.example']
code_patterns: ['pgTable schema definitions with pgEnum', 'uuid().defaultRandom() replaces text + crypto.randomUUID()', 'timestamp({ withTimezone: true }).defaultNow() replaces integer mode timestamp', 'boolean() replaces integer mode boolean', 'async/await on ALL db.* calls', '[result] = await db.insert().returning() destructure replaces .returning().get()', 'await db.select().from() replaces .all()', '[result] = await db.select().from().where() replaces .get()', 'await db.transaction(async (tx) => { await tx... }) replaces sync transaction', 'PGlite in-memory for tests via drizzle-orm/pglite']
test_patterns: ['PGlite in-process Postgres for test database', 'Two test tiers: raw DB (sessionService) and full app (others)', 'sessionService.test.ts creates DB directly via createDatabase — no Fastify app', 'channelService/messageRoutes/adminService tests use setupApp() helper', 'authService.test.ts has NO DB — pure function tests — no changes needed', 'vi.stubEnv DATABASE_PATH :memory: pattern needs replacement for PGlite', 'beforeEach creates fresh DB instance per test for isolation', 'No afterEach cleanup — GC handles in-memory DB disposal', 'Direct DB assertions in tests use .get() .all() .run() — all need await']
---

# Tech-Spec: Supabase Migration — SQLite to PostgreSQL

**Created:** 2026-02-27

## Overview

### Problem Statement

The app uses embedded SQLite (better-sqlite3) which ties database storage to the EC2 instance, offers no managed backups or point-in-time recovery, and provides no data inspection dashboard. The single-file database cannot scale storage independently from compute.

### Solution

Surgical database layer swap — rewrite Drizzle schema from `sqliteTable` to `pgTable`, replace `better-sqlite3` with `postgres` (postgres.js) driver, async-ify all ~27 server files with DB calls, and use PGlite for in-memory test database. All other systems (custom JWT auth, WebSocket layer, E2E encryption, Electron client) remain completely untouched.

### Scope

**In Scope:**
- Schema translation (`sqliteTable` → `pgTable`, native UUID/timestamp/boolean/enum types)
- Connection layer rewrite (`postgres` driver, built-in connection pooling, graceful shutdown)
- Sync-to-async migration of all services, routes, and WebSocket handlers
- Cursor pagination rewrite (`rowid` → timestamp-based for Postgres compatibility)
- Test infrastructure swap (PGlite in-memory replaces SQLite `:memory:`)
- Deployment config updates (Docker Compose, env vars, Drizzle config)
- Documentation updates (project-context, data-models, architecture-server, development-guide)

**Out of Scope:**
- Data migration (fresh start — no SQLite data carried over)
- Supabase Auth / Realtime / Storage adoption (we keep custom implementations)
- Client-side changes (zero client modifications)
- Supabase project creation (already provisioned, connection string available)
- CI/CD pipeline changes (deferred to separate spec)

## Context for Development

### Codebase Patterns

**Current State (SQLite / better-sqlite3):**
- All DB operations are **synchronous** — zero `await` on any DB call in entire codebase
- Drizzle terminal methods: `.get()` (single row), `.all()` (array), `.run()` (fire-and-forget), `.returning().get()` (insert+return), `.returning().all()` (delete+return all)
- `AppDatabase` type = `BetterSQLite3Database<typeof schema>`
- Schema uses `sqliteTable`, `text` for UUIDs with `$defaultFn(() => crypto.randomUUID())`, `integer({ mode: 'timestamp' })` for dates, `integer({ mode: 'boolean' })` for booleans, `text({ enum: [...] })` for enums
- Messages table uses `sql\`(unixepoch())\`` for default timestamp — SQLite-specific
- `messageService.ts` uses SQLite's `rowid` for cursor-based pagination — **not available in Postgres**
- Two sync transactions: `authRoutes.ts` (registration race condition) and `channelService.ts` (cascade delete)
- Many functions declared `async` but body is entirely sync (e.g., `runSeed`, test helpers)
- Plugin architecture: each domain is a Fastify plugin with service + routes files

**Target State (Postgres / postgres.js):**
- All DB operations **async** with `await`
- `.get()` → `[result] = await ...` (destructure first element)
- `.all()` → `await ...` (already returns array in Postgres)
- `.run()` → `await ...`
- `.returning().get()` → `[result] = await .returning()`
- `db.transaction((tx) => {...})` → `await db.transaction(async (tx) => { await tx... })`
- `AppDatabase` type = common Drizzle pg base type (works for both postgres.js and PGlite)
- Schema uses `pgTable`, `uuid().defaultRandom()`, `timestamp({ withTimezone: true })`, `boolean()`, `pgEnum()`
- Cursor pagination: use `created_at` timestamp with `< ?` instead of `rowid`

**Files that do NOT need DB changes:**
- `server/src/plugins/auth/authService.ts` — pure bcrypt/JWT/crypto, no DB calls
- `server/src/plugins/auth/authService.test.ts` — pure function tests, no DB
- `server/src/plugins/presence/presenceService.ts` — in-memory only
- `server/src/plugins/voice/voiceService.ts` — in-memory state only
- All `client/` and `shared/` files — zero changes
- All WebSocket/mediasoup infrastructure files — no DB calls

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `_bmad-output/planning-artifacts/supabase-migration-architecture.md` | Full architecture document — schema translations, connection patterns, implementation sequence |
| `_bmad-output/project-context.md` | Project conventions and rules — must be updated post-migration |
| `docs/data-models-server.md` | Data model documentation — must be updated post-migration |
| `docs/architecture-server.md` | Server architecture documentation — must be updated post-migration |

### Investigation Results — File-by-File DB Call Audit

#### Database Core

| File | Current State | Changes Required |
|------|--------------|-----------------|
| `schema.ts` | 6 `sqliteTable` definitions, `text` UUIDs + `crypto.randomUUID()`, `integer` timestamps/booleans, `text` enums, `sql\`(unixepoch())\`` | Full rewrite: `pgTable`, `uuid().defaultRandom()`, `timestamp({ withTimezone: true })`, `boolean()`, `pgEnum()`, `defaultNow()` |
| `connection.ts` | Sync `createDatabase()`, returns `{ db, sqlite }`, WAL + FK pragmas, `BetterSQLite3Database` type | Full rewrite: `createDatabase()` returns `{ db, close }`, dual mode (postgres.js when `DATABASE_URL` set, PGlite when not), connection pool config |
| `migrate.ts` | Sync `runMigrations()`, `drizzle-orm/better-sqlite3/migrator` | Make async, import from `drizzle-orm/postgres-js/migrator` |
| `seed.ts` | Declared async but sync body, `.get()` + `.run()` | Add `await`, replace `.get()` → destructure, `.run()` → `await` |
| `drizzle.config.ts` | `dialect: 'sqlite'`, `DATABASE_PATH` env var | `dialect: 'postgresql'`, `DATABASE_URL` env var |

#### Auth Domain

| File | Functions with DB Calls | Drizzle Methods Used |
|------|------------------------|---------------------|
| `authRoutes.ts` | `onReady` hook, `GET /server/status`, `POST /register` (transaction with 7+ DB calls), `POST /login`, `POST /refresh`, `POST /logout` | `.get()` x10, `.returning().get()` x1, `.run()` x2, `db.transaction()` x1 |
| `sessionService.ts` | `createSession`, `findSessionByTokenHash`, `deleteSession`, `deleteUserSessions`, `cleanExpiredSessions` — ALL sync | `.returning().get()` x1, `.get()` x1, `.run()` x2, `.returning().all()` x1 |

#### Channel Domain

| File | Functions with DB Calls | Drizzle Methods Used |
|------|------------------------|---------------------|
| `channelService.ts` | `getAllChannels`, `getChannelById`, `createChannel` (3 DB calls), `deleteChannel` (transaction) — ALL sync | `.all()` x1, `.get()` x3, `.returning({...}).get()` x1, `.run()` x2, `db.transaction()` x1 |
| `channelRoutes.ts` | Delegates only — `getAllChannels()`, `createChannel()`, `deleteChannel()` | No direct DB calls — but return values from now-async services need `await` |

#### Message Domain

| File | Functions with DB Calls | Drizzle Methods Used |
|------|------------------------|---------------------|
| `messageService.ts` | `createMessage`, `getMessagesByChannel` (2 variants with/without cursor) — ALL sync. **Uses `rowid` for cursor pagination** | `.returning().get()` x1, `.all()` x2 (with raw SQL `rowid` references) |
| `messageRoutes.ts` | Channel existence check inline, delegates `getMessagesByChannel` | `.get()` x1 inline |
| `messageWsHandler.ts` | Delegates `createMessage` in sync callback | No direct DB — but sync callback calling now-async service needs async conversion |

#### Other Domains

| File | Functions with DB Calls | Drizzle Methods Used |
|------|------------------------|---------------------|
| `inviteService.ts` | `createInvite`, `revokeInvite`, `validateInvite`, `getInvites` — ALL sync | `.returning().get()` x1, `.run()` x1, `.get()` x1, `.all()` x1 |
| `userService.ts` | `getAllUsers` — sync | `.all()` x1 |
| `adminService.ts` | `kickUser`, `banUser`, `unbanUser`, `resetPassword` (async for bcrypt), `getBannedUsers` | `.get()` x5, `.returning().get()` x1, `.run()` x2, `.all()` x1 |
| `adminRoutes.ts` | Delegates only | No direct DB calls — but return values from now-async services need `await` |
| `voiceWsHandler.ts` | Delegates `getChannelById` in sync handler | No direct DB — sync callback calling now-async service needs async conversion |

#### Infrastructure & Tests

| File | Current State | Changes Required |
|------|--------------|-----------------|
| `db.ts` plugin | `createDatabase()` sync, `sqlite.close()` onClose hook, type augmentation | Async `createDatabase()`, `close()` onClose hook, update `AppDatabase` type augmentation |
| `index.ts` | `runMigrations(app.db)` sync, `await runSeed(app.db)` | `await runMigrations(app.db)` |
| `test/helpers.ts` | `setupApp()`, seed functions use `.returning().get()` and `.run()`, `createDatabase(':memory:')` via env var | PGlite auto-detection, all seeds get `await`, `.returning().get()` → destructure |
| `sessionService.test.ts` | Raw `createDatabase(':memory:')`, local `setupTestDb()`, direct DB assertions | PGlite instance, async `setupTestDb()`, `await` all assertions |
| `channelService.test.ts` | `setupApp()`, direct DB inserts/reads in tests | `await` all DB calls in test bodies |
| `messageRoutes.test.ts` | `setupApp()`, direct DB inserts in `beforeEach` | `await` all DB calls |
| `adminService.test.ts` | `setupApp()`, heavy DB assertions (select/verify state) | `await` all DB assertions |

### Technical Decisions

1. **Driver:** `postgres` (postgres.js) — fastest Node.js Postgres driver, ESM-native, built-in connection pooling, first-class Drizzle support
2. **Connection mode:** Session mode (port 5432) — long-lived Fastify server, full transaction and prepared statement support
3. **Schema strategy:** Mechanical translation — `sqliteTable` → `pgTable`, `text` UUIDs → `uuid().defaultRandom()`, `integer` timestamps → `timestamp({ withTimezone: true })`, `integer` booleans → `boolean()`, text enums → `pgEnum`
4. **Test database:** PGlite (`@electric-sql/pglite`) via `drizzle-orm/pglite` — in-process Postgres engine, no Docker dependency for tests, compatible with `pgTable` schemas
5. **Data strategy:** Fresh start — no data migration. Delete old SQLite migrations, regenerate from Postgres schema
6. **Connection pooling:** Built into `postgres` driver (max 10 connections, 20s idle timeout)
7. **Supabase usage:** Managed Postgres only — no Auth, no Realtime, no Storage, no client SDK
8. **Cursor pagination:** Replace SQLite `rowid`-based pagination in `messageService.ts` with `created_at` timestamp comparison — Postgres has no implicit `rowid`
9. **Transaction conversion:** Both existing transactions (`authRoutes.ts` registration, `channelService.ts` deleteChannel) become `await db.transaction(async (tx) => { await tx... })`
10. **Dual-mode connection:** `createDatabase()` auto-detects mode — if `DATABASE_URL` env var is set, use postgres.js; if not, use PGlite. Returns unified `{ db, close }` interface. Tests run without setting any env var.

### Critical Migration Patterns

**Pattern 1: Single-row fetch**
```typescript
// BEFORE: db.select().from(users).where(eq(users.id, id)).get()
// AFTER:  const [user] = await db.select().from(users).where(eq(users.id, id));
```

**Pattern 2: Multi-row fetch**
```typescript
// BEFORE: db.select().from(channels).all()
// AFTER:  await db.select().from(channels)
```

**Pattern 3: Insert and return**
```typescript
// BEFORE: db.insert(users).values({...}).returning().get()
// AFTER:  const [user] = await db.insert(users).values({...}).returning();
```

**Pattern 4: Fire-and-forget write**
```typescript
// BEFORE: db.delete(sessions).where(eq(sessions.id, id)).run()
// AFTER:  await db.delete(sessions).where(eq(sessions.id, id));
```

**Pattern 5: Transaction**
```typescript
// BEFORE: db.transaction((tx) => { tx.insert(...).run(); const r = tx.select(...).get(); })
// AFTER:  await db.transaction(async (tx) => { await tx.insert(...); const [r] = await tx.select(...); })
```

**Pattern 6: Delete and return all**
```typescript
// BEFORE: db.delete(sessions).where(...).returning().all()
// AFTER:  await db.delete(sessions).where(...).returning()
```

**Pattern 7: Cursor pagination (messageService-specific)**
```typescript
// BEFORE: db.select().from(messages).where(sql`...rowid < (SELECT rowid...)`).orderBy(sql`rowid DESC`).limit(limit).all()
// AFTER:  await db.select().from(messages).where(and(eq(...), lt(messages.created_at, cursorTimestamp))).orderBy(desc(messages.created_at)).limit(limit)
```

## Implementation Plan

### Tasks

#### Phase 1: Dependencies & Schema Foundation

- [ ] Task 1: Swap database driver dependencies
  - File: `server/package.json`
  - Action: `npm install postgres` and `npm install -D @electric-sql/pglite`. Then `npm uninstall better-sqlite3 @types/better-sqlite3`.
  - Notes: `drizzle-orm/pglite` and `drizzle-orm/postgres-js` are sub-paths of `drizzle-orm` (already installed) — no separate install needed.

- [ ] Task 2: Rewrite schema definitions from SQLite to PostgreSQL
  - File: `server/src/db/schema.ts`
  - Action: Full rewrite. Replace all imports from `drizzle-orm/sqlite-core` with `drizzle-orm/pg-core`. Apply these changes:
    - Add `import { pgTable, pgEnum, text, uuid, timestamp, boolean, index } from 'drizzle-orm/pg-core';`
    - Remove `import crypto from 'node:crypto';` (no longer needed — Postgres generates UUIDs natively)
    - Remove `import { sql } from 'drizzle-orm';` (no longer needed for `unixepoch()`)
    - Create `export const roleEnum = pgEnum('role', ['owner', 'user']);`
    - Create `export const channelTypeEnum = pgEnum('channel_type', ['text', 'voice']);`
    - All `sqliteTable` → `pgTable`
    - All `text('id').$defaultFn(() => crypto.randomUUID())` → `uuid('id').primaryKey().defaultRandom()`
    - All `integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())` → `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`
    - `integer('revoked', { mode: 'boolean' })` → `boolean('revoked')`
    - `text('role', { enum: ['owner', 'user'] })` → `roleEnum('role')`
    - `text('type', { enum: ['text', 'voice'] })` → `channelTypeEnum('type')`
    - Messages `created_at` with `sql\`(unixepoch())\`` → `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`
    - All `.references()`, `.index()`, `.unique()` calls remain identical
    - All `InferSelectModel` / `InferInsertModel` type exports remain identical
  - Notes: See architecture doc section "Detailed Schema Translation" for the complete target schema code. The inferred TypeScript types will change slightly: `created_at` stays `Date`, `id` stays `string`, `revoked` stays `boolean`. Net impact on consuming code: minimal.

- [ ] Task 3: Rewrite database connection layer with dual-mode support
  - File: `server/src/db/connection.ts`
  - Action: Full rewrite. Create a dual-mode connection function:
    - Remove all `better-sqlite3` imports, `fs` imports, `path` imports
    - Import `postgres` from `'postgres'`, `drizzle` from `'drizzle-orm/postgres-js'`, and `PGlite` from `'@electric-sql/pglite'`, `drizzle as drizzlePglite` from `'drizzle-orm/pglite'`
    - Export `AppDatabase` type — use a common Drizzle pg base type that works for both postgres.js and PGlite (both extend pg-core). Use `PgDatabase<QueryResultHKT, typeof schema>` from `'drizzle-orm/pg-core'` as the common type.
    - Export `createDatabase(connectionString?: string): { db: AppDatabase; close: () => Promise<void> }`:
      - If `connectionString` is provided OR `process.env.DATABASE_URL` is set: use `postgres()` driver with connection pool config (`max: 10, idle_timeout: 20, connect_timeout: 10`), return `{ db: drizzle(client, { schema }), close: () => client.end() }`
      - If neither is set: use `new PGlite()` (in-memory), return `{ db: drizzlePglite(pglite, { schema }), close: () => pglite.close() }`
    - Remove all SQLite PRAGMAs (WAL, foreign keys) — Postgres handles natively
    - Remove `fs.mkdirSync` for data directory
  - Notes: The dual-mode approach means tests automatically get PGlite (no DATABASE_URL set) while production gets postgres.js (DATABASE_URL from .env). Unified `{ db, close }` return type simplifies plugin and test code.

- [ ] Task 4: Update Drizzle Kit configuration
  - File: `server/drizzle.config.ts`
  - Action: Change `dialect: 'sqlite'` → `dialect: 'postgresql'`. Change `dbCredentials.url` from `process.env.DATABASE_PATH || './data/discord_clone.db'` to `process.env.DATABASE_URL || ''`.
  - Notes: The `schema` and `out` paths remain unchanged.

- [ ] Task 5: Make migration runner async
  - File: `server/src/db/migrate.ts`
  - Action: Change import from `drizzle-orm/better-sqlite3/migrator` to `drizzle-orm/postgres-js/migrator`. Change function signature from `export function runMigrations(db: AppDatabase): void` to `export async function runMigrations(db: AppDatabase): Promise<void>`. Add `await` before `migrate(db, { migrationsFolder })`.
  - Notes: The `migrationsFolder` path resolution stays the same.

- [ ] Task 6: Delete old SQLite migrations and generate fresh Postgres migrations
  - Action: Delete all files in `server/drizzle/` directory. Run `cd server && npx drizzle-kit generate` to create a clean initial Postgres migration from the new schema.
  - Notes: This is a destructive action on the migrations folder only. The new migration will create all 6 tables + indexes + enums from scratch. No data migration needed (fresh start).

- [ ] Task 7: Update seed file to use async DB calls
  - File: `server/src/db/seed.ts`
  - Action: Add `await` to both DB calls:
    - `db.select({ value: count() }).from(channels).get()` → `const [channelCount] = await db.select({ value: count() }).from(channels);` then check `channelCount?.value ?? 0`
    - `db.insert(channels).values([...]).run()` → `await db.insert(channels).values([...])`
  - Notes: Function is already declared `async` — just needs actual `await` statements.

#### Phase 2: Fastify Infrastructure

- [ ] Task 8: Update database Fastify plugin
  - File: `server/src/plugins/db.ts`
  - Action:
    - Update import: `AppDatabase` type from new `connection.ts`
    - Change `const { db, sqlite } = createDatabase()` → `const { db, close } = createDatabase()`
    - Change `onClose` hook: `sqlite.close()` → `await close()`  (make the hook `async`)
    - Update type augmentation: `FastifyInstance.db` stays `AppDatabase` (type is re-exported from connection.ts)
  - Notes: The `createDatabase()` call with no args will auto-detect mode (PGlite in tests, postgres.js in production when DATABASE_URL is set).

- [ ] Task 9: Make startup sequence fully async
  - File: `server/src/index.ts`
  - Action: Change `runMigrations(app.db)` → `await runMigrations(app.db)`. The `await runSeed(app.db, app.log)` call already has `await` — no change needed.
  - Notes: Minimal change — just adding one `await`.

#### Phase 3: Auth Domain

- [ ] Task 10: Convert session service to async
  - File: `server/src/plugins/auth/sessionService.ts`
  - Action: Make all 5 functions `async` and add `await` to all DB calls:
    - `createSession`: `async`, `const [session] = await db.insert(sessions).values({...}).returning();`
    - `findSessionByTokenHash`: `async`, `const [session] = await db.select().from(sessions).where(...);` return `session ?? null`
    - `deleteSession`: `async`, `await db.delete(sessions).where(...);`
    - `deleteUserSessions`: `async`, `await db.delete(sessions).where(...);`
    - `cleanExpiredSessions`: `async`, `const deleted = await db.delete(sessions).where(...).returning();` (returns array directly, remove `.all()`)
  - Notes: All callers of these functions already use them in async contexts (route handlers). Just need to add `await` at call sites in authRoutes.ts (Task 11).

- [ ] Task 11: Convert auth routes to async DB operations
  - File: `server/src/plugins/auth/authRoutes.ts`
  - Action: Add `await` to every DB call and service call that now returns a Promise:
    - `onReady` hook: `await cleanExpiredSessions(fastify.db)` — make hook function `async` if not already
    - `GET /server/status`: `const [result] = await fastify.db.select({ value: count() }).from(users);`
    - `POST /register`: Convert the `db.transaction((tx) => {...})` to `await db.transaction(async (tx) => {...})`. Inside the transaction, add `await` to ALL tx calls:
      - `const [countResult] = await tx.select({ value: count() }).from(users);`
      - `const [banCheck] = await tx.select(...).from(bans).innerJoin(...).where(...);`
      - `const [existingUser] = await tx.select().from(users).where(...);`
      - `const [newUser] = await tx.insert(users).values({...}).returning();`
      - `const [channelCountResult] = await tx.select({ value: count() }).from(channels);`
      - `await tx.insert(channels).values([...]);`
      - `await tx.update(invites).set({ revoked: true }).where(...);`
    - `POST /login`: `const [user] = await fastify.db.select().from(users).where(...);` and `const [ban] = await fastify.db.select().from(bans).where(...);`
    - `POST /refresh`: `await findSessionByTokenHash(...)`, `await deleteSession(...)`, `await createSession(...)`
    - `POST /logout`: `await findSessionByTokenHash(...)`, `await deleteSession(...)`
  - Notes: This is the most complex file. The transaction in `POST /register` has 7+ DB calls that all need `await`. The transaction callback must become `async`. Pay careful attention to the return value from the transaction — if the transaction returns a value, the outer code must `await` it.

#### Phase 4: Channel Domain

- [ ] Task 12: Convert channel service to async
  - File: `server/src/plugins/channels/channelService.ts`
  - Action: Make all functions `async` and add `await`:
    - `getAllChannels`: `async`, `return await db.select({...}).from(channels);` (remove `.all()`)
    - `getChannelById`: `async`, `const [channel] = await db.select({...}).from(channels).where(...);` return `channel ?? null` or `channel`
    - `createChannel`: `async`, add `await` to count check, dupe check, and insert. `const [channel] = await db.insert(channels).values({...}).returning({...});`
    - `deleteChannel`: `async`, add `await` to existence check. Convert transaction: `await db.transaction(async (tx) => { await tx.delete(messages).where(...); await tx.delete(channels).where(...); })`
  - Notes: The `deleteChannel` transaction callback must become `async`.

- [ ] Task 13: Add await to channel route handler service calls
  - File: `server/src/plugins/channels/channelRoutes.ts`
  - Action: Add `await` before all service function calls:
    - `await getAllChannels(fastify.db)`
    - `await createChannel(fastify.db, ...)`
    - `await deleteChannel(fastify.db, ...)`
  - Notes: Route handlers are already `async` — just need `await` on the now-async service calls.

#### Phase 5: Message Domain

- [ ] Task 14: Convert message service to async and rewrite cursor pagination
  - File: `server/src/plugins/messages/messageService.ts`
  - Action:
    - Make all functions `async` with `await`:
    - `createMessage`: `async`, `const [message] = await db.insert(messages).values({...}).returning();`
    - `getMessagesByChannel`: `async`. **Rewrite the cursor pagination logic:**
      - Remove all `rowid` references (SQLite-specific)
      - The `before` parameter currently takes a message ID and uses `rowid` subquery. Change it to accept a `created_at` ISO timestamp string instead.
      - **With cursor:** `await db.select().from(messages).where(and(eq(messages.channel_id, channelId), lt(messages.created_at, new Date(before)))).orderBy(desc(messages.created_at)).limit(limit);`
      - **Without cursor:** `await db.select().from(messages).where(eq(messages.channel_id, channelId)).orderBy(desc(messages.created_at)).limit(limit);`
      - Remove `.all()` — Postgres returns arrays directly
    - Update `toISOTimestamp` helper if needed to handle Postgres `Date` objects (may already work since Drizzle maps `timestamp` to `Date`)
  - Notes: The cursor pagination change is a **behavioral change**. The `before` parameter semantics shift from "message ID" to "ISO timestamp". Verify that the client passes timestamps (check `messageRoutes.ts` and client code). If the client currently passes message IDs as the `before` cursor, the route handler will need to look up the message's `created_at` first, or the API contract changes. Check the route handler in Task 15.

- [ ] Task 15: Convert message routes to async
  - File: `server/src/plugins/messages/messageRoutes.ts`
  - Action:
    - Channel existence check: `const [channel] = await fastify.db.select().from(channels).where(...);`
    - Service call: `await getMessagesByChannel(fastify.db, ...)`
    - **Cursor parameter:** Verify what the `before` query param currently represents. If it's a message ID, add a lookup step to fetch that message's `created_at` and pass the timestamp to the service. If the client already sends timestamps, pass directly.
  - Notes: The cursor pagination contract may need adjustment. Check the route schema definition for what `before` accepts.

- [ ] Task 16: Convert message WebSocket handler to async
  - File: `server/src/plugins/messages/messageWsHandler.ts`
  - Action: The `TEXT_SEND` handler callback that calls `createMessage()` must become `async`:
    - Change the callback to `async` function
    - Add `await` before `createMessage(db, ...)`
    - Ensure the WS handler registration supports async callbacks (Fastify WS handlers typically do)
  - Notes: Since the handler sends the created message back via WebSocket broadcast, ensure the `await` completes before broadcasting.

#### Phase 6: Other Domains

- [ ] Task 17: Convert invite service to async
  - File: `server/src/plugins/invites/inviteService.ts`
  - Action: Make DB-calling functions `async` with `await`:
    - `createInvite`: `async`, `const [invite] = await db.insert(invites).values({...}).returning();`
    - `revokeInvite`: `async`, `await db.update(invites).set({...}).where(...);`
    - `validateInvite`: `async`, `const [invite] = await db.select().from(invites).where(...);` return `invite ?? null`
    - `getInvites`: `async`, `return await db.select().from(invites);` (remove `.all()`)
  - Notes: `generateInviteToken` has no DB calls — leave as sync.

- [ ] Task 18: Convert user service to async
  - File: `server/src/plugins/users/userService.ts`
  - Action: `getAllUsers`: make `async`, `return await db.select({...}).from(users);` (remove `.all()`)
  - Notes: Single function, minimal change.

- [ ] Task 19: Convert admin service to async
  - File: `server/src/plugins/admin/adminService.ts`
  - Action: Make all functions `async` (or keep async where already async) and add `await` to all DB calls:
    - `kickUser`: `async`, `const [user] = await db.select().from(users).where(...);`
    - `banUser`: `async`, all 3 DB calls get `await`: user lookup, ban check, ban insert. `const [ban] = await db.insert(bans).values({...}).returning();`
    - `unbanUser`: `async`, both DB calls get `await`: ban lookup, ban delete
    - `resetPassword`: already `async` for bcrypt — add `await` to the 2 DB calls (user lookup, password update)
    - `getBannedUsers`: `async`, `return await db.select({...}).from(bans).innerJoin(...);` (remove `.all()`)
  - Notes: `resetPassword` already has `await` for `hashPassword()` — just needs `await` on its DB calls too.

- [ ] Task 20: Add await to admin route handler service calls
  - File: `server/src/plugins/admin/adminRoutes.ts`
  - Action: Add `await` before all service calls that are now async:
    - `await kickUser(fastify.db, ...)`
    - `await banUser(fastify.db, ...)`
    - `await unbanUser(fastify.db, ...)`
    - `await resetPassword(...)` (already has `await` — verify)
    - `await getBannedUsers(fastify.db)`
  - Notes: Route handlers are already `async`. `resetPassword` already has `await` in the route — verify the others.

- [ ] Task 21: Convert voice WebSocket handler to async where needed
  - File: `server/src/plugins/voice/voiceWsHandler.ts`
  - Action: The `handleVoiceJoin` function calls `getChannelById(db, channelId)` which is now `async`. Make `handleVoiceJoin` `async` and add `await` before `getChannelById(...)`.
  - Notes: Only one DB call in this file. All other voice handlers are in-memory mediasoup state — no changes needed.

#### Phase 7: Test Infrastructure

- [ ] Task 22: Rewrite test helpers for PGlite
  - File: `server/src/test/helpers.ts`
  - Action:
    - Remove `vi.stubEnv('DATABASE_PATH', ':memory:')` if present in helpers (it's in test files — but check)
    - `setupApp()`: No change needed to the function body if `buildApp()` → db plugin → `createDatabase()` auto-detects PGlite when `DATABASE_URL` is not set. Just ensure tests don't set `DATABASE_URL`.
    - `seedOwner()`: Add `await` to DB insert: `const [user] = await app.db.insert(users).values({...}).returning();`
    - `seedRegularUser()`: Same — `const [user] = await app.db.insert(users).values({...}).returning();`
    - `seedUserWithSession()`: Add `await` to user insert: `const [user] = await app.db.insert(users).values({...}).returning();`. Add `await` to `createSession()` call: `await createSession(app.db, user.id, refreshToken)`
    - `seedInvite()`: Add `await` to invite insert: `await app.db.insert(invites).values({...});`. Make function `async`, return type changes to `Promise<string>`.
    - Update `runMigrations(app.db)` call to `await runMigrations(app.db)` in `setupApp()`
  - Notes: All callers of seed functions are in `beforeEach` hooks which are already `async`. The `seedInvite` sync → async change requires updating its callers to add `await`.

- [ ] Task 23: Update session service tests for PGlite
  - File: `server/src/plugins/auth/sessionService.test.ts`
  - Action:
    - Replace the local `setupTestDb()` function: instead of `createDatabase(':memory:')`, call `createDatabase()` with no args (auto-detects PGlite). Make `setupTestDb` `async`: `const { db } = createDatabase();` then `await runMigrations(db);`
    - Remove `vi.stubEnv('DATABASE_PATH', ':memory:')` — PGlite is used when no DATABASE_URL is set
    - Local `seedUser()`: `const [user] = await db.insert(users).values({...}).returning();` — make `async`
    - All direct DB calls in test bodies: add `await` and use destructure pattern
    - `beforeEach` becomes `async` (may already be) and calls `await setupTestDb()`
  - Notes: This file bypasses Fastify entirely — tests the service against a raw DB instance. The PGlite swap is transparent since it speaks Postgres.

- [ ] Task 24: Update channel service tests for async DB calls
  - File: `server/src/plugins/channels/channelService.test.ts`
  - Action: Add `await` to all direct DB calls in test bodies:
    - `await app.db.insert(channels).values({...});` (remove `.run()`)
    - `const [channel] = await app.db.insert(channels).values({...}).returning();` (remove `.get()`)
    - `await app.db.insert(messages).values([...]);` (remove `.run()`)
    - `const msgs = await app.db.select().from(messages);` (remove `.all()`)
    - `const chs = await app.db.select().from(channels);` (remove `.all()`)
    - Remove `vi.stubEnv('DATABASE_PATH', ':memory:')` — PGlite auto-detected
  - Notes: Service calls like `createChannel()` and `deleteChannel()` are tested through the service functions (already `await`-ed by the test since they're called directly).

- [ ] Task 25: Update message routes tests for async DB calls
  - File: `server/src/plugins/messages/messageRoutes.test.ts`
  - Action:
    - `beforeEach`: `const [channel] = await app.db.insert(channels).values({...}).returning();` (remove `.get()`)
    - All `createMessage()` calls in test bodies: add `await` (service is now async)
    - Remove `vi.stubEnv('DATABASE_PATH', ':memory:')`
    - If cursor pagination tests exist: update the `before` parameter to use ISO timestamps instead of message IDs (matching the new cursor semantics from Task 14)
  - Notes: HTTP inject tests (`app.inject()`) are already async — no changes to the inject calls themselves.

- [ ] Task 26: Update admin service tests for async DB calls
  - File: `server/src/plugins/admin/adminService.test.ts`
  - Action: Add `await` to all direct DB assertions:
    - `const sessions = await app.db.select().from(sessions).where(...);` (remove `.all()`)
    - `const [ban] = await app.db.select().from(bans).where(...);` (remove `.get()`)
    - `const [user] = await app.db.select().from(users).where(...);` (remove `.get()`)
    - All service calls: add `await` where missing (`await kickUser(...)`, `await banUser(...)`, etc.)
    - `await createSession(...)` calls in test setup
    - Remove `vi.stubEnv('DATABASE_PATH', ':memory:')`
  - Notes: This is the most DB-assertion-heavy test file. Every verification step needs `await`.

#### Phase 8: Deployment & Configuration

- [ ] Task 27: Update environment variable example
  - File: `.env.example`
  - Action: Replace `DATABASE_PATH=./data/discord_clone.db` with `DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`. Add comment noting session mode (port 5432) and SSL requirement.
  - Notes: Keep all other env vars unchanged.

- [ ] Task 28: Remove SQLite volume from production Docker Compose
  - File: `docker-compose.yml`
  - Action: Remove `./data/sqlite:/app/data` volume from the `app` service. Add `DATABASE_URL` to the environment or `env_file` block if not already using `.env`.
  - Notes: No new containers needed — Supabase is external.

- [ ] Task 29: Add local dev Postgres to dev Docker Compose
  - File: `docker-compose.dev.yml`
  - Action: Add a `postgres` service for local development (not tests — tests use PGlite):
    ```yaml
    services:
      postgres:
        image: postgres:15-alpine
        environment:
          POSTGRES_USER: discord_clone
          POSTGRES_PASSWORD: dev_password
          POSTGRES_DB: discord_clone_dev
        ports:
          - "5432:5432"
        volumes:
          - pgdata:/var/lib/postgresql/data
    volumes:
      pgdata:
    ```
  - Notes: This provides a local Postgres for manual dev/testing against a real Postgres without needing Supabase. Tests still use PGlite.

#### Phase 9: Documentation Updates

- [ ] Task 30: Update project context for AI agents
  - File: `_bmad-output/project-context.md`
  - Action: Update Technology Stack table: `better-sqlite3 v12.6.x` → `postgres (postgres.js)`, `SQLite` → `PostgreSQL (Supabase)`. Add `@electric-sql/pglite` to test tools. Update "Database Naming" section to remove SQLite-specific notes. Update "Dates" rule: `Unix timestamps in SQLite storage` → `Postgres timestamps with timezone`. Update Docker Compose volumes description. Update JWT note: `refresh tokens stored hashed in SQLite` → `in PostgreSQL`.
  - Notes: Keep all non-database rules unchanged.

- [ ] Task 31: Update data models documentation
  - File: `docs/data-models-server.md`
  - Action: Update ORM/Database sections. Replace SQLite config references with Postgres connection details. Update type columns documentation (uuid, timestamp, boolean, pgEnum). Remove SQLite PRAGMA references.
  - Notes: Check if file exists first — only update if present.

- [ ] Task 32: Update server architecture documentation
  - File: `docs/architecture-server.md`
  - Action: Update Database Architecture section. Update deployment diagram to show external Supabase instead of local SQLite volume. Update connection layer description.
  - Notes: Check if file exists first — only update if present.

#### Phase 10: Validation

- [ ] Task 33: TypeScript compilation check
  - Action: Run `cd server && npx tsc --noEmit` to verify zero type errors after all changes.
  - Notes: Fix any type errors before proceeding. Common issues: `AppDatabase` type mismatches, missing `await` causing type inference issues, PGlite vs postgres.js type compatibility.

- [ ] Task 34: Run full test suite
  - Action: Run `cd server && npm test` to execute all tests against PGlite.
  - Notes: All tests should pass. If cursor pagination tests fail, verify the `before` parameter contract matches the new timestamp-based approach. If PGlite has compatibility issues with any Postgres feature, document and address.

### Acceptance Criteria

#### Schema & Connection

- [ ] AC 1: Given the new schema.ts, when Drizzle Kit generates migrations, then a valid Postgres migration is produced with all 6 tables, 2 enums, all indexes, and all foreign key constraints.
- [ ] AC 2: Given `DATABASE_URL` is set to a valid Postgres connection string, when `createDatabase()` is called, then it returns a working `{ db, close }` using postgres.js driver with connection pooling.
- [ ] AC 3: Given `DATABASE_URL` is NOT set, when `createDatabase()` is called, then it returns a working `{ db, close }` using PGlite in-memory.
- [ ] AC 4: Given the new connection layer, when `close()` is called, then the connection pool is drained (postgres.js) or the PGlite instance is closed cleanly with no hanging processes.

#### Async Migration

- [ ] AC 5: Given any service function that previously used `.get()`, when called with `await`, then it returns a single row (or undefined/null) via array destructuring `[result]`.
- [ ] AC 6: Given any service function that previously used `.all()`, when called with `await`, then it returns an array of rows directly (no `.all()` needed).
- [ ] AC 7: Given any service function that previously used `.run()`, when called with `await`, then the write operation completes without returning data.
- [ ] AC 8: Given the registration transaction in `authRoutes.ts`, when a race condition occurs (two simultaneous first-user registrations), then only one user gets the `owner` role — the transaction provides atomicity.
- [ ] AC 9: Given the deleteChannel transaction in `channelService.ts`, when a channel with messages is deleted, then both the messages and the channel are removed atomically.

#### Cursor Pagination

- [ ] AC 10: Given a channel with 100 messages, when `getMessagesByChannel` is called with `limit=50` and no cursor, then the 50 most recent messages are returned ordered by newest first.
- [ ] AC 11: Given a channel with 100 messages, when `getMessagesByChannel` is called with a `before` timestamp cursor, then only messages with `created_at` earlier than the cursor are returned, ordered by newest first.

#### Test Infrastructure

- [ ] AC 12: Given no `DATABASE_URL` environment variable, when `setupApp()` is called in a test, then a PGlite in-memory database is created, migrations are applied, and the app is ready for testing.
- [ ] AC 13: Given a test suite with `beforeEach` creating a fresh app, when multiple tests run sequentially, then each test gets a clean database with no cross-test contamination.
- [ ] AC 14: Given the full test suite, when `npm test` is run, then all existing tests pass against PGlite with no behavioral regressions.

#### Deployment

- [ ] AC 15: Given the updated `docker-compose.yml`, when the app container starts with `DATABASE_URL` pointing to Supabase, then the server connects, runs migrations, seeds default channels, and starts listening.
- [ ] AC 16: Given the Fastify server is running, when a graceful shutdown is triggered (SIGTERM), then the database connection pool is drained via the `onClose` hook before the process exits.

#### End-to-End Behavioral

- [ ] AC 17: Given a fresh Supabase database, when the full registration → login → send message → fetch messages flow is exercised, then all operations succeed with correct data in Postgres.
- [ ] AC 18: Given the server is running against Supabase, when an admin bans a user, then the ban record exists in Postgres and the banned user cannot log in.

## Additional Context

### Dependencies

**Add:**
- `postgres` — Postgres driver for Node.js (production)
- `@electric-sql/pglite` (devDependency) — In-process Postgres for tests

**Remove:**
- `better-sqlite3` — SQLite driver
- `@types/better-sqlite3` — Type definitions for SQLite driver

**Already available (sub-paths of drizzle-orm):**
- `drizzle-orm/pg-core` — Postgres schema builders
- `drizzle-orm/postgres-js` — postgres.js Drizzle adapter
- `drizzle-orm/pglite` — PGlite Drizzle adapter
- `drizzle-orm/postgres-js/migrator` — Async Postgres migration runner

### Testing Strategy

- **PGlite in-memory:** Each test suite creates a fresh PGlite instance — no shared state, no Docker dependency
- **Two test tiers preserved:**
  - `sessionService.test.ts`: Direct `createDatabase()` → PGlite — no Fastify app, lightweight
  - `channelService/messageRoutes/adminService tests`: Full `setupApp()` with PGlite-backed DB
  - `authService.test.ts`: No changes — pure function tests, no DB involvement
- **Dual-mode connection:** `createDatabase()` auto-detects PGlite when `DATABASE_URL` is not set — tests need no env var stubbing for the DB
- **Test isolation:** `beforeEach` creates fresh PGlite instance per test (new `setupApp()` or new `createDatabase()`)
- **Migration in tests:** `await runMigrations(db)` runs the same Postgres migrations as production — tests validate the real schema

### Notes

- Architecture document (`supabase-migration-architecture.md`) is the authoritative reference for schema translations and connection patterns
- The migration is entirely server-side — zero client changes
- Supabase connection string should use `?sslmode=require` for production, session mode port 5432
- Rollback plan: `git revert` the migration branch, restore SQLite volume mount, reinstall `better-sqlite3`
- `authService.ts` does NOT need changes — confirmed no DB calls (pure bcrypt/JWT/crypto)
- `messageService.ts` `rowid` cursor pagination is a deviation from the architecture doc — replaced with `created_at` timestamp cursor. Verify client compatibility.
- **Risk: PGlite compatibility** — PGlite supports most Postgres features but may have edge cases with `pgEnum` or `uuid` generation. If issues arise during Task 34, document and patch.
- **Risk: Cursor pagination contract** — The `before` parameter changing from message ID to timestamp may affect the client's pagination logic. Verify the client code sends timestamps, or add a message lookup in the route handler.
