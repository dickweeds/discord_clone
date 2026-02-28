---
project_name: 'discord_clone'
user_name: 'Aidenwoodside'
date: '2026-02-24'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
status: 'complete'
rule_count: 65
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

| Technology | Version | Purpose |
|-----------|---------|---------|
| Electron | v40.x | Desktop app shell |
| electron-vite | — | Build tooling (Vite-powered HMR) |
| React | 18+ | UI framework (renderer process) |
| TypeScript | 5.x | Language — strict mode, full stack |
| Fastify | v5.7.x | Backend HTTP + WebSocket server |
| Node.js | v20+ | Server runtime (required by Fastify v5.7.x) |
| Zustand | v5.0.x | Client state management |
| React Router | v7.13.x | Client routing |
| Tailwind CSS | — | Utility-first styling (warm earthy theme) |
| Radix UI | — | Accessible component primitives |
| Drizzle ORM | v0.45.x | TypeScript-first ORM |
| postgres (postgres.js) | v3.x | PostgreSQL driver (Supabase managed Postgres in production) |
| mediasoup | v3.19.x server / v3.18.x client | WebRTC SFU for group voice/video |
| libsodium-wrappers | v0.8.2 | E2E encryption (isomorphic — Node.js + Chromium) |
| jsonwebtoken | — | JWT access + refresh tokens |
| Pino | — | Structured JSON logging (Fastify default) |
| electron-builder | — | Cross-platform packaging + GitHub Releases |
| electron-updater | — | Auto-update mechanism |
| coturn | — (self-hosted) | TURN/STUN for WebRTC NAT traversal |
| Vitest | — | Vite-native testing framework |
| @electric-sql/pglite | — | Embedded PGlite for test database (replaces SQLite :memory:) |
| React Testing Library | — | Component testing |

**Critical Version Constraints:**
- Fastify v5.7.x requires Node.js v20+ — must match Electron v40.x bundled Node version
- mediasoup server v3.19.x and client v3.18.x are a matched pair — never mix versions
- libsodium-wrappers v0.8.2 is isomorphic — same API in both Node.js and Chromium renderer
- Electron v40.x pins the Chromium version, which determines available WebRTC APIs

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

**Strict Mode & Types:**
- TypeScript strict mode enabled across all packages — no `any` types unless absolutely unavoidable (must include a `// why:` comment)
- Explicit `null` for absent values in API payloads — never `undefined`
- IDs: string UUIDs generated server-side
- Dates: ISO 8601 strings in JSON payloads, Postgres `timestamp with time zone` in storage (native Date objects in TypeScript)
- Booleans: `true`/`false` (never `1`/`0`)

**Cross-Layer Casing Rules (never mix within the same layer):**
- DB columns: `snake_case` — `user_id`, `created_at`, `encrypted_content`
- API payloads (REST + WebSocket): `camelCase` — `channelId`, `encryptedContent`
- Drizzle ORM handles mapping between `snake_case` DB columns and `camelCase` TypeScript objects
- React components: PascalCase files + exports — `ChannelSidebar.tsx`
- Non-component files: camelCase — `useAuthStore.ts`, `encryptionService.ts`
- Types/interfaces: PascalCase — `interface Channel`, `type MessagePayload`
- Constants: `SCREAMING_SNAKE_CASE` — `MAX_PARTICIPANTS`, `WS_RECONNECT_DELAY`

**Import Boundaries:**
- Shared types imported from `shared/` package — the contract between client and server
- Never import server code into client or vice versa — only through `shared/`
- `wsClient` imports Zustand stores to dispatch messages — stores never import `wsClient`

**Error Handling:**
- Backend: Fastify error handler plugin — consistent `{ error: { code, message } }` format. Never leak stack traces or internal details
- Frontend: React Error Boundary at app root. Per-feature errors via Zustand store `error` state
- Never silently swallow errors with empty `try/catch` blocks
- User-facing errors: human-readable, calm, actionable language. No error codes shown to users

### Framework-Specific Rules

