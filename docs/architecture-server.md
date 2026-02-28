# Architecture — Server (Fastify Backend API)

**Generated:** 2026-02-26 | **Scan Level:** Exhaustive | **Part:** server | **Type:** Backend

## Executive Summary

The server is a Fastify 5 Node.js application providing REST API, WebSocket, and WebRTC media services. It uses a plugin-based domain architecture where each feature (auth, channels, messages, voice, admin) is an isolated Fastify plugin with its own routes and service layer. Data is persisted in PostgreSQL (Supabase managed Postgres in production) via Drizzle ORM with a dual-mode connection layer (postgres.js for production, PGlite for tests). Authentication uses JWT token pairs with bcrypt password hashing. Voice/video is handled by a mediasoup SFU (Selective Forwarding Unit) with coturn for NAT traversal. The server enforces zero-telemetry privacy and never sees plaintext message content.

## Architecture Overview

```
                    ┌─── nginx (TLS, rate limit) ───┐
                    │                                 │
                    ▼                                 ▼
            HTTP :3000/api/*                  WS :3000/ws
                    │                                 │
                    ▼                                 ▼
            ┌──────────────────────────────────────────┐
            │              Fastify 5                    │
            │                                           │
            │  ┌─────────────────────────────────────┐ │
            │  │         Global Middleware             │ │
            │  │  CORS → DB Plugin → Auth Middleware  │ │
            │  └─────────────┬───────────────────────┘ │
            │                │                          │
            │  ┌─────────────┴───────────────────────┐ │
            │  │         Domain Plugins               │ │
            │  │                                       │ │
            │  │  auth/     → Routes + Service         │ │
            │  │  invites/  → Routes + Service         │ │
            │  │  channels/ → Routes + Service         │ │
            │  │  users/    → Routes + Service         │ │
            │  │  messages/ → Routes + Service + WsH   │ │
            │  │  admin/    → Routes + Service         │ │
            │  │  presence/ → Service (in-memory)      │ │
            │  │  voice/    → WsHandler + Service      │ │
            │  │              + mediasoupManager        │ │
            │  └─────────────────────────────────────┘ │
            │                                           │
            │  ┌─────────────────────────────────────┐ │
            │  │         Infrastructure                │ │
            │  │  ws/wsServer → wsRouter               │ │
            │  │  db/connection → schema → migrations   │ │
            │  │  config/cors → config/logRedaction     │ │
            │  │  services/encryptionService            │ │
            │  └─────────────────────────────────────┘ │
            └──────────────────────────────────────────┘
                         │              │
                         ▼              ▼
                   PostgreSQL       mediasoup Worker
                   (Supabase /       (C++ subprocess)
                    PGlite)
                                        │
                                        ▼
                                  coturn (TURN/STUN)
```

## Plugin Registration Order

The order matters — plugins can depend on previously registered decorations:

```typescript
// server/src/app.ts — buildApp()
1.  @fastify/cors           // Infrastructure: CORS restriction
2.  dbPlugin                // Infrastructure: decorates fastify.db
3.  initMediasoup()         // Infrastructure: mediasoup Worker + Router singleton
4.  authMiddleware          // Global: onRequest JWT verification hook
5.  authRoutes              // Domain: /api/auth/*, /api/server/status
6.  inviteRoutes            // Domain: /api/invites/*
7.  channelRoutes           // Domain: prefix /api/channels
8.  userRoutes              // Domain: prefix /api/users
9.  messageRoutes           // Domain: prefix /api/channels (nested :channelId/messages)
10. adminRoutes             // Domain: prefix /api/admin
11. wsServer                // Infrastructure: /ws endpoint + message handler registration
12. registerVoiceHandlers() // Domain: voice WS handlers (depends on wsServer)
13. GET /api/health         // Infrastructure: health check (inline)
14. onClose hook            // Lifecycle: mediasoup shutdown
```

**Plugin encapsulation:**
- `fp()` wrapped (share encapsulation context): `dbPlugin`, `authMiddleware`, `authRoutes`, `inviteRoutes`
- Scoped (own prefix): `channelRoutes`, `userRoutes`, `messageRoutes`, `adminRoutes`

## Domain Architecture

Each domain follows a consistent **Routes + Service** pattern:

```
plugins/{domain}/
  ├── {domain}Routes.ts      # HTTP route handlers (request parsing, response formatting)
  ├── {domain}Service.ts     # Business logic (DB queries, validation, error classes)
  ├── {domain}WsHandler.ts   # WebSocket message handlers (if applicable)
  └── {domain}*.test.ts      # Tests for routes and services
```

