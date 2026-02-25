# Story 2.1: WebSocket Connection & Real-Time Transport

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a persistent WebSocket connection to the server,
so that I can send and receive messages in real-time without page refreshes.

## Acceptance Criteria

1. **Given** I am logged in **When** the app initializes **Then** a WebSocket connection is established to the server at `/ws` **And** the connection is authenticated with my JWT access token

2. **Given** the WebSocket connection is active **When** the server sends a message **Then** the wsClient dispatches it to the appropriate Zustand store based on message type

3. **Given** the WebSocket connection drops unexpectedly **When** the client detects the disconnection **Then** automatic reconnection attempts begin with exponential backoff (1s, 2s, 4s, 8s, max 30s) **And** a connection state indicator is visible to the user

4. **Given** the WebSocket connection is re-established **When** the reconnection succeeds **Then** the client resumes normal operation **And** any missed messages are synced

5. **Given** the WebSocket message protocol **When** any message is sent or received **Then** it follows the `{ type: "namespace:action", payload: {...}, id?: string }` envelope format

## Tasks / Subtasks

- [ ] Task 1: Install `@fastify/websocket` and configure server WebSocket support (AC: 1, 5)
  - [ ] 1.1 Install `@fastify/websocket` in server workspace: `npm install @fastify/websocket -w server`
  - [ ] 1.2 Create `server/src/ws/wsServer.ts` — Fastify plugin that registers `@fastify/websocket` and handles the `/ws` upgrade endpoint
  - [ ] 1.3 Authenticate WebSocket connections: extract JWT from query param `?token=<accessToken>` during upgrade handshake, reject with close code 4001 if invalid/expired
  - [ ] 1.4 Track connected clients: `Map<userId, WebSocket>` — add on connect, remove on close
  - [ ] 1.5 Register wsServer plugin in `server/src/app.ts` (before domain plugins, after auth middleware)

- [ ] Task 2: Create server-side WebSocket message router (AC: 2, 5)
  - [ ] 2.1 Create `server/src/ws/wsRouter.ts` — parses incoming JSON messages and routes by `type` field
  - [ ] 2.2 Validate all incoming messages match `WsMessage` envelope: `{ type: string, payload: unknown, id?: string }` — close connection with code 4002 on malformed messages
  - [ ] 2.3 Create type-safe handler registry: `Map<string, (ws, message, userId) => void>` for registering message type handlers
  - [ ] 2.4 Add handler for `presence:update` — broadcast user online status to all connected clients on connect/disconnect
  - [ ] 2.5 Log all WS connection events via Pino logger (connect, disconnect, errors — NEVER message content)

- [ ] Task 3: Create server-side presence tracking (AC: 2, 4)
  - [ ] 3.1 Create `server/src/plugins/presence/presenceService.ts` — in-memory `Map<userId, { status, connectedAt }>` tracking online users
  - [ ] 3.2 On WebSocket connect: add user to presence map, broadcast `presence:update` with `{ userId, status: 'online' }` to all connected clients
  - [ ] 3.3 On WebSocket disconnect: remove from presence map, broadcast `presence:update` with `{ userId, status: 'offline' }` to all connected clients
  - [ ] 3.4 Create `presence:sync` handler: when a new client connects, send the full online user list as a bulk `presence:sync` message so the joining client knows who's currently online

- [ ] Task 4: Create client-side `wsClient` service (AC: 1, 2, 3, 5)
  - [ ] 4.1 Create `client/src/renderer/src/services/wsClient.ts` — singleton WebSocket connection manager class
  - [ ] 4.2 `connect(accessToken: string)` method: opens `ws://localhost:3000/ws?token=<accessToken>` (or `wss://` in production via `VITE_WS_URL` env var)
  - [ ] 4.3 `disconnect()` method: closes connection cleanly with code 1000
  - [ ] 4.4 `send(message: WsMessage)` method: serializes and sends JSON message — throws if not connected
  - [ ] 4.5 Message dispatcher: on incoming message, parse JSON, route by `type` to registered callbacks via `on(type, callback)` pattern
  - [ ] 4.6 Import `WsMessage`, `WS_TYPES` from `discord-clone-shared` — use shared types for type safety

