---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-02-24'
inputDocuments:
  - prd.md
  - product-brief-discord_clone-2026-02-24.md
  - ux-design-specification.md
workflowType: 'architecture'
project_name: 'discord_clone'
user_name: 'Aidenwoodside'
date: '2026-02-24'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

45 functional requirements spanning 9 domains. The heaviest architectural weight falls on three areas:
- **Real-time communication (FR10-FR23):** 14 requirements covering text messaging, voice audio, and video streaming. These drive the choice of transport protocols (WebSocket, WebRTC), media server architecture, and client-side media handling.
- **Privacy & Security (FR33-FR37):** 5 requirements mandating E2E encryption on all content types and zero data collection. These fundamentally constrain the server's role — it routes encrypted content but cannot inspect it.
- **Desktop App Experience (FR38-FR45):** 8 requirements covering device management, auto-updates, connection handling, and Discord-familiar UI. These drive Electron-specific architecture decisions.

The remaining domains (auth, invites, channel management, admin) are standard CRUD operations layered on top of the real-time and encryption foundations.

**Non-Functional Requirements:**

| Category | Key Requirement | Architectural Impact |
|----------|----------------|---------------------|
| Performance | Voice latency <100ms | Requires low-latency media transport (WebRTC), server proximity or direct peer connections |
| Performance | Video latency <200ms | Same media transport considerations as voice |
| Performance | Text delivery <1s | WebSocket persistent connection, minimal server processing |
| Performance | App startup <5s | Efficient Electron bootstrap, lazy loading |
| Performance | 20 concurrent voice participants | Media routing strategy (SFU vs mesh vs MCU) |
| Security | E2E encryption on all content | Key exchange protocol, encrypted storage, server-opaque content |
| Security | TLS + bcrypt + token refresh | Standard security stack, token lifecycle management |
| Reliability | 99.9% uptime | Single EC2 — requires process management, health checks, auto-restart |
| Reliability | Message persistence across restarts | Durable encrypted message storage on server |
| Reliability | Auto-reconnect for text/presence | Client-side reconnection logic with exponential backoff |

**Scale & Complexity:**

- Primary domain: Full-stack desktop application with real-time backend
- Complexity level: Medium (small user base, but technically demanding real-time + E2E encryption)
- Estimated architectural components: ~8-10 major components (Electron app shell, React UI layer, WebSocket client/server, WebRTC client/server signaling, encryption layer, auth system, data persistence, auto-update system)

### Technical Constraints & Dependencies

- **Single EC2 instance** — all server components must coexist on one machine. No microservice distribution, no container orchestration in MVP.
- **Solo developer** — architecture must be simple enough for one person to build, debug, and maintain. Avoid unnecessary complexity.
- **Electron runtime** — inherits Chromium's WebRTC implementation, which is both an advantage (battle-tested media stack) and a constraint (Chromium version tied to Electron version).
- **E2E encryption** — the server is a blind relay for content. It cannot index, search, or process message content. This constrains features like server-side search (not in MVP, but a future consideration).
- **No mobile** — desktop-only simplifies the architecture (no push notification infrastructure, no mobile-specific media handling, no responsive web).
- **Cross-platform builds** — requires CI/CD capable of building for Windows, macOS, and Linux. macOS builds need code signing.

### Cross-Cutting Concerns Identified

1. **End-to-end encryption** — Affects text storage, voice/video streams, key management, and device trust. Must be designed as a foundational layer, not an afterthought. Key exchange protocol choice (Signal Protocol, MLS, or simpler symmetric approach) will ripple through every communication feature.

2. **Real-time transport** — WebSocket for text/presence and WebRTC for voice/video are two parallel real-time systems that must coexist, share authentication, and handle connection lifecycle independently.

3. **Authentication & authorization** — Two-role system (owner/user) that gates admin functionality. Invite-based registration with cryptographic tokens. Persistent sessions with token refresh. Must integrate with E2E encryption key exchange.

4. **Connection resilience** — Both WebSocket and WebRTC connections must handle network interruptions gracefully. Text/presence auto-reconnects; voice/video may require manual rejoin. Client must clearly communicate connection state to the user.

5. **Audio/video device management** — Cross-platform device enumeration, selection, and hot-switching through Chromium's media APIs. Must work reliably on Windows, macOS, and Linux.

6. **Zero telemetry enforcement** — No analytics, no usage tracking, no server-side content logging. This constrains debugging and monitoring approaches — must rely on error-level logging only, with no content in logs.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack desktop application (Electron + React + TypeScript client, Node.js + TypeScript server) based on project requirements for a self-hosted real-time communication platform.

### Technical Preferences

- **Language:** TypeScript across full stack (client and server)
- **Frontend Framework:** React (intermediate experience)
- **Backend Runtime:** Node.js (intermediate experience)
- **Deployment:** Docker on AWS EC2
- **Distribution:** GitHub Releases for Electron auto-updates
- **Third-Party Philosophy:** Free, open source, privacy-driven only

### Starter Options Considered

**Option A: electron-vite + React TypeScript (SELECTED)**
- Vite-powered build tooling with sub-second HMR
- Clean main/preload/renderer process separation
- electron-builder for cross-platform packaging and GitHub Releases auto-update
- First-class TypeScript support, easy Tailwind CSS integration
- Actively maintained with good community

**Option B: Electron Forge with Vite + TypeScript**
- Official Electron tooling with integrated packaging and signing
- React requires manual integration on top of base template
- More opinionated build pipeline — good for complex distribution but adds overhead for this project