**React / Zustand:**
- State management exclusively via Zustand — no React Context for application state, no prop drilling beyond 2 levels
- Store naming: `use{Domain}Store` — `useAuthStore`, `useChannelStore`, `useMessageStore`, `useVoiceStore`, `usePresenceStore`
- Each store: `{ isLoading: boolean, error: string | null, data: T | null }` for async state
- Stores are independent — no cross-store imports. Use subscriptions if cross-store data needed
- Immutable state updates via spread operator
- Components read from stores and call services — never manage server-synced state locally
- Loading states are feature-scoped (per-store `isLoading`), not global. No full-screen spinners. No indicator for actions under 300ms

**React Component Organization:**
- Feature-based: group by domain (`features/auth/`, `features/channels/`) not by type
- Shared UI primitives in `components/` — Radix UI wrappers (`Button`, `Modal`, `Input`, etc.)
- Services (`apiClient`, `wsClient`, `encryptionService`, `mediaService`) are the only code that talks to the server

**Fastify Backend:**
- Plugin-based organization — each domain is a Fastify plugin (`auth`, `channels`, `messages`, `voice`, `admin`, `invites`, `presence`)
- REST endpoints live exclusively in `plugins/*/routes.ts` files, all prefixed with `/api/`
- Auth middleware on all routes except: `/api/auth/login`, `/api/auth/register`, `/api/invites/:token/validate`
- Admin routes check `role === 'owner'` via auth middleware
- Schema-based request/response validation via Fastify's built-in JSON schema
- Use Pino logger — never `console.log` on the backend

**Electron Security:**
- Context isolation enabled, Node.js integration disabled in renderer, sandboxed processes
- Secure bridge between main and renderer via preload scripts only
- Token storage via Electron `safeStorage` API (OS-level encryption: Keychain/DPAPI/libsecret)
- Custom protocol handler `discord-clone://` for invite link deep linking

### Testing Rules

**Organization:**
- Co-located tests — `ChannelSidebar.test.tsx` alongside `ChannelSidebar.tsx`. Never use a separate `__tests__` directory
- Test file naming: `{SourceFile}.test.{ts,tsx}` — matches the source file extension
- Server-side test fixtures in `server/test/fixtures/`

**Frameworks & Tools:**
- Vitest as test runner (Vite-native, Jest-compatible API)
- React Testing Library for component tests — test behavior, not implementation details
- Fastify `inject()` for HTTP route testing — don't spin up a real server
- Mock WebSocket and mediasoup connections in unit tests

**Test Boundaries:**
- Unit tests: individual services, utilities, Zustand store logic
- Component tests: React components via React Testing Library
- Integration tests: Fastify route handlers (full request → response cycle)
- E2E encryption tests: verify encrypt → decrypt roundtrip with libsodium (plaintext → encrypt → store → retrieve → decrypt → verify match)

### Code Quality & Style Rules

**Linting & Formatting:**
- ESLint + Prettier configured for consistent code style
- TypeScript strict mode enforced across all packages

**Project Structure (monorepo):**
- `client/` — Electron + React app (electron-vite scaffold)
- `server/` — Fastify backend
- `shared/` — TypeScript types contract between client and server
- Frontend: feature-based — `src/renderer/src/features/{domain}/`
- Backend: plugin-based — `server/src/plugins/{domain}/`
- Utility files must contain a single concern — no catch-all dumping grounds

**API Response Envelope (mandatory on ALL REST responses):**
- Success: `{ "data": { ... } }`
- Error: `{ "error": { "code": "CHANNEL_NOT_FOUND", "message": "Channel does not exist" } }`
- Paginated list: `ApiPaginatedList<T>` — `{ "data": [{ ... }], "nextCursor": "<opaque>" | null }`
- Non-paginated list: `{ "data": [{ ... }], "count": 2 }`

**Cursor Pagination Pattern:**
- Opaque base64url-encoded cursors (not raw IDs or offsets) — `nextCursor` is returned in `ApiPaginatedList<T>` responses
- Client passes `?cursor=<opaque>&limit=N` — never constructs cursors manually
- Server decodes cursor to determine position; clients treat cursors as opaque strings
- `nextCursor: null` signals end of results

**HTTP Status Codes:**
- `200` success (GET, PUT) · `201` created (POST) · `204` no content (DELETE)
- `400` validation · `401` not authenticated · `403` not authorized · `404` not found · `500` server error