- [ ] Task 5: Implement client-side reconnection with exponential backoff (AC: 3, 4)
  - [ ] 5.1 On WebSocket `close` event (not user-initiated disconnect): start reconnection attempts
  - [ ] 5.2 Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s — use `WS_RECONNECT_DELAY` and `WS_MAX_RECONNECT_DELAY` from shared constants
  - [ ] 5.3 On successful reconnect: reset backoff timer, dispatch `presence:sync` request to get current online users
  - [ ] 5.4 On reconnection failure: continue retrying, cap at max delay
  - [ ] 5.5 Token refresh before reconnect: if access token is expired, call `useAuthStore.refreshTokens()` first, then reconnect with new token
  - [ ] 5.6 Stop reconnection on: user logout, auth failure (4001 close code), or explicit `disconnect()` call

- [ ] Task 6: Create `usePresenceStore` Zustand store (AC: 2, 3, 4)
  - [ ] 6.1 Create `client/src/renderer/src/stores/usePresenceStore.ts`
  - [ ] 6.2 State: `{ onlineUsers: Map<string, PresenceUpdatePayload>, connectionState: 'connected' | 'connecting' | 'disconnected' | 'reconnecting', isLoading: boolean, error: string | null }`
  - [ ] 6.3 Actions: `setUserOnline(userId)`, `setUserOffline(userId)`, `syncOnlineUsers(users[])`, `setConnectionState(state)`, `clearError()`
  - [ ] 6.4 Wire wsClient message dispatcher to update this store: `presence:update` → `setUserOnline/setUserOffline`, `presence:sync` → `syncOnlineUsers`
  - [ ] 6.5 `connectionState` is updated by wsClient: 'connected' on open, 'disconnected' on close, 'reconnecting' during backoff, 'connecting' during initial connect

- [ ] Task 7: Create ConnectionBanner UI component (AC: 3)
  - [ ] 7.1 Create `client/src/renderer/src/features/layout/ConnectionBanner.tsx`
  - [ ] 7.2 Reads `connectionState` from `usePresenceStore`
  - [ ] 7.3 States:
    - `connected`: hidden (no banner shown)
    - `connecting`: amber banner — "Connecting to server..."
    - `reconnecting`: amber banner with pulse animation — "Trying to reconnect..."
    - `disconnected`: red banner — "Can't connect to server. Check your connection or contact the server owner."
  - [ ] 7.4 On reconnect success: brief green "Connected" flash, auto-dismiss after 2 seconds
  - [ ] 7.5 Position: top of content area (inside `<main>`), above message feed — does NOT block cached content below
  - [ ] 7.6 Styling: `px-4 py-2 text-sm font-medium text-center` — amber uses `bg-amber-600/90 text-white`, red uses `bg-red-600/90 text-white`, green uses `bg-green-600/90 text-white`
  - [ ] 7.7 Respect `prefers-reduced-motion`: use static ring instead of pulse when reduced motion enabled