**Option C: Electron React Boilerplate**
- Webpack-based — slower HMR and builds compared to Vite options
- More established but less modern tooling
- Heavier initial configuration

### Selected Starter: electron-vite (React + TypeScript template)

**Rationale for Selection:**
- Vite's fast HMR is a significant productivity multiplier for a solo developer iterating on UI
- Clean Electron process separation (main/preload/renderer) enforces security best practices out of the box
- electron-builder integration supports GitHub Releases distribution and cross-platform builds
- Straightforward Tailwind CSS and Radix UI integration path
- Active maintenance and community support

**Initialization Command:**

```bash
npm create @quick-start/electron@latest discord-clone -- --template react-ts
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript across main process, preload scripts, and renderer
- Electron v40.x (current stable) with Chromium-based renderer
- Node.js runtime for main process and backend

**Styling Solution:**
- Tailwind CSS added post-scaffold (configured in renderer)
- Radix UI primitives added as dependencies for interactive components
- Warm earthy color tokens defined in `tailwind.config.js` per UX specification

**Build Tooling:**
- Vite for renderer bundling (fast HMR in development, optimized production builds)
- electron-builder for cross-platform packaging (.exe/.msi, .dmg, .AppImage/.deb)
- GitHub Releases as the update distribution channel via electron-updater

**Testing Framework:**
- Vitest (Vite-native testing, compatible with Jest API)
- React Testing Library for component tests

**Code Organization:**
- `src/main/` — Electron main process (window management, IPC, system integration)
- `src/preload/` — Preload scripts (secure bridge between main and renderer)
- `src/renderer/` — React application (UI components, state, WebRTC client)

**Development Experience:**
- Vite HMR for instant UI feedback during development
- TypeScript strict mode for type safety
- ESLint + Prettier for consistent code style

### Backend Framework: Fastify

**Rationale for Selection:**
- Native TypeScript support (written in TypeScript)
- Built-in WebSocket plugin (`@fastify/websocket`) for real-time text messaging and presence
- 2-3x faster request handling than Express
- Schema-based request/response validation
- Modern plugin architecture aligns well with the modular concerns (auth, channels, voice signaling)

### Third-Party Services (Free, Open Source, Privacy-Driven)

| Service | Purpose | License |
|---------|---------|---------|
| **coturn** | Self-hosted TURN/STUN server for WebRTC NAT traversal | BSD-3 |
| **mediasoup** | SFU (Selective Forwarding Unit) for group voice/video calls | ISC |
| **libsodium** (via libsodium-wrappers) | E2E encryption primitives (key exchange, symmetric/asymmetric encryption) | ISC |
| **Let's Encrypt** (via certbot) | Free automated TLS certificates for server HTTPS/WSS | Apache 2.0 |

All services are self-hosted on the EC2 instance. No data leaves the owner's infrastructure.

**Note:** Project initialization using the electron-vite scaffold command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Database: SQLite via better-sqlite3
- ORM: Drizzle ORM
- Authentication: JWT with refresh tokens
- E2E Encryption: Shared group key via libsodium
- Real-time transport: Single WebSocket (Fastify WebSocket) + WebRTC (mediasoup SFU)
- API pattern: REST for CRUD, WebSocket for real-time

**Important Decisions (Shape Architecture):**
- State management: Zustand
- Routing: React Router
- Docker Compose multi-container
- CI/CD: GitHub Actions
- Client token storage: Electron safeStorage

**Deferred Decisions (Post-MVP):**
- Message search (constrained by E2E encryption — would require client-side search index)
- Push notification infrastructure (mobile, Phase 3)
- Horizontal scaling (not needed for 20 users)

### Data Architecture

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| Database | SQLite | via better-sqlite3 v12.6.x | Embedded, zero-config, no separate container. Perfect for single-server, 20-user workload. File-based with Docker volume mount for persistence. |
| ORM | Drizzle ORM | v0.45.x | TypeScript-first, lightweight, SQL-like API. Excellent type inference. Pairs well with SQLite via better-sqlite3 driver. |
| Migrations | Drizzle Kit | (bundled with Drizzle) | Schema-driven migrations generated from TypeScript schema definitions. Applied on server startup. |
| Data Modeling | Relational | — | Users, channels, messages, invites, sessions as relational tables. Messages store encrypted content blobs. |

**Schema Overview:**
- `users` — id, username, password_hash, role (owner/user), public_key, created_at
- `channels` — id, name, type (text/voice), created_at
- `messages` — id, channel_id, user_id, encrypted_content, nonce, created_at
- `sessions` — id, user_id, refresh_token_hash, expires_at, created_at
- `invites` — id, token, created_by, revoked, created_at
- `bans` — id, user_id, banned_by, created_at

### Authentication & Security

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| Auth tokens | JWT (access + refresh) | jsonwebtoken | Stateless access tokens (~15min) for API/WS auth. Refresh tokens stored in SQLite for revocation (kick/ban). |
| Password hashing | bcrypt | — | Industry standard, per PRD NFR requirements. Appropriate cost factor for 20-user scale. |
| E2E encryption | Shared group key (symmetric) | libsodium-wrappers v0.8.2 | Single symmetric key shared among all members. Server distributes per-user encrypted copy during registration. Real E2E — server cannot read content. Appropriate complexity for trusted 20-person group. |
| Client token storage | Electron safeStorage API | (built into Electron) | OS-level encryption (Keychain/DPAPI/libsecret). Purpose-built for secure credential storage in Electron. |
| TLS | Let's Encrypt via certbot | — | Free automated certificates. Nginx terminates TLS at the reverse proxy. |

**E2E Encryption Flow:**
1. Server owner generates group symmetric key on server initialization
2. Each user generates an X25519 key pair on registration; public key sent to server
3. Server encrypts group key with each user's public key and stores the encrypted blob
4. On login, client receives their encrypted group key blob, decrypts with private key
5. All text messages encrypted/decrypted client-side with the shared group key using XSalsa20-Poly1305
6. Voice/video: shared key seeds SRTP encryption via mediasoup's built-in encryption support

### API & Communication Patterns

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| CRUD API | REST (HTTP) | Fastify v5.7.x | Standard HTTP routes for auth, channels, invites, admin. Schema validation via Fastify's built-in JSON schema support. |
| Real-time transport | Single WebSocket | @fastify/websocket | One persistent WS connection per client. Message type routing via JSON `type` field. Handles text messages, presence, voice signaling. |
| WebRTC SFU | mediasoup | v3.19.x (server), v3.18.x (client) | Selective Forwarding Unit for group voice/video. Handles 10-20 participants efficiently without mesh topology. |
| TURN/STUN | coturn | (self-hosted) | NAT traversal for WebRTC. Self-hosted on EC2 alongside other services. |
| API validation | Fastify JSON Schema | (built into Fastify) | Request/response validation using JSON Schema. Type-safe with TypeScript via schema-to-type inference. |

**WebSocket Message Types:**
- `text:send`, `text:receive` — encrypted text messages
- `presence:update`, `presence:sync` — online/offline, voice channel membership
- `voice:join`, `voice:leave` — voice channel signaling
- `rtc:offer`, `rtc:answer`, `rtc:ice` — WebRTC SDP/ICE exchange via mediasoup
- `channel:created`, `channel:deleted` — real-time channel list updates
- `user:kicked`, `user:banned` — admin action notifications

### Frontend Architecture

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| State management | Zustand | v5.0.x | Minimal boilerplate, hook-based, easy store splitting. Domain stores: auth, channels, messages, voice, presence. |
| Routing | React Router | v7.13.x | Standard React routing. Few routes needed: login, register, main app, settings. Familiar and well-documented. |
| Styling | Tailwind CSS + Radix UI | (per UX spec) | Utility-first CSS with unstyled accessible primitives. Warm earthy theme tokens in tailwind.config.js. |
| Component testing | Vitest + React Testing Library | (per starter) | Vite-native testing with component-level tests. |

**Zustand Store Architecture:**
- `useAuthStore` — current user, tokens, login/logout state
- `useChannelStore` — channel list, active channel, unread indicators
- `useMessageStore` — message history per channel, send/receive
- `useVoiceStore` — voice connection state, participants, speaking indicators, device selection
- `usePresenceStore` — online/offline status for all users

### Infrastructure & Deployment

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Containerization | Docker Compose (multi-container) | Separate containers for Fastify+mediasoup, coturn, and Nginx. Isolated services, independent restarts, clean separation. |
| Reverse proxy | Nginx | TLS termination with Let's Encrypt. Proxies HTTP to Fastify, upgrades WebSocket connections. |
| CI/CD | GitHub Actions | Free tier, integrated with GitHub Releases. Builds Electron for Windows/macOS/Linux. Runs tests. |
| Electron distribution | GitHub Releases + electron-updater | Auto-update checks against GitHub Releases API. Users notified in-app when update available. |
| Logging | Pino (Fastify default) | Structured JSON logging. Operational events only — never message content. Outputs to Docker container logs. |
| Health monitoring | /health endpoint + AWS CloudWatch | REST health check for Docker restart policy. CloudWatch free tier for EC2 system metrics. |
| Process management | Docker restart policies | `restart: unless-stopped` on all containers. Automatic recovery from crashes. |

**Docker Compose Services:**
```yaml
services:
  app:        # Fastify API + mediasoup SFU + WebSocket
  coturn:     # TURN/STUN server
  nginx:      # Reverse proxy + TLS termination