### Auth Domain (`plugins/auth/`)

| File | Purpose |
|------|---------|
| `authRoutes.ts` | POST login/register/refresh/logout, GET server/status |
| `authService.ts` | JWT sign/verify, bcrypt hash (cost 12), first-user detection, E2E key distribution |
| `authMiddleware.ts` | Global `onRequest` hook: JWT verification, public route bypass, `request.user` decoration |
| `sessionService.ts` | Session CRUD, token rotation, SHA-256 refresh token hashing, expiry cleanup |

**First-user flow:** When no users exist, registration creates an `owner` without invite. Race condition protected by transaction re-check.

### Channel Domain (`plugins/channels/`)

| File | Purpose |
|------|---------|
| `channelRoutes.ts` | GET list, POST create (owner), DELETE (owner) |
| `channelService.ts` | Channel CRUD, 50-channel limit enforcement, WS broadcast on create/delete |

### Message Domain (`plugins/messages/`)

| File | Purpose |
|------|---------|
| `messageRoutes.ts` | GET messages (cursor pagination, limit 1-100) |
| `messageService.ts` | Message storage (ciphertext only), cursor-based retrieval |
| `messageWsHandler.ts` | `text:send` handler: validate length, store, broadcast `text:receive` |

**E2E enforcement:** Server stores `encrypted_content` + `nonce` — never decrypts.

### Voice Domain (`plugins/voice/`)

| File | Purpose |
|------|---------|
| `mediasoupManager.ts` | Worker/Router singleton, transport creation, TURN credential generation |
| `voiceService.ts` | Peer state (Map), transport/producer/consumer lifecycle, 25-user limit |
| `voiceWsHandler.ts` | 12 WS handlers: join/leave/transport/produce/consume/state |

**Key design decisions:**
- Single mediasoup Worker (single-core media processing)
- Auto-restart on Worker death (2s delay)
- Consumers created in paused state (client must explicitly resume)
- TURN credentials: HMAC-SHA1 time-limited (24h TTL)

### Admin Domain (`plugins/admin/`)

| File | Purpose |
|------|---------|
| `adminRoutes.ts` | POST kick/ban/unban/reset-password, GET bans (all owner-only) |
| `adminService.ts` | Admin actions + cascade: delete sessions, WS notifications, member removal |

### Presence Domain (`plugins/presence/`)

| File | Purpose |
|------|---------|
| `presenceService.ts` | In-memory `Set<userId>`, broadcast presence:sync/update |

**Not persisted** — online status is ephemeral. Lost on server restart.

## Database Architecture

### Connection (`db/connection.ts`)

Dual-mode connection layer — the same `AppDatabase` type is used throughout the application regardless of which driver is active:

- **Production (postgres.js):** When `DATABASE_URL` is set. Connection pool with configurable size (`DB_POOL_MAX`, default 10), idle timeout, connect timeout, and 30-minute `max_lifetime` for Supabase connection rotation. Statement timeout of 30s on application connections. Supabase URLs validated for `sslmode=require`.
- **Testing (PGlite):** When `DATABASE_URL` is not set. @electric-sql/pglite provides an embedded in-memory Postgres instance — full Postgres compatibility with no external dependencies.
- All database operations are **async** (`await`) — both drivers are async, unlike the previous better-sqlite3 which was synchronous.
- `withDbRetry()` wrapper available for retrying transient Postgres errors (connection resets, serialization failures) on the server side.

### Schema (`db/schema.ts`)

6 tables, 31 columns. Uses `pgTable`, `pgEnum`, `uuid()`, `timestamp()`, `boolean()`. See [Data Models](./data-models-server.md) for full schema.

```
users ──┬── sessions (1:N, user_id, ON DELETE CASCADE)
        ├── invites (1:N, created_by, ON DELETE CASCADE)
        ├── bans (1:N, user_id + banned_by, ON DELETE CASCADE)
        └── messages (1:N, user_id, ON DELETE CASCADE)
               └── channels (N:1, channel_id, ON DELETE CASCADE)
```

**pgEnums:** `role` (`'owner'`, `'user'`), `channel_type` (`'text'`, `'voice'`)

**Key type mappings (SQLite → Postgres):**
- `text()` + `crypto.randomUUID()` → `uuid().defaultRandom()`
- `integer({ mode: 'boolean' })` → `boolean()`
- `text({ enum: [...] })` → `pgEnum()`
- `integer` (Unix timestamps) → `timestamp('...', { withTimezone: true })` (native Date objects)

