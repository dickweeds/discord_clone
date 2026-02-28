# Data Models — Server

**Generated:** 2026-02-26 | **Scan Level:** Exhaustive | **Source:** All schema and migration files read

## Overview

- **ORM:** Drizzle ORM 0.45.x (`pgTable`, `pgEnum`)
- **Database:** PostgreSQL via postgres (postgres.js) — Supabase managed Postgres in production
- **Test Database:** @electric-sql/pglite (embedded in-memory Postgres)
- **Schema File:** `server/src/db/schema.ts`
- **Connection:** `server/src/db/connection.ts` (dual-mode: postgres.js when `DATABASE_URL` is set, PGlite when not)
- **Migrations:** `server/drizzle/` (1 consolidated migration via drizzle-kit)
- **Tables:** 6
- **Total Columns:** 31
- **Foreign Keys:** 6 (all with ON DELETE CASCADE)
- **Indexes:** 10

## Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    users     │     │   sessions   │     │    invites   │
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │◄────│ user_id (FK) │     │ id (PK)      │
│ username     │     │ id (PK)      │     │ token        │
│ password_hash│     │ refresh_token│     │ created_by───│──► users.id
│ role         │     │ _hash        │     │ revoked      │
│ public_key   │     │ expires_at   │     │ created_at   │
│ encrypted_   │     │ created_at   │     └──────────────┘
│ group_key    │     └──────────────┘
│ created_at   │
└──────┬───────┘
       │
       │  ┌──────────────┐     ┌──────────────┐
       │  │     bans     │     │   channels   │
       │  │──────────────│     │──────────────│
       ├──│ user_id (FK) │     │ id (PK)      │◄─┐
       └──│ banned_by(FK)│     │ name         │  │
          │ id (PK)      │     │ type         │  │
          │ created_at   │     │ created_at   │  │
          └──────────────┘     └──────────────┘  │
                                                  │
                               ┌──────────────┐  │
                               │   messages   │  │
                               │──────────────│  │
                               │ id (PK)      │  │
                               │ channel_id───│──┘
                               │ user_id (FK) │──► users.id
                               │ encrypted_   │
                               │ content      │
                               │ nonce        │
                               │ created_at   │
                               └──────────────┘
```

## Table Definitions

### `users`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` | Unique user identifier |
| `username` | TEXT | NOT NULL, UNIQUE | — | Login username (3-32 chars, alphanumeric + underscore) |
| `password_hash` | TEXT | NOT NULL | — | bcrypt hash (cost factor 12) |
| `role` | pgEnum `role` | NOT NULL | `'user'` | `'owner'` or `'user'` |
| `public_key` | TEXT | nullable | — | Base64-encoded X25519 public key for E2E encryption |
| `encrypted_group_key` | TEXT | nullable | — | Base64-encoded sealed box (group key encrypted for this user) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Timestamp with timezone |

**Indexes:** `users_username_unique` (UNIQUE on `username`)

**Notes:**
- First registered user gets `role = 'owner'` automatically
- `public_key` sent during registration; server uses it to encrypt group key via `crypto_box_seal`
- `encrypted_group_key` returned on login/register for client-side decryption

### `sessions`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` | Session identifier |
| `user_id` | UUID | NOT NULL, FK → users.id (CASCADE) | — | Owner of this session |
| `refresh_token_hash` | TEXT | NOT NULL | — | SHA-256 hash of the refresh token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | — | Timestamp when refresh token expires |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Session creation time |

**Indexes:** `idx_sessions_user_id` on `user_id`, `idx_sessions_token_hash` on `refresh_token_hash`

**Notes:**
- Refresh tokens are never stored in plaintext; only SHA-256 hashes are persisted
- Token rotation: on refresh, old session deleted, new session created
- All sessions deleted on kick/ban/password reset (force logout)
- Expired sessions cleaned on server startup

### `invites`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` | Invite record identifier |
| `token` | TEXT | NOT NULL, UNIQUE | — | Invite token string (used in URLs) |
| `created_by` | UUID | NOT NULL, FK → users.id (CASCADE) | — | Owner who created the invite |
| `revoked` | BOOLEAN | NOT NULL | `false` | Whether invite has been revoked |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Creation timestamp |