**WebSocket Message Envelope (mandatory on ALL WS messages):**
- Format: `{ type: string, payload: unknown, id?: string }`
- Type pattern: `namespace:action` — `text:send`, `voice:join`, `presence:update`, `rtc:offer`, `channel:created`, `user:kicked`
- Payload fields: camelCase

**Database Naming:**
- Tables: `snake_case`, plural — `users`, `channels`, `messages`, `sessions`, `invites`, `bans`
- Foreign keys: `{referenced_table_singular}_id` — `user_id`, `channel_id`
- Indexes: `idx_{table}_{column}` — `idx_messages_channel_id`
- All DB access through Drizzle queries in service files — no raw SQL outside `db/` directory
- Drizzle schema (`server/src/db/schema.ts`) is the single source of truth for database structure

### Development Workflow Rules

**Local Development:**
- `cd client && npm run dev` — electron-vite HMR, hot-reloads renderer
- `cd server && npm run dev` — tsx watch mode, auto-restarts on changes
- Root-level `npm run dev` — starts both concurrently

**CI/CD (GitHub Actions):**
- `ci.yml` — test + lint on PR
- `release.yml` — push a git tag → builds Electron for Windows/macOS/Linux → publishes to GitHub Releases
- electron-updater checks GitHub Releases API for auto-updates

**Docker Compose (production):**
- `app` — Fastify API + mediasoup SFU + WebSocket
- `coturn` — TURN/STUN server
- `nginx` — Reverse proxy + TLS termination (Let's Encrypt)
- All containers: `restart: unless-stopped`
- Volumes: `./data/certs:/etc/letsencrypt` (TLS), `./data/coturn:/etc/coturn` — database is external (Supabase managed Postgres)

**Deployment (single AWS EC2):**
- Nginx terminates TLS, proxies `/api/*` and `/ws` to Fastify, serves static invite landing page for all other paths
- WebSocket upgrade at `/ws`
- `/health` endpoint for Docker restart policy + AWS CloudWatch monitoring

### Critical Don't-Miss Rules

**Anti-Patterns (NEVER do these):**
- Never create API responses without the `{ data }` or `{ error }` wrapper envelope
- Never import one Zustand store inside another store
- Never use `console.log` on the backend — always Pino logger
- Never add `try/catch` blocks that silently swallow errors
- Never create utility files with more than one unrelated concern
- Never mix `snake_case` and `camelCase` in the same layer
- Never use React Context for application state — Zustand only
- Never prop drill beyond 2 levels — use a Zustand store instead
- Never expose raw error objects to the UI
- Never put raw SQL outside the `db/` directory

**E2E Encryption & Security:**
- Server is a blind relay — stores encrypted content blobs but cannot read them
- Text: encrypted/decrypted client-side with shared group key using XSalsa20-Poly1305 (libsodium)
- Voice/video MVP: transport encryption (DTLS/SRTP) — true E2E via WebRTC Encoded Transform is post-MVP
- Group symmetric key generated on server init; each user gets a copy encrypted with their X25519 public key
- Encrypted messages stored with a `nonce` — both required for decryption
- Never log message content, user activity, or encryption keys — operational events only
- Zero telemetry: no analytics, no usage tracking, no server-side content logging
- Passwords: bcrypt hashed, never plaintext
- JWT access tokens ~15min expiry + refresh token rotation; refresh tokens stored hashed in Postgres
- Invite links: cryptographically random, non-guessable

**Connection & Resilience:**
- WebSocket: exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s), auto-reconnect on disconnect
- WebSocket `TEXT_ERROR` frame: server sends `{ type: "text:error", payload: { message } }` for transient DB failures instead of closing the connection
- REST API: `withRetry()` wrapper on client for idempotent GET requests (retries on transient failures)
- REST API: non-GET requests fail fast, show error to user
- Server: `withDbRetry()` wrapper for transient Postgres errors (connection resets, serialization failures)
- WebRTC voice/video: no auto-reconnect — user manually rejoins voice channel
- Connection state communicated via banner in content area

**Performance Targets:**
- Voice latency: <100ms (mouth to ear)
- Video latency: <200ms
- Text delivery: <1s to all channel participants
- App startup: <5s to usable state
- Voice join: <3s from click to connected
- UI: skeleton placeholders for content areas, no full-screen spinners

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Refer to the architecture document for detailed structural decisions

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack or patterns change
- Review periodically for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-02-24