### Migrations (`drizzle/`)

1 consolidated SQL migration managed by drizzle-kit (previous 4 SQLite migrations replaced). Auto-applied on server startup via `runMigrations()`. Migration runner uses a separate connection without statement timeout to avoid DDL operations hitting the 30s limit.

### Cursor Pagination

Message retrieval uses opaque base64url-encoded cursors instead of raw rowid/offset:
- Client sends `?cursor=<opaque>&limit=N`
- Server decodes cursor to `(created_at, id)` tuple for keyset pagination against the `messages_channel_created_idx` composite index
- Response uses `ApiPaginatedList<T>` type: `{ data: [...], nextCursor: string | null }`
- `nextCursor: null` signals end of results

### WebSocket Error Handling for DB Failures

Transient database errors during WebSocket message handling (e.g., `text:send`) are communicated via a `TEXT_ERROR` frame (`{ type: "text:error", payload: { message } }`) instead of closing the WebSocket connection. This allows the client to display an error and retry without losing the WebSocket session.

## Authentication Architecture

### Token Strategy

```
┌──────────────┐     ┌──────────────┐
│ Access Token  │     │ Refresh Token │
│ JWT (15 min)  │     │ JWT (7 days)  │
│ Payload:      │     │ Payload:      │
│  userId       │     │  userId       │
│  role         │     │  jti (UUID)   │
│  username     │     │               │
│ Signed with   │     │ Signed with   │
│ ACCESS_SECRET │     │ REFRESH_SECRET│
└──────────────┘     └──────────────┘
                            │
                     SHA-256 hash stored
                     in sessions table
```

### Auth Middleware Flow

```
Request
  │
  ├── Is public route? ──► YES → Skip auth, continue
  │     (/api/auth/login, /register, /refresh, /health, /server/status, /ws, /invites/:token/validate)
  │
  └── Extract Bearer token from Authorization header
        │
        ├── Missing? → 401 UNAUTHORIZED
        │
        └── Verify JWT with JWT_ACCESS_SECRET
              │
              ├── Invalid/expired? → 401 UNAUTHORIZED
              │
              └── Set request.user = { userId, role }
                    │
                    └── If owner-only route: check role === 'owner'
                          │
                          ├── Not owner? → 403 FORBIDDEN
                          │
                          └── Continue to handler
```

### Token Rotation

On refresh: old session deleted → new session created → new token pair issued. Prevents token reuse.

## WebSocket Architecture

### Connection Lifecycle

```
Client connects: GET /ws?token=<JWT>
  │
  ├── Verify JWT from query param
  │     ├── Invalid → close(4001)
  │     └── Valid → extract userId
  │
  ├── Check for existing connection
  │     └── If exists → close old connection
  │
  ├── Register in connections Map<userId, WebSocket>
  │
  ├── Add to presence (online)
  │
  ├── Broadcast presence:update { userId, status: 'online' }
  │
  └── Send presence:sync { users: [all online] } to this client
```

### Message Routing (`wsRouter.ts`)

```
Incoming message
  │
  ├── Parse JSON (invalid → close 4002)
  │
  ├── Validate shape: { type: string, payload: any }
  │     └── Missing fields → close 4002
  │
  └── Dispatch to handler Map<type, handler>
        │
        ├── Found → handler(ws, userId, payload, messageId)
        │
        └── Not found → ignore (no error)
```

## mediasoup SFU Architecture

```
┌─────────────────────────────────────────────┐
│              mediasoup Worker                 │
│              (C++ subprocess)                │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │              Router                      │ │
│  │  Codecs: audio/opus, video/VP8          │ │
│  │                                          │ │
│  │  ┌─────────────┐  ┌─────────────┐      │ │
│  │  │ Peer A       │  │ Peer B       │      │ │
│  │  │              │  │              │      │ │
│  │  │ SendTransport│  │ SendTransport│      │ │
│  │  │  └─Producer  │  │  └─Producer  │      │ │
│  │  │    (audio)   │  │    (audio)   │      │ │
│  │  │    (video?)  │  │    (video?)  │      │ │
│  │  │              │  │              │      │ │
│  │  │ RecvTransport│  │ RecvTransport│      │ │
│  │  │  └─Consumer  │  │  └─Consumer  │      │ │
│  │  │    (B audio) │  │    (A audio) │      │ │
│  │  │    (B video?)│  │    (A video?)│      │ │
│  │  └─────────────┘  └─────────────┘      │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
        │                    │
        ▼                    ▼
  UDP 40000-49999      coturn :3478
  (RTP/RTCP)           (TURN relay
                        UDP 49152-49252)
```