- [ ] Task 8: Integrate wsClient with auth flow (AC: 1)
  - [ ] 8.1 In `AppLayout.tsx` (or a new `WsProvider` component): on mount after auth, call `wsClient.connect(accessToken)` — do NOT connect in useAuthStore (stores don't import services per architecture)
  - [ ] 8.2 On logout: call `wsClient.disconnect()` before clearing auth state
  - [ ] 8.3 On token refresh: update the wsClient's stored token so reconnection uses the fresh token
  - [ ] 8.4 Do NOT create a React context — wsClient is a service singleton, Zustand stores read state from usePresenceStore

- [ ] Task 9: Update MemberList to use real-time presence (AC: 2)
  - [ ] 9.1 Update `client/src/renderer/src/features/members/MemberList.tsx`: read online status from `usePresenceStore.onlineUsers` instead of the simplified current-user-only logic
  - [ ] 9.2 Online members: those whose `userId` exists in `usePresenceStore.onlineUsers`
  - [ ] 9.3 Offline members: all others
  - [ ] 9.4 Preserve existing grouping UI (ONLINE — {count}, OFFLINE — {count})

- [ ] Task 10: Add `messages` table to database schema (AC: 4)
  - [ ] 10.1 Add `messages` table to `server/src/db/schema.ts`:
    - `id` (text, primary key, UUID)
    - `channel_id` (text, not null, foreign key → channels.id)
    - `user_id` (text, not null, foreign key → users.id)
    - `encrypted_content` (text, not null) — base64-encoded encrypted blob
    - `nonce` (text, not null) — base64-encoded encryption nonce
    - `created_at` (integer, not null, default: Unix timestamp)
  - [ ] 10.2 Add index: `idx_messages_channel_id` on `channel_id`
  - [ ] 10.3 Add index: `idx_messages_created_at` on `created_at` for ordering
  - [ ] 10.4 Run `npm run db:generate -w server` to generate migration
  - [ ] 10.5 Verify migration applies cleanly on server startup

- [ ] Task 11: Write server-side tests (AC: 1-5)
  - [ ] 11.1 Create `server/src/ws/wsServer.test.ts` — test WebSocket upgrade with valid token, test rejection with invalid/expired token (4001), test rejection without token
  - [ ] 11.2 Create `server/src/ws/wsRouter.test.ts` — test message routing by type, test malformed message rejection (4002), test unknown type handling
  - [ ] 11.3 Create `server/src/plugins/presence/presenceService.test.ts` — test add/remove users, test online user list, test broadcast on connect/disconnect

- [ ] Task 12: Write client-side tests (AC: 1-5)
  - [ ] 12.1 Create `client/src/renderer/src/services/wsClient.test.ts` — test connect/disconnect, test message sending, test message dispatch to callbacks, test reconnection backoff sequence, test token refresh before reconnect
  - [ ] 12.2 Create `client/src/renderer/src/stores/usePresenceStore.test.ts` — test setUserOnline/Offline, test syncOnlineUsers, test connectionState transitions
  - [ ] 12.3 Create `client/src/renderer/src/features/layout/ConnectionBanner.test.tsx` — test banner visibility per connection state, test auto-dismiss on reconnect, test reduced motion support

- [ ] Task 13: Final verification (AC: 1-5)
  - [ ] 13.1 Run `npm test -w server` — all existing + new tests pass
  - [ ] 13.2 Run `npm test -w client` — all existing + new tests pass
  - [ ] 13.3 Run `npm run lint` — no lint errors across all workspaces
  - [ ] 13.4 Manual test: start server + client, verify WebSocket connects on login
  - [ ] 13.5 Manual test: kill server, verify reconnection banner appears, restart server, verify reconnection succeeds and banner dismisses
  - [ ] 13.6 Manual test: open two client instances, verify presence shows both users online
  - [ ] 13.7 Manual test: disconnect one client, verify presence updates for remaining client

## Dev Notes

### Critical Architecture Patterns

**WebSocket Server Architecture (`server/src/ws/`):**
```
server/src/ws/
├── wsServer.ts       # Fastify plugin: @fastify/websocket registration, /ws upgrade endpoint, auth, connection tracking
└── wsRouter.ts       # Message type dispatcher: parses WsMessage envelope, routes to registered handlers
```

**@fastify/websocket Integration Pattern:**
```typescript
// wsServer.ts — register as Fastify plugin
import websocket from '@fastify/websocket'
import fp from 'fastify-plugin'

export default fp(async function wsServer(fastify) {
  await fastify.register(websocket)

  // Connected clients map
  const clients = new Map<string, WebSocket>()

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    // Auth: extract token from query string
    const url = new URL(request.url, 'http://localhost')
    const token = url.searchParams.get('token')
    if (!token) {
      socket.close(4001, 'Authentication required')
      return
    }

    // Verify JWT — reuse existing authService.verifyAccessToken()
    try {
      const payload = verifyAccessToken(token)
      const userId = payload.sub
      clients.set(userId, socket)
      // ... handle messages via wsRouter
    } catch {
      socket.close(4001, 'Invalid or expired token')
    }
  })
})
```

**CRITICAL: @fastify/websocket requires these server/package.json changes:**
- Install: `npm install @fastify/websocket -w server`
- This is the ONLY WebSocket package — do NOT use `ws` directly, do NOT use `socket.io`

**WebSocket Message Envelope (from shared/src/ws-messages.ts — already defined):**
```typescript
interface WsMessage<T = unknown> {
  type: string       // namespace:action — e.g., 'text:send', 'presence:update'
  payload: T         // type-specific data
  id?: string        // optional request ID for acknowledgment
}
```

**Existing WS_TYPES constants (from shared/src/ws-messages.ts):**
```typescript
WS_TYPES.PRESENCE_UPDATE  // 'presence:update'
WS_TYPES.TEXT_SEND        // 'text:send'
WS_TYPES.TEXT_RECEIVE     // 'text:receive'
```

**Client wsClient Singleton Pattern:**
```typescript
// services/wsClient.ts — singleton, NOT a React component or hook
class WsClient {
  private socket: WebSocket | null = null
  private handlers = new Map<string, Set<(payload: unknown) => void>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = WS_RECONNECT_DELAY  // 1000ms from constants
  private accessToken: string | null = null
  private intentionalClose = false

  connect(accessToken: string): void { /* ... */ }
  disconnect(): void { this.intentionalClose = true; /* ... */ }
  send<T>(message: WsMessage<T>): void { /* ... */ }
  on(type: string, callback: (payload: unknown) => void): () => void { /* unsubscribe fn */ }
}

export const wsClient = new WsClient()  // singleton export
```

**CRITICAL: wsClient imports stores — stores NEVER import wsClient.**
```typescript
// In wsClient.ts — wire presence updates to store:
import { usePresenceStore } from '../stores/usePresenceStore'

// After parsing incoming message:
if (message.type === WS_TYPES.PRESENCE_UPDATE) {
  const payload = message.payload as PresenceUpdatePayload
  if (payload.status === 'online') {
    usePresenceStore.getState().setUserOnline(payload.userId)
  } else {
    usePresenceStore.getState().setUserOffline(payload.userId)
  }
}
```

### Zustand Store Patterns

**usePresenceStore (new):**
```typescript
interface PresenceState {
  onlineUsers: Map<string, PresenceUpdatePayload>
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'reconnecting'
  isLoading: boolean
  error: string | null
  setUserOnline: (userId: string) => void
  setUserOffline: (userId: string) => void
  syncOnlineUsers: (users: PresenceUpdatePayload[]) => void
  setConnectionState: (state: PresenceState['connectionState']) => void
  clearError: () => void
}
```

**Note:** Zustand v5 uses `Map` objects in state. Use immutable updates: create a new Map from the old one. Example:
```typescript
setUserOnline: (userId) => set((state) => {
  const next = new Map(state.onlineUsers)
  next.set(userId, { userId, status: 'online' })
  return { onlineUsers: next }
})
```

### Server Registration Order

**Updated `app.ts` plugin registration order:**
```typescript
// --- Infrastructure Plugins ---
await app.register(cors, { origin: true, credentials: true })
await app.register(dbPlugin)
await app.register(websocketPlugin)  // NEW — @fastify/websocket

// --- Auth & Domain Plugins ---
await app.register(authMiddleware)
await app.register(authRoutes)
await app.register(inviteRoutes)
await app.register(channelRoutes, { prefix: '/api/channels' })
await app.register(userRoutes, { prefix: '/api/users' })
await app.register(wsServer)  // NEW — /ws endpoint (needs auth middleware)
```

### Messages Table Schema

```typescript
// Addition to server/src/db/schema.ts:
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull().references(() => channels.id),
  userId: text('user_id').notNull().references(() => users.id),
  encryptedContent: text('encrypted_content').notNull(),
  nonce: text('nonce').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_messages_channel_id').on(table.channelId),
  index('idx_messages_created_at').on(table.createdAt),
])
```

**This table is created in this story but NOT used until story 2-2 (Encrypted Text Messaging).** The schema must be in place for story 2-2's WebSocket message handlers to store encrypted messages.

### Connection State Banner UX

Per UX spec:
- **Position:** Top of content area, inside `<main>`, NOT a modal — doesn't block cached content
- **Reconnecting:** Amber banner with pulsing animation — "Trying to reconnect..."
- **Disconnected:** Red banner — "Can't connect to server. Check your connection or contact the server owner."
- **Reconnected:** Brief green flash — "Connected" — auto-dismiss after 2 seconds
- **Reduced motion:** Use static indicator instead of pulse when `prefers-reduced-motion` is enabled

```typescript
// ConnectionBanner.tsx — placed in ContentArea above the message feed:
const connectionState = usePresenceStore((s) => s.connectionState)
const [showReconnected, setShowReconnected] = useState(false)

useEffect(() => {
  if (connectionState === 'connected' && previousState === 'reconnecting') {
    setShowReconnected(true)
    const timer = setTimeout(() => setShowReconnected(false), 2000)
    return () => clearTimeout(timer)
  }
}, [connectionState])
```

### WebSocket Authentication Flow

1. User logs in → receives JWT access token
2. `AppLayout` mounts → calls `wsClient.connect(accessToken)`
3. wsClient opens: `new WebSocket('ws://localhost:3000/ws?token=<accessToken>')`
4. Server extracts token from query string, verifies with `verifyAccessToken()`
5. Valid → connection accepted, user added to client map + presence
6. Invalid → connection closed with code 4001
7. On token expiry: client detects 4001 close, calls `refreshTokens()`, reconnects with new token

**Query param auth (not header):** WebSocket API does not support custom headers. Token is passed as query parameter. This is standard practice — the server extracts it during the HTTP upgrade handshake before the connection is established.

### Reconnection Sequence

```
Disconnect detected (not intentional)
  ↓
Set connectionState = 'reconnecting'
  ↓
Wait reconnectDelay (starts at 1s)
  ↓
Check: is accessToken still valid?
  ├─ No → call refreshTokens(), get new token
  └─ Yes → continue
  ↓
Attempt WebSocket connection
  ├─ Success → reset delay, set 'connected', request presence:sync
  └─ Failure → double delay (cap 30s), retry
```

### Existing Patterns to Follow

**ESM imports with .js extensions (server-side):**
```typescript
import { verifyAccessToken } from '../plugins/auth/authService.js'
import { wsRouter } from './wsRouter.js'
```

**Client imports (no .js, use @renderer alias):**
```typescript
import { usePresenceStore } from '../stores/usePresenceStore'
import { wsClient } from '../services/wsClient'
```

**Fastify plugin pattern (use fastify-plugin for shared decorators):**
```typescript
import fp from 'fastify-plugin'
export default fp(async function wsServer(fastify) { /* ... */ })
```

**Test patterns:**
- Server: use `setupApp()` helper from `server/src/test/helpers.ts`, `seedUserWithSession()` for auth
- Client stores: use `vi.mock` for dependencies, `beforeEach` to reset store state
- Client components: React Testing Library with `vi.mock` for stores

### Shared Constants Already Defined

```typescript
// From shared/src/constants.ts (already exists):
WS_RECONNECT_DELAY = 1000        // Initial reconnect delay (ms)
WS_MAX_RECONNECT_DELAY = 30000   // Max reconnect delay (ms)
WS_HEARTBEAT_INTERVAL = 30000    // Heartbeat interval (ms)
```

### Anti-Patterns to Avoid

- **NEVER** use `socket.io` — use `@fastify/websocket` which wraps the `ws` library
- **NEVER** create React Context for WebSocket state — use Zustand stores
- **NEVER** import wsClient inside a Zustand store — wsClient imports stores, not the reverse
- **NEVER** log message content on the server — log connection events only (Pino logger)
- **NEVER** send plaintext tokens in WebSocket message payloads — auth happens during the HTTP upgrade handshake only
- **NEVER** use `console.log` on the server — use `fastify.log` (Pino)
- **NEVER** store WebSocket state in React component local state — all connection state lives in usePresenceStore

### Deferred / Not In Scope

- **Text messaging:** Sending/receiving encrypted messages is story 2-2. This story establishes the WebSocket transport and presence only.
- **Message sync on reconnect:** Full message gap-fill logic is story 2-4. This story's reconnect just re-establishes the connection and syncs presence.
- **Heartbeat/ping-pong:** Optional optimization. The `WS_HEARTBEAT_INTERVAL` constant exists but implementing server-side heartbeat is deferred unless needed for connection keepalive.
- **Voice signaling:** Voice WebSocket handlers are Epic 3. The wsRouter architecture supports adding new type handlers later.
- **Channel update broadcasts:** Real-time channel create/delete notifications are Epic 5.
- **Rate limiting:** WebSocket message rate limiting is a future concern.

### Previous Story (1-6) Intelligence

**Key patterns from Story 1-6 (last story in Epic 1):**
- AppLayout at `client/src/renderer/src/features/layout/AppLayout.tsx` — this is where wsClient.connect() should be called on mount
- ContentArea at `client/src/renderer/src/features/layout/ContentArea.tsx` — ConnectionBanner goes at the top of this component
- MemberList reads from `useMemberStore` and `useAuthStore` for simplified presence — update to read from `usePresenceStore` instead
- `useMemberStore` still handles fetching the member list via REST — presence is a separate concern tracked by `usePresenceStore`
- Avatar color utility at `client/src/renderer/src/utils/avatarColor.ts` — reuse for any new UI components
- All existing test patterns: `vi.mock`, `beforeEach` state reset, React Testing Library + vitest

**Code review patterns from Epic 1 (prevent repeating):**
- Always create `Error` instances (not plain objects) when throwing
- Add `required` arrays to Fastify JSON schemas
- Extract shared utilities — don't duplicate code across components
- Don't create split state (two sources of truth for the same data)
- Write tests for all new components and services

### Git Intelligence

Recent commits show Epic 1 is complete:
```
4a0d3f7 run document project workflow
46eff4e Merge pull request #3 from AidenWoodside/feature/1-6-UI-CLAUDE
d44969a Fix 10 code review issues for story 1-6
f4e4fc8 Implement story 1-6: Discord-familiar app shell and navigation
```

Pattern: implement → PR → code review → fix. Branch naming: `feature/2-1-websocket-CLAUDE` expected.

### Project Structure Notes

**New files to create:**
```
server/src/ws/
  wsServer.ts                    # WebSocket upgrade + auth + connection management
  wsServer.test.ts               # Server WS tests
  wsRouter.ts                    # Message type dispatcher
  wsRouter.test.ts               # Router tests

server/src/plugins/presence/
  presenceService.ts             # In-memory presence tracking
  presenceService.test.ts        # Presence tests

client/src/renderer/src/services/
  wsClient.ts                    # WebSocket client singleton
  wsClient.test.ts               # Client WS tests

client/src/renderer/src/stores/
  usePresenceStore.ts            # Presence + connection state
  usePresenceStore.test.ts       # Store tests

client/src/renderer/src/features/layout/
  ConnectionBanner.tsx           # Connection state banner
  ConnectionBanner.test.tsx      # Banner tests
```

**Modified files:**
```
server/src/app.ts                           # Register @fastify/websocket + wsServer plugin
server/src/db/schema.ts                     # Add messages table
server/package.json                         # Add @fastify/websocket dependency
client/src/renderer/src/features/layout/AppLayout.tsx    # Call wsClient.connect() on mount
client/src/renderer/src/features/layout/ContentArea.tsx  # Add ConnectionBanner
client/src/renderer/src/features/members/MemberList.tsx  # Use usePresenceStore for online/offline
```

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-real-time-text-communication.md#Story-2.1] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Communication-Patterns] — @fastify/websocket, WS message types, namespace:action pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#WebSocket-Message-Structure] — WsMessage envelope format
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend-Architecture] — Zustand store architecture (usePresenceStore)
- [Source: _bmad-output/planning-artifacts/architecture.md#Retry-Reconnection-Patterns] — Exponential backoff (1s, 2s, 4s, 8s, max 30s)
- [Source: _bmad-output/planning-artifacts/architecture.md#Component-Boundaries] — wsClient dispatches to stores, stores never import wsClient
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#ConnectionError] — Banner states, amber/red/green, auto-dismiss, non-blocking
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Connection-State-Feedback] — Reconnecting amber, disconnected red, reconnected green flash 2s
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility] — ARIA live regions for connection state (assertive), reduced motion support
- [Source: _bmad-output/project-context.md] — WS message envelope, connection resilience, anti-patterns, testing rules
- [Source: shared/src/ws-messages.ts] — WsMessage interface, WS_TYPES constants, payload types
- [Source: shared/src/constants.ts] — WS_RECONNECT_DELAY, WS_MAX_RECONNECT_DELAY, WS_HEARTBEAT_INTERVAL
- [Source: _bmad-output/implementation-artifacts/1-6-discord-familiar-app-shell-and-navigation.md] — AppLayout, ContentArea, MemberList patterns, ESM import rules, test patterns
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-02-24.md] — Code review patterns, technical debt, Epic 2 readiness assessment
- [Source: server/src/app.ts] — Current plugin registration order
- [Source: server/src/db/schema.ts] — Current database schema (users, channels, sessions, invites, bans)
- [Source: server/src/plugins/auth/authService.ts] — verifyAccessToken() for WS auth
- [Source: client/src/renderer/src/services/apiClient.ts] — apiClient pattern reference
- [Source: client/src/renderer/src/stores/useAuthStore.ts] — refreshTokens() for WS token refresh
- [Source: client/src/renderer/src/features/layout/AppLayout.tsx] — Mount point for wsClient.connect()
- [Source: client/src/renderer/src/features/layout/ContentArea.tsx] — Banner insertion point
- [Source: client/src/renderer/src/features/members/MemberList.tsx] — Presence update target

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