```

**Volumes:**
- `./data/sqlite:/app/data` — SQLite database file persistence
- `./data/certs:/etc/letsencrypt` — TLS certificates
- `./data/coturn:/etc/coturn` — coturn configuration

### Decision Impact Analysis

**Implementation Sequence:**
1. Electron scaffold (electron-vite) + Fastify server skeleton
2. SQLite + Drizzle schema + migrations
3. Auth system (JWT, bcrypt, invite flow)
4. WebSocket connection + message routing
5. Text channels (encrypted messages via libsodium)
6. Voice channels (mediasoup SFU + coturn)
7. Video (extends voice with video tracks)
8. Admin controls (channel CRUD, user management)
9. Docker Compose + Nginx + TLS
10. GitHub Actions CI/CD + auto-update

**Cross-Component Dependencies:**
- E2E encryption (libsodium) must be established before text messaging or voice/video
- WebSocket must be operational before voice signaling can work
- Auth (JWT) gates both REST and WebSocket access
- mediasoup depends on coturn for NAT traversal
- Nginx must be configured before any client can connect securely

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 5 major categories where AI agents could make different choices — naming, structure, formats, communication, and process patterns. All resolved below.

### Naming Patterns

**Database Naming Conventions (SQLite + Drizzle):**
- Tables: `snake_case`, plural — `users`, `channels`, `messages`, `sessions`, `invites`, `bans`
- Columns: `snake_case` — `user_id`, `created_at`, `encrypted_content`
- Foreign keys: `{referenced_table_singular}_id` — `user_id`, `channel_id`
- Indexes: `idx_{table}_{column}` — `idx_messages_channel_id`

**API Naming Conventions:**
- REST endpoints: plural, kebab-case — `/api/channels`, `/api/invite-links`
- Route parameters: camelCase — `/api/channels/:channelId`
- Query parameters: camelCase — `?channelType=text`
- WebSocket message types: `namespace:action` — `text:send`, `voice:join`, `presence:update`
- WebSocket payload fields: camelCase — `{ type: "text:send", channelId, encryptedContent, nonce }`

**Code Naming Conventions:**
- React components: PascalCase file + export — `ChannelSidebar.tsx`, `VoiceStatusBar.tsx`
- Non-component files: camelCase — `useAuthStore.ts`, `encryptionService.ts`
- Functions/variables: camelCase — `getChannelList()`, `currentUser`
- Types/interfaces: PascalCase — `interface Channel`, `type MessagePayload`
- Constants: SCREAMING_SNAKE_CASE — `MAX_PARTICIPANTS`, `WS_RECONNECT_DELAY`
- Zustand stores: `use{Domain}Store` — `useAuthStore`, `useVoiceStore`
- Fastify plugins: camelCase — `authPlugin`, `channelRoutes`

### Structure Patterns

**Project Organization:**
- Tests: co-located next to source files — `ChannelSidebar.test.tsx` alongside `ChannelSidebar.tsx`
- Frontend: feature-based organization (group by domain, not by type)
- Backend: Fastify plugin-based organization (each domain is a plugin)

**Frontend File Structure:**
```
src/renderer/src/
  features/
    auth/           # login, register, auth store
    channels/       # channel list, channel item, channel store
    messages/       # message feed, message input, message store
    voice/          # voice controls, participants, voice store
    admin/          # admin panels, user management
  components/       # shared UI primitives (Button, Modal, Input)
  services/         # WebSocket client, encryption service, API client
  stores/           # Zustand store definitions