**Transport configuration:**
- UDP + TCP fallback
- `initialAvailableOutgoingBitrate: 3000000` (3 Mbps for video)
- TURN credentials: HMAC-SHA1 with shared secret, 24h TTL

## Error Handling

### REST API

Consistent error envelope: `{ error: { code: string, message: string } }`

Custom error classes per domain:
- `ChannelValidationError`, `ChannelNotFoundError`
- `UserNotFoundError`, `BanNotFoundError`, `UserAlreadyBannedError`

### WebSocket

Close codes:
- `4001` — Authentication required / invalid token
- `4002` — Malformed message (invalid JSON, missing fields, content too long)
- `4003` — Server-side error (failed to store, kicked/banned)

### mediasoup

Worker death → auto-restart (2s delay) → broadcast `peer-left` to all → clear all voice state.

## Privacy & Security

| Protection | Implementation |
|-----------|---------------|
| Log redaction | 13 sensitive field paths censored in Pino output |
| CORS restriction | Locked to `CLIENT_ORIGIN` env var |
| No telemetry | Enforced by `dependencyAudit.test.ts` (blocklist of 20+ analytics packages) |
| No outbound requests | Enforced by `noOutboundRequests.test.ts` (scans all source files) |
| No `console.log` | ESLint `no-console: error` (server files only) |
| E2E encryption | Server stores only ciphertext + nonce, never decrypts |
| Password security | bcrypt cost factor 12, never logged |
| Token security | Refresh tokens SHA-256 hashed before storage |

## Bootstrap Sequence

```
server/src/index.ts:
  1. Load .env (dotenv)
  2. Auto-generate GROUP_ENCRYPTION_KEY if not set (libsodium)
  3. buildApp() — register all Fastify plugins
  4. runMigrations() — apply pending Drizzle migrations
  5. runSeed() — seed default channels if empty
  6. fastify.listen(HOST:PORT) — default 0.0.0.0:3000
```

## Deployment Architecture

```
┌─────────────────────────────────────────────┐
│                 EC2 Instance                  │
│                                               │
│  docker compose (network_mode: host)         │
│                                               │
│  ┌──────────┐  ┌────────┐  ┌──────────────┐ │
│  │   nginx   │  │  app   │  │    coturn     │ │
│  │  :80/443  │  │ :3000  │  │    :3478     │ │
│  │           │  │        │  │ :49152-49252 │ │
│  │ TLS term  │──│ API+WS │  │ TURN relay   │ │
│  │ Rate limit│  │ Postgres│  │              │ │
│  │ Landing pg│  │ mediasoup│ │              │ │
│  └──────────┘  └───┬────┘  └──────────────┘ │
│                     │                         │
│  ┌──────────┐  ┌───┴──────────────────────┐  │
│  │ certbot   │  │     Persistent Data      │  │
│  │ (12h cron)│  │  ./data/certs/   (TLS)   │  │
│  └──────────┘  │  ./data/downloads/(apps) │  │
│                 └──────────────────────────┘  │
└──────────────────────┬──────────────────────┘
                       │ DATABASE_URL
                       ▼
              ┌──────────────────┐
              │  Supabase        │
              │  Managed Postgres│
              │  (external)      │
              └──────────────────┘
```

**Health check:** `GET /api/health` every 30s (Docker), 30 retries on deploy (release.yml).

**Rollback:** Previous Docker image saved before deploy. On health check failure: revert git, restore image, restart.

## Testing Strategy

| Category | Count | Approach |
|----------|-------|----------|
| Route integration tests | 10 | Full Fastify instance with PGlite (in-memory Postgres) |
| Service unit tests | 8 | Direct function testing with test helpers |
| WebSocket tests | 4 | `injectWS()` for real WebSocket testing |
| Privacy/security audits | 4 | CORS, telemetry, outbound requests, log redaction |
| **Total** | **26** | |

Test infrastructure:
- PGlite (@electric-sql/pglite) for fast, isolated tests — full Postgres compatibility without an external database
- Helpers: `setupApp()`, `seedOwner()`, `seedRegularUser()`, `seedUserWithSession()`, `seedInvite()`
- mediasoup mocked in voice tests (C++ subprocess not started)