**Indexes:** `invites_token_unique` (UNIQUE on `token`)

### `bans`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` | Ban record identifier |
| `user_id` | UUID | NOT NULL, FK → users.id (CASCADE) | — | Banned user |
| `banned_by` | UUID | NOT NULL, FK → users.id (CASCADE) | — | Admin who issued the ban |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Ban timestamp |

**Indexes:** `idx_bans_user_id` on `user_id`

**Notes:**
- Ban check occurs at login time (returns `ACCOUNT_BANNED` error)
- Unbanning deletes the ban record entirely
- Banning also deletes all user sessions (immediate force-logout)

### `channels`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` | Channel identifier |
| `name` | TEXT | NOT NULL, UNIQUE | — | Channel display name (1-32 chars) |
| `type` | pgEnum `channel_type` | NOT NULL | — | `'text'` or `'voice'` |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Creation timestamp |

**Indexes:** `idx_channels_type` on `type`, `channels_name_unique` (UNIQUE on `name`)

**Notes:**
- Maximum 50 channels per server (enforced in `channelService`)
- Default seed channels: `general` (text), `Gaming` (voice)

### `messages`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` | Message identifier |
| `channel_id` | UUID | NOT NULL, FK → channels.id (CASCADE) | — | Channel this message belongs to |
| `user_id` | UUID | NOT NULL, FK → users.id (CASCADE) | — | Message author |
| `encrypted_content` | TEXT | NOT NULL | — | E2E encrypted message content (base64 ciphertext) |
| `nonce` | TEXT | NOT NULL | — | Encryption nonce (base64, 24 bytes) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Message timestamp |

**Indexes:**
- `idx_messages_channel_id` on `channel_id`
- `idx_messages_created_at` on `created_at`
- `messages_channel_created_idx` — composite index on `(channel_id, created_at, id)` for efficient cursor-based pagination queries

**Notes:**
- Server never sees plaintext message content
- Cursor-based pagination: `GET /api/channels/:channelId/messages?cursor=<opaque>&limit=50` — cursors are opaque base64url-encoded strings
- Maximum message length: 2000 characters (validated before encryption on client)

## Migration History

| # | File | Changes |
|---|------|---------|
| 0000 | `0000_classy_lenny_balinger.sql` | Consolidated Postgres schema: all 6 tables, pgEnums (`role`, `channel_type`), all indexes, ON DELETE CASCADE on all FKs, RLS enabled on all tables, Supabase API role revocations |

## Database Configuration

- **Dual-Mode Connection:**
  - **Production:** postgres.js driver when `DATABASE_URL` is set — connection pool with configurable `DB_POOL_MAX` (default 10), `DB_IDLE_TIMEOUT` (default 20s), `DB_CONNECT_TIMEOUT` (default 10s), 30-minute `max_lifetime` for Supabase connection rotation
  - **Testing:** @electric-sql/pglite when `DATABASE_URL` is not set — embedded in-memory Postgres, no external database required
- **Foreign Keys:** Enforced by Postgres natively (ON DELETE CASCADE on all FKs)
- **All DB operations are async** — all queries use `await` (both postgres.js and PGlite are async drivers)
- **Supabase Validation:** Connection URL must include `sslmode=require` for Supabase hosts
- **RLS:** Row-Level Security enabled and forced on all tables; Supabase API roles (`anon`, `authenticated`) revoked from all tables
- **Statement Timeout:** 30s on application connections; migration connections have no timeout

## Seeding

Seeds default channels if the channels table is empty:
- `general` (type: `text`)
- `Gaming` (type: `voice`)

Also triggered during first-user registration (within a transaction).

## In-Memory State (Not Persisted)

| Data | Storage | Purpose |
|------|---------|---------|
| WebSocket connections | `Map<userId, WebSocket>` | Active connection tracking |
| Online presence | `Set<userId>` | Who is currently online |
| Voice peers | `Map<userId, VoicePeer>` | Active voice participants with mediasoup transports/producers/consumers |
| mediasoup Worker/Router | Singleton objects | SFU media processing |