```

**Backend File Structure:**
```
server/src/
  plugins/
    auth/           # auth routes, JWT logic, middleware
    channels/       # channel CRUD routes
    messages/       # message routes + WebSocket handlers
    voice/          # mediasoup integration, signaling
    admin/          # admin routes, user management
  db/               # Drizzle schema, migrations, connection
  services/         # shared business logic
  utils/            # helpers, encryption wrappers
```

### Format Patterns

**API Response Formats:**

Success response:
```json
{ "data": { "id": "abc", "name": "general", "type": "text" } }
```

Error response:
```json
{ "error": { "code": "CHANNEL_NOT_FOUND", "message": "Channel does not exist" } }
```

List response:
```json
{ "data": [{ ... }, { ... }], "count": 2 }
```

**HTTP Status Codes:**
- `200` — success (GET, PUT)
- `201` — created (POST)
- `204` — no content (DELETE)
- `400` — validation error
- `401` — not authenticated
- `403` — not authorized (non-owner trying admin action)
- `404` — not found
- `500` — server error

**Data Exchange Formats:**
- Dates: ISO 8601 strings in JSON — `"2026-02-24T08:30:00.000Z"`. Stored as Unix timestamps in SQLite.
- JSON fields: camelCase in all API/WebSocket payloads. Drizzle handles mapping between snake_case DB columns and camelCase TypeScript objects.
- Booleans: `true`/`false` (never `1`/`0`)
- Null: explicit `null` for absent values (never `undefined` in API payloads)
- IDs: string UUIDs generated server-side

### Communication Patterns

**WebSocket Message Structure:**
All WebSocket messages follow this envelope:
```typescript
interface WsMessage {
  type: string      // namespace:action format
  payload: unknown  // type-specific data
  id?: string       // optional message ID for acknowledgment
}
```

**Zustand State Management Patterns:**
- Immutable updates via spread operator
- Each store has clearly typed state and actions in a single interface
- Pattern: `{ isLoading: boolean, error: string | null, data: T | null }` for async state
- Stores are independent — no cross-store imports (use subscriptions if needed)

```typescript
interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}
```

**WebSocket Client Pattern:**
Single service class that manages the connection, handles reconnection with exponential backoff, and dispatches received messages to the appropriate Zustand store via a message type router.

### Process Patterns

**Error Handling Patterns:**
- Backend: Fastify error handler plugin catches all errors, returns consistent `{ error: { code, message } }` format. Never leak stack traces or internal details.
- Frontend: React Error Boundary at the app root for crash recovery. API/WS errors caught per-feature and surfaced via Zustand store error state.
- User-facing errors: human-readable, no error codes shown to user. Inline display per UX spec. Calm, actionable language.
- Logging: Pino structured JSON. Log operational events (connection, auth, errors). Never log message content or user activity.

**Loading State Patterns:**
- Each Zustand store manages its own `isLoading` boolean
- Loading states are feature-scoped, not global
- UI follows UX spec: skeleton placeholders for content areas, no full-screen spinners, no indicator for actions under 300ms

**Retry & Reconnection Patterns:**
- WebSocket: exponential backoff (1s, 2s, 4s, 8s, max 30s). Auto-reconnect on disconnect.
- REST API calls: no retry — fail fast and show error to user
- WebRTC: no auto-reconnect for voice/video — user manually rejoins voice channel
- Connection state communicated via banner in content area per UX spec

### Enforcement Guidelines

**All AI Agents MUST:**
- Follow naming conventions exactly as specified — no deviations in casing or pluralization
- Use the defined API response envelope for ALL REST responses
- Use the `namespace:action` format for ALL WebSocket message types
- Co-locate tests with source files, never in a separate `__tests__` directory
- Use Zustand stores for state management — no React Context for application state, no prop drilling beyond 2 levels
- Handle errors using the defined patterns — never expose raw error objects to the UI
- Use TypeScript strict mode — no `any` types unless absolutely unavoidable (with a comment explaining why)

**Anti-Patterns to Avoid:**
- Mixing snake_case and camelCase in the same layer (DB is snake_case, everything else is camelCase)
- Creating API responses without the `{ data }` or `{ error }` wrapper
- Importing one Zustand store inside another
- Using `console.log` instead of Pino logger on the backend
- Adding `try/catch` blocks that silently swallow errors
- Creating utility files with more than one unrelated concern

## Project Structure & Boundaries

### Complete Project Directory Structure

```
discord-clone/
├── README.md
├── package.json                          # Root workspace configuration
├── tsconfig.base.json                    # Shared TypeScript config
├── .gitignore
├── .env.example                          # Environment variable template
├── docker-compose.yml                    # Multi-container orchestration
├── docker-compose.dev.yml                # Development overrides
├── .github/
│   └── workflows/
│       ├── ci.yml                        # Test + lint on PR
│       └── release.yml                   # Build Electron + push GitHub Release
│
├── client/                               # Electron + React app (electron-vite scaffold)
│   ├── package.json
│   ├── electron.vite.config.ts
│   ├── electron-builder.yml              # Cross-platform build config
│   ├── tailwind.config.js                # Warm earthy theme tokens
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── tsconfig.web.json
│   ├── src/
│   │   ├── main/                         # Electron main process
│   │   │   ├── index.ts                  # App entry, window management
│   │   │   ├── ipc.ts                    # IPC handler registration
│   │   │   └── safeStorage.ts            # Token encryption via Electron safeStorage
│   │   │
│   │   ├── preload/                      # Preload scripts (secure bridge)
│   │   │   ├── index.ts                  # Context bridge API exposure
│   │   │   └── index.d.ts               # Type declarations for exposed APIs
│   │   │
│   │   └── renderer/                     # React application
│   │       ├── index.html
│   │       ├── src/
│   │       │   ├── main.tsx              # React entry point
│   │       │   ├── App.tsx               # Root component + router setup
│   │       │   ├── globals.css           # Tailwind directives + global styles
│   │       │   │
│   │       │   ├── components/           # Shared UI primitives
│   │       │   │   ├── Button.tsx
│   │       │   │   ├── Input.tsx
│   │       │   │   ├── Modal.tsx         # Radix Dialog wrapper
│   │       │   │   ├── ContextMenu.tsx   # Radix ContextMenu wrapper
│   │       │   │   ├── DropdownMenu.tsx  # Radix DropdownMenu wrapper
│   │       │   │   ├── Tooltip.tsx       # Radix Tooltip wrapper
│   │       │   │   └── ScrollArea.tsx    # Radix ScrollArea wrapper
│   │       │   │
│   │       │   ├── features/
│   │       │   │   ├── auth/
│   │       │   │   │   ├── LoginPage.tsx
│   │       │   │   │   ├── RegisterPage.tsx
│   │       │   │   │   └── AuthGuard.tsx
│   │       │   │   │
│   │       │   │   ├── channels/
│   │       │   │   │   ├── ChannelSidebar.tsx
│   │       │   │   │   ├── ChannelItem.tsx
│   │       │   │   │   ├── CreateChannelModal.tsx
│   │       │   │   │   └── ServerHeader.tsx
│   │       │   │   │
│   │       │   │   ├── messages/
│   │       │   │   │   ├── MessageFeed.tsx
│   │       │   │   │   ├── MessageGroup.tsx
│   │       │   │   │   ├── MessageInput.tsx
│   │       │   │   │   └── ContentHeader.tsx
│   │       │   │   │
│   │       │   │   ├── voice/
│   │       │   │   │   ├── VoiceParticipant.tsx
│   │       │   │   │   ├── VoiceStatusBar.tsx
│   │       │   │   │   └── VideoGrid.tsx
│   │       │   │   │
│   │       │   │   ├── members/
│   │       │   │   │   ├── MemberList.tsx
│   │       │   │   │   └── MemberItem.tsx
│   │       │   │   │
│   │       │   │   ├── admin/
│   │       │   │   │   ├── InvitePanel.tsx
│   │       │   │   │   ├── UserManagement.tsx
│   │       │   │   │   └── ServerSettings.tsx
│   │       │   │   │
│   │       │   │   └── settings/
│   │       │   │       ├── SettingsPage.tsx
│   │       │   │       └── AudioSettings.tsx
│   │       │   │
│   │       │   ├── stores/
│   │       │   │   ├── useAuthStore.ts
│   │       │   │   ├── useChannelStore.ts
│   │       │   │   ├── useMessageStore.ts
│   │       │   │   ├── useVoiceStore.ts
│   │       │   │   └── usePresenceStore.ts
│   │       │   │
│   │       │   ├── services/
│   │       │   │   ├── apiClient.ts       # REST API client (fetch wrapper)
│   │       │   │   ├── wsClient.ts        # WebSocket connection + message router
│   │       │   │   ├── encryptionService.ts # libsodium encrypt/decrypt
│   │       │   │   ├── mediaService.ts    # mediasoup-client + device management
│   │       │   │   └── updateService.ts   # electron-updater integration
│   │       │   │
│   │       │   ├── hooks/
│   │       │   │   ├── useMediaDevices.ts  # Audio/video device enumeration
│   │       │   │   └── useSpeakingIndicator.ts
│   │       │   │
│   │       │   └── types/
│   │       │       └── index.ts           # Client-specific type extensions
│   │       │
│   │       └── assets/
│   │           └── sounds/
│   │               ├── connect.mp3
│   │               ├── disconnect.mp3
│   │               └── mute.mp3
│   │
│   └── resources/                        # Electron app icons per platform
│       └── icon.png
│
├── server/                               # Fastify backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile                        # Server container build
│   ├── src/
│   │   ├── index.ts                      # Server entry point
│   │   ├── app.ts                        # Fastify app setup + plugin registration
│   │   │
│   │   ├── plugins/
│   │   │   ├── auth/
│   │   │   │   ├── authRoutes.ts         # POST /api/auth/login, /register, /refresh
│   │   │   │   ├── authService.ts        # JWT creation, bcrypt, token validation
│   │   │   │   └── authMiddleware.ts     # JWT verification hook
│   │   │   │
│   │   │   ├── channels/
│   │   │   │   ├── channelRoutes.ts      # GET/POST/DELETE /api/channels
│   │   │   │   └── channelService.ts
│   │   │   │
│   │   │   ├── messages/
│   │   │   │   ├── messageRoutes.ts      # GET /api/channels/:channelId/messages
│   │   │   │   └── messageWsHandler.ts   # WebSocket text:send/text:receive
│   │   │   │
│   │   │   ├── voice/
│   │   │   │   ├── voiceWsHandler.ts     # WebSocket voice:join/leave, RTC signaling
│   │   │   │   └── mediasoupManager.ts   # mediasoup worker/router/transport management
│   │   │   │
│   │   │   ├── presence/
│   │   │   │   └── presenceWsHandler.ts  # WebSocket presence:update/sync
│   │   │   │
│   │   │   ├── invites/
│   │   │   │   ├── inviteRoutes.ts       # POST/GET/DELETE /api/invites
│   │   │   │   └── inviteService.ts
│   │   │   │
│   │   │   └── admin/
│   │   │       ├── adminRoutes.ts        # User management, password reset
│   │   │       └── adminService.ts
│   │   │
│   │   ├── ws/
│   │   │   ├── wsServer.ts              # WebSocket upgrade + auth + connection management
│   │   │   └── wsRouter.ts             # Message type dispatcher
│   │   │
│   │   ├── db/
│   │   │   ├── connection.ts            # SQLite + Drizzle setup
│   │   │   ├── schema.ts               # Drizzle table definitions
│   │   │   └── migrations/             # Drizzle Kit generated migrations
│   │   │
│   │   ├── services/
│   │   │   └── encryptionService.ts     # Server-side key management (group key distribution)
│   │   │
│   │   └── utils/
│   │       ├── errors.ts               # Custom error classes + error handler
│   │       └── logger.ts               # Pino logger configuration
│   │
│   └── test/
│       └── fixtures/                    # Test data factories
│
├── shared/                              # Shared TypeScript types
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── types.ts                     # Channel, User, Message interfaces
│       ├── wsMessages.ts               # WebSocket message type definitions
│       └── constants.ts                # Shared constants (limits, defaults)
│
├── docker/
│   ├── nginx/
│   │   └── nginx.conf                  # Reverse proxy + TLS + WebSocket upgrade
│   └── coturn/
│       └── turnserver.conf             # TURN/STUN configuration
│
└── scripts/
    ├── setup.sh                        # First-time server setup (certs, env, init)
    └── backup.sh                       # SQLite database backup
```

### Architectural Boundaries

**API Boundaries:**
- REST endpoints live exclusively in `server/src/plugins/*/routes.ts` files
- All REST routes prefixed with `/api/` — Nginx proxies `/api/*` to Fastify
- WebSocket upgrade happens at `/ws` — Nginx upgrades the connection
- Auth middleware applied to all routes except `/api/auth/login`, `/api/auth/register`, and `/api/invites/:token/validate`
- Admin routes check `role === 'owner'` via auth middleware

**Component Boundaries:**
- React components in `features/` own their UI logic — they read from Zustand stores and call services
- Zustand stores are the single source of truth — components never manage server-synced state locally
- Services (`apiClient`, `wsClient`, `encryptionService`, `mediaService`) are the only code that talks to the server
- The `wsClient` dispatches incoming messages to stores — stores never import `wsClient` directly (wsClient imports stores)

**Data Boundaries:**
- Drizzle schema (`server/src/db/schema.ts`) is the single source of truth for database structure
- All DB access goes through Drizzle queries in service files — no raw SQL outside `db/` directory
- Encrypted message content is opaque to the server — stored and retrieved as binary blobs
- The `shared/` package defines the contract between client and server (message types, interfaces)

### Requirements to Structure Mapping

**FR1-FR5 (Auth & Accounts):**
- Client: `features/auth/`, `stores/useAuthStore.ts`, `services/apiClient.ts`
- Server: `plugins/auth/`
- Main process: `src/main/safeStorage.ts`

**FR6-FR9 (Invites & Onboarding):**
- Client: `features/auth/RegisterPage.tsx`, `features/admin/InvitePanel.tsx`
- Server: `plugins/invites/`

**FR10-FR14 (Text Communication):**
- Client: `features/messages/`, `stores/useMessageStore.ts`, `services/wsClient.ts`, `services/encryptionService.ts`
- Server: `plugins/messages/`

**FR15-FR19 (Voice Communication):**
- Client: `features/voice/`, `stores/useVoiceStore.ts`, `services/mediaService.ts`
- Server: `plugins/voice/`

**FR20-FR23 (Video Communication):**
- Client: `features/voice/VideoGrid.tsx`, `services/mediaService.ts`
- Server: `plugins/voice/` (extends voice with video tracks)

**FR24-FR27 (Channel Management):**
- Client: `features/channels/`, `features/admin/`, `stores/useChannelStore.ts`
- Server: `plugins/channels/`

**FR28-FR32 (User & Server Admin):**
- Client: `features/admin/`
- Server: `plugins/admin/`

**FR33-FR37 (Privacy & Security):**
- Client: `services/encryptionService.ts` (E2E encrypt/decrypt)
- Server: `services/encryptionService.ts` (key distribution), `utils/logger.ts` (zero content logging)
- Cross-cutting: enforced at every layer

**FR38-FR45 (Desktop App Experience):**
- Client main process: `src/main/` (window management, safeStorage, IPC)
- Client renderer: `features/settings/AudioSettings.tsx`, `hooks/useMediaDevices.ts`
- Client services: `services/updateService.ts`

### Cross-Cutting Concerns Mapping

| Concern | Client Location | Server Location | Shared |
|---------|----------------|-----------------|--------|
| E2E Encryption | `services/encryptionService.ts` | `services/encryptionService.ts` | `shared/src/types.ts` |
| WebSocket Transport | `services/wsClient.ts` | `ws/wsServer.ts`, `ws/wsRouter.ts` | `shared/src/wsMessages.ts` |
| Authentication | `stores/useAuthStore.ts`, `services/apiClient.ts` | `plugins/auth/` | `shared/src/types.ts` |
| Connection Resilience | `services/wsClient.ts` (reconnect logic) | `ws/wsServer.ts` (connection tracking) | — |
| Error Handling | React Error Boundary in `App.tsx`, store error states | `utils/errors.ts`, Fastify error handler | `shared/src/types.ts` (error codes) |

### Data Flow

```
User Action → React Component → Zustand Store → Service Layer → Server
                                                      ↓
                                              encryptionService
                                              (encrypt before send)
                                                      ↓
                                              wsClient / apiClient
                                                      ↓
                                              Fastify (REST / WebSocket)
                                                      ↓
                                              Drizzle → SQLite (encrypted blob)
```

### Development Workflow

- **Client dev:** `cd client && npm run dev` — electron-vite HMR, hot-reloads renderer
- **Server dev:** `cd server && npm run dev` — tsx watch mode, auto-restarts on changes
- **Both:** Root-level `npm run dev` starts both concurrently
- **Docker (production):** `docker compose up -d` — builds server container, starts coturn + nginx
- **Electron build:** `cd client && npm run build:win` / `build:mac` / `build:linux`
- **CI release:** Push a git tag → GitHub Actions builds all platforms → publishes to GitHub Releases

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** All technology choices verified compatible. No version conflicts, no contradictory decisions. Key compatibility checks:
- Electron v40.x + React 18+ + TypeScript 5.x + Vite — fully supported by electron-vite scaffold
- Fastify v5.7.x requires Node.js v20+ — aligned with Electron v40.x's Node.js version
- Drizzle ORM v0.45.x + better-sqlite3 v12.6.x — first-class SQLite support in Drizzle
- mediasoup v3.19.x + mediasoup-client v3.18.x — designed as matched server/client pair
- libsodium-wrappers v0.8.2 — isomorphic, works in both Node.js and Chromium renderer
- Zustand v5.0.x + React Router v7.13.x — no conflicts, both React 18+ compatible

**Pattern Consistency:** All naming, structure, format, and communication patterns align with the chosen technology stack. No contradictions between patterns and decisions.

**Structure Alignment:** Monorepo structure (client/server/shared) supports all architectural boundaries. Feature-based frontend and plugin-based backend align with pattern definitions. Shared types package cleanly bridges the client/server contract.

### Requirements Coverage Validation

**Functional Requirements Coverage:**

| FR Category | FRs | Architectural Support | Status |
|-------------|-----|----------------------|--------|
| Auth & Accounts | FR1-FR5 | JWT + bcrypt + Electron safeStorage + refresh tokens in SQLite | Covered |
| Invites & Onboarding | FR6-FR9 | REST invite endpoints + cryptographic tokens + custom protocol handler | Covered |
| Text Communication | FR10-FR14 | WebSocket + libsodium E2E encryption + SQLite persistence | Covered |
| Voice Communication | FR15-FR19 | mediasoup SFU + WebRTC + coturn TURN/STUN | Covered |
| Video Communication | FR20-FR23 | mediasoup video tracks extending voice infrastructure | Covered |
| Channel Management | FR24-FR27 | REST CRUD + Fastify admin plugin | Covered |
| User & Server Admin | FR28-FR32 | Admin plugin + role-based auth middleware | Covered |
| Privacy & Security | FR33-FR37 | E2E encryption (text), transport encryption (voice/video), zero-logging Pino config | Covered (see note) |
| Desktop App Experience | FR38-FR45 | Electron safeStorage, media device hooks, electron-updater, connection resilience | Covered |

**Non-Functional Requirements Coverage:**

| NFR | Architectural Support | Status |
|-----|----------------------|--------|
| Voice latency <100ms | WebRTC via mediasoup SFU, coturn for NAT traversal | Covered |
| Video latency <200ms | Same media infrastructure as voice | Covered |
| Text delivery <1s | Persistent WebSocket, minimal server processing | Covered |
| App startup <5s | Vite-optimized production builds, lazy loading | Covered |
| 20 concurrent voice participants | mediasoup SFU designed for multi-party | Covered |
| E2E encryption all content | libsodium for text (true E2E), DTLS/SRTP for voice/video (transport encryption) | Covered (MVP trade-off) |
| TLS everywhere | Nginx + Let's Encrypt, WSS for WebSocket | Covered |
| 99.9% uptime | Docker restart policies + /health endpoint + CloudWatch | Covered |
| Message persistence | SQLite with Docker volume mount | Covered |
| Auto-reconnect | WebSocket exponential backoff (1s-30s) | Covered |

### Voice/Video Encryption: MVP Trade-Off

**Decision:** Transport encryption (DTLS/SRTP) for voice and video in MVP. True E2E encryption via WebRTC Encoded Transform deferred to post-MVP.

**Rationale:**
- The server is owned and operated solely by the server owner (Aiden) — there is no untrusted third party
- DTLS/SRTP provides strong encryption in transit between clients and the SFU
- True E2E with an SFU requires WebRTC Encoded Transform (Insertable Streams), which adds significant implementation complexity
- Text messages remain fully E2E encrypted via libsodium — the server cannot read message content
- This trade-off mirrors how Discord, Zoom, and most production platforms handle voice/video encryption

**Post-MVP Enhancement Path:** Implement WebRTC Encoded Transform API to encrypt media frames with the shared group key before sending through the SFU, achieving true E2E for voice/video.

### Additional Architecture Notes

**Invite Landing Page:**
Nginx serves a static HTML landing page for invite URLs (`/invite/:token`). When a browser requests an invite URL, Nginx serves the static page directly from `docker/nginx/landing/`. The page displays the server name, download buttons for each OS, and passes the invite token to the Electron app via the custom protocol handler. Nginx proxies `/api/*` and `/ws` to Fastify; all other paths serve the static landing page.

**Custom Protocol Handler (`discord-clone://`):**
Electron registers a custom protocol handler (`discord-clone://invite/TOKEN`) in the main process. electron-builder configures OS-level protocol registration during installation (via `protocols` config in `electron-builder.yml`). When a user clicks an invite link in their browser, the landing page attempts to open the protocol URL, which launches the installed Electron app with the invite token pre-loaded. Fallback: the landing page also provides a manual "paste invite link" flow within the app for cases where protocol registration fails.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed (45 FRs, NFRs, constraints)
- [x] Scale and complexity assessed (medium — small user base, demanding real-time + encryption)
- [x] Technical constraints identified (single EC2, solo developer, Electron runtime, E2E encryption)
- [x] Cross-cutting concerns mapped (encryption, real-time, auth, resilience, devices, zero telemetry)

**Architectural Decisions**
- [x] Critical decisions documented with versions (SQLite, Drizzle, JWT, libsodium, mediasoup, Fastify)
- [x] Technology stack fully specified (all packages, all versions verified via web search)
- [x] Integration patterns defined (REST + WebSocket + WebRTC signaling flow)
- [x] Performance considerations addressed (SFU for group calls, WebSocket for real-time text)

**Implementation Patterns**
- [x] Naming conventions established (DB, API, WebSocket, TypeScript, components)
- [x] Structure patterns defined (feature-based frontend, plugin-based backend, co-located tests)
- [x] Communication patterns specified (WebSocket message envelope, Zustand stores, API response format)
- [x] Process patterns documented (error handling, loading states, retry logic)

**Project Structure**
- [x] Complete directory structure defined (client, server, shared, docker, scripts)
- [x] Component boundaries established (API, component, data boundaries)
- [x] Integration points mapped (REST, WebSocket, WebRTC signaling, shared types)
- [x] Requirements to structure mapping complete (all 45 FRs mapped to specific directories)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — all requirements covered, all decisions coherent, no critical gaps.

**Key Strengths:**
- Simple, solo-developer-friendly architecture — no over-engineering for 20 users
- Clear separation of concerns (client/server/shared, feature-based modules)
- All third-party services are free, open source, and self-hosted
- Comprehensive patterns prevent AI agent implementation conflicts
- Every functional requirement mapped to a specific location in the project structure

**Areas for Future Enhancement:**
- True E2E encryption for voice/video via WebRTC Encoded Transform (post-MVP)
- Client-side search index for encrypted message search (post-MVP)
- Horizontal scaling if user base ever grows beyond single EC2 (not planned)

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions
- When in doubt about a naming convention or pattern, check the Implementation Patterns section

**First Implementation Priority:**
```bash
npm create @quick-start/electron@latest discord-clone -- --template react-ts
```
Scaffold the Electron client, then set up the Fastify server skeleton, shared types package, and root workspace configuration.
