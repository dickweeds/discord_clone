# Story 6.1: Connection Resilience & Error Handling

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the app to detect connection problems, automatically recover, and clearly tell me what's happening,
So that I never lose messages or get stuck in a broken state without knowing why.

## Acceptance Criteria

1. **Given** the WebSocket connection is open **When** no messages are exchanged for 30 seconds **Then** the client sends a heartbeat ping **And** the server responds with a pong **And** stale connections are detected and cleaned up on both sides

2. **Given** the server stops responding to heartbeats **When** 2 consecutive pings go unanswered (60s total) **Then** the client closes the stale socket **And** triggers reconnection with exponential backoff **And** the ConnectionBanner shows "Trying to reconnect..."

3. **Given** a client stops sending heartbeats **When** the server detects no ping for 90 seconds **Then** the server closes the dead connection **And** broadcasts a presence:update offline for that user **And** cleans up voice state if the user was in a voice channel

4. **Given** the browser fires an `offline` event **When** the network drops **Then** the client immediately sets connectionState to 'reconnecting' **And** pauses reconnection attempts until the browser fires `online` **And** the ConnectionBanner shows "No internet connection. Waiting for network..."

5. **Given** the browser fires an `online` event **When** the network is restored **Then** the client immediately attempts a WebSocket reconnection (bypasses backoff timer) **And** if successful, the ConnectionBanner briefly shows "Connected" then auto-dismisses

6. **Given** a text message fails to send **When** the message is marked as 'failed' in the store **Then** the message row shows a red warning icon and "Failed to send" text **And** a "Retry" button is displayed next to the failed message **And** clicking "Retry" re-encrypts and resends the message via WebSocket

7. **Given** a REST API call fails due to a network error (fetch TypeError) **When** the server is unreachable **Then** a user-facing error is shown inline (not a generic browser error) **And** the error message says "Can't reach the server. Check your connection." **And** no unhandled promise rejections occur

8. **Given** the app launches and the server is completely unreachable **When** the initial WebSocket connection fails **Then** the app shows the full UI shell (sidebar, content area) **And** the ConnectionBanner shows "Can't connect to server. Check your connection or contact the server owner." **And** reconnection attempts continue with exponential backoff in the background

9. **Given** a React component throws an unhandled error **When** the error propagates **Then** a feature-level error boundary catches it before the app-root boundary **And** the rest of the app remains functional **And** the error boundary shows "Something went wrong" with a "Try again" button that remounts the component

10. **Given** the WebSocket reconnects after a disconnection **When** the connection is re-established **Then** channels, members, and presence data are re-fetched **And** the message store retains locally cached messages **And** any messages sent during the outage that were marked 'failed' remain visible with retry option

## Tasks / Subtasks

- [ ] Task 1: Implement WebSocket heartbeat — client side (AC: 1, 2)
  - [ ] 1.1 In `client/src/renderer/src/services/wsClient.ts`: add a `heartbeatTimer` private field. On `onopen` (both initial connect and reconnect), start an interval timer at `WS_HEARTBEAT_INTERVAL` (30s from shared/constants.ts). Each tick sends `{ type: 'heartbeat:ping', payload: { timestamp: Date.now() } }` via `this.socket.send()`
  - [ ] 1.2 Track pong responses: add `lastPongReceived` timestamp field. In `handleMessage()`, handle `heartbeat:pong` messages by updating `lastPongReceived` to `Date.now()`
  - [ ] 1.3 Add stale connection detection: on each ping tick, check if `Date.now() - lastPongReceived > WS_HEARTBEAT_INTERVAL * 2` (60s). If stale, call `this.socket.close(4004, 'Heartbeat timeout')` which triggers the existing `onclose` → `startReconnection()` flow
  - [ ] 1.4 Clear the heartbeat timer in `disconnect()`, in `onclose`, and in `clearReconnectTimer()`. Never leave an orphaned interval running
  - [ ] 1.5 Initialize `lastPongReceived = Date.now()` on successful connection open (so the first check doesn't immediately timeout)

- [ ] Task 2: Implement WebSocket heartbeat — server side (AC: 1, 3)
  - [ ] 2.1 In `shared/src/ws-messages.ts`: add `WS_TYPES.HEARTBEAT_PING = 'heartbeat:ping'` and `WS_TYPES.HEARTBEAT_PONG = 'heartbeat:pong'` to the WS_TYPES object. Add payload types `HeartbeatPingPayload { timestamp: number }` and `HeartbeatPongPayload { timestamp: number }`. Export from `shared/src/index.ts`
  - [ ] 2.2 In `server/src/ws/wsServer.ts`: register a handler for `heartbeat:ping` messages. On receipt, send back `{ type: 'heartbeat:pong', payload: { timestamp: <original timestamp> } }` to the same client
  - [ ] 2.3 In `server/src/ws/wsServer.ts`: track `lastHeartbeat` per client. Create a `Map<string, number>` (`clientLastHeartbeat`) updated on each `heartbeat:ping`. On initial connection, set to `Date.now()`
  - [ ] 2.4 In `server/src/ws/wsServer.ts`: start a cleanup interval (`setInterval`) at 45s. On each tick, iterate all clients: if `Date.now() - clientLastHeartbeat > 90000` (90s, 3x heartbeat interval), close the WebSocket with code 4005 ('Heartbeat timeout'), remove from clients map, broadcast `presence:update { status: 'offline' }`, and clean up voice state via existing voice leave logic
  - [ ] 2.5 Clear the cleanup interval on server close (in the existing `fastify.addHook('onClose', ...)`)
  - [ ] 2.6 Handle the `heartbeat:ping` in `wsRouter.ts` OR directly in `wsServer.ts` message handler — decide based on whether it needs to go through the router. Since heartbeat is transport-level (not application-level), handle it directly in `wsServer.ts` before routing to `wsRouter`, which avoids cluttering the application message router

- [ ] Task 3: Implement browser network change detection (AC: 4, 5)
  - [ ] 3.1 In `client/src/renderer/src/services/wsClient.ts`: add `setupNetworkListeners()` called once during first `connect()`. Add `private networkListenersAttached = false` guard to prevent duplicate listeners
  - [ ] 3.2 In `setupNetworkListeners()`: attach `window.addEventListener('offline', ...)` — on offline event: set `this.isNetworkOffline = true`, clear any active reconnect timer (no point reconnecting without network), set connectionState to 'reconnecting', update the ConnectionBanner message context
  - [ ] 3.3 In `setupNetworkListeners()`: attach `window.addEventListener('online', ...)` — on online event: set `this.isNetworkOffline = false`, reset `this.reconnectDelay = WS_RECONNECT_DELAY` (fresh start), immediately call `this.scheduleReconnect()` with delay of 0 (or 500ms for network stabilization)
  - [ ] 3.4 In `scheduleReconnect()`: add a guard — if `this.isNetworkOffline`, do not schedule a timer. Just return. The `online` event will trigger reconnection
  - [ ] 3.5 In `client/src/renderer/src/stores/usePresenceStore.ts`: add `isNetworkOffline: boolean` field (default false) and `setNetworkOffline(offline: boolean)` action, so ConnectionBanner can differentiate "no internet" from "server unreachable"
  - [ ] 3.6 In `client/src/renderer/src/features/layout/ConnectionBanner.tsx`: when `isNetworkOffline === true` and connectionState is 'reconnecting', show "No internet connection. Waiting for network..." instead of "Trying to reconnect..."

- [ ] Task 4: Add failed message retry UI (AC: 6)
  - [ ] 4.1 In `client/src/renderer/src/features/messages/MessageItem.tsx` (or equivalent message row component): check `message.status === 'failed'`. When failed, render: a red warning icon (inline SVG or Radix icon), "Failed to send" text in `error` color (#f23f43), and a "Retry" button (small, inline, text-style)
  - [ ] 4.2 In `client/src/renderer/src/services/messageService.ts`: add `retryMessage(tempId: string, channelId: string, content: string)` function. It re-encrypts the plaintext content using `encryptMessage()` from `encryptionService`, marks the message as `'sending'` in the store, and sends via `wsClient.request()`. On success, calls `confirmMessage()`. On failure, calls `markMessageFailed()` again
  - [ ] 4.3 In `client/src/renderer/src/stores/useMessageStore.ts`: add `retryMessage(tempId: string)` action that: finds the failed message by tempId, extracts its plaintext content, calls `messageService.retryMessage()`, and transitions status from 'failed' → 'sending'. If no message found or content unavailable, no-op
  - [ ] 4.4 Ensure the original plaintext content is preserved in the message store entry for failed messages (check that the current `addOptimisticMessage` stores the plaintext `content` field, not just the encrypted version — this is critical for retry)

- [ ] Task 5: Improve REST API network error handling (AC: 7)
  - [ ] 5.1 In `client/src/renderer/src/services/apiClient.ts`: wrap the `fetch()` call in a try/catch. Catch `TypeError` (the error type thrown when fetch fails due to network issues). When caught, throw a custom `NetworkError` with message "Can't reach the server. Check your connection."
  - [ ] 5.2 Create `client/src/renderer/src/services/errors.ts`: define `export class NetworkError extends Error { constructor(message = "Can't reach the server. Check your connection.") { super(message); this.name = 'NetworkError'; } }` and `export class ApiError extends Error { code: string; constructor(code: string, message: string) { super(message); this.name = 'ApiError'; this.code = code; } }`
  - [ ] 5.3 Update apiClient to use `ApiError` for HTTP error responses (replacing plain Error throws) so callers can distinguish between network failures and server errors
  - [ ] 5.4 In Zustand stores that call apiClient (useChannelStore, useMemberStore, useAuthStore, useMessageStore): ensure catch blocks set `error` state to `err.message` (which will now be the human-readable NetworkError message). Verify no stores surface raw Error objects to the UI

- [ ] Task 6: Add feature-level React error boundaries (AC: 9)
  - [ ] 6.1 Create `client/src/renderer/src/components/FeatureErrorBoundary.tsx`: a class component implementing `componentDidCatch`. Renders a fallback UI: "Something went wrong" in `text-muted` color, and a "Try again" button (secondary style) that calls `this.setState({ hasError: false })` to remount the children. Styled to fit inline (not full-screen), with `bg-secondary` background, 8px border radius, centered content
  - [ ] 6.2 Wrap the main content outlet in `AppLayout.tsx` with `<FeatureErrorBoundary>`. This catches errors in the message feed, channel content, and other main-area features without breaking the sidebar or voice bar
  - [ ] 6.3 Wrap the `MemberList` component in `AppLayout.tsx` with a separate `<FeatureErrorBoundary>` so a member list crash doesn't break the rest of the app
  - [ ] 6.4 The existing app-root ErrorBoundary in `App.tsx` remains as the last-resort catch-all — do NOT remove or modify it. Feature boundaries catch first; app boundary catches anything that escapes

- [ ] Task 7: Improve post-reconnection data sync (AC: 10)
  - [ ] 7.1 In `client/src/renderer/src/services/wsClient.ts`: after reconnection succeeds (in the reconnect `onopen` handler), trigger a full data resync. Call `useChannelStore.getState().fetchChannels()` and `useMemberStore.getState().fetchMembers()` to refresh stale data. These already exist as store actions — just invoke them
  - [ ] 7.2 Voice presence sync already happens via `requestVoicePresenceSync()` — verify this still works after the heartbeat changes. No modification needed unless broken
  - [ ] 7.3 Ensure the message store does NOT clear locally cached messages on reconnect. Messages should persist in the client store across disconnections. Only fresh messages from the server should be merged, not replace existing cache

- [ ] Task 8: Write server-side tests (AC: 1, 2, 3)
  - [ ] 8.1 In `server/src/ws/wsServer.test.ts`: add tests for heartbeat:
    - Test: client sends heartbeat:ping → server responds with heartbeat:pong containing same timestamp
    - Test: client that stops sending heartbeats is disconnected after 90s (mock timers)
    - Test: disconnected stale client triggers presence:update offline broadcast
    - Test: disconnected stale client in voice channel gets voice state cleaned up
  - [ ] 8.2 In `server/src/ws/wsServer.test.ts`: add test that heartbeat cleanup interval is cleared on server close

- [ ] Task 9: Write client-side tests (AC: 1-10)
  - [ ] 9.1 In `client/src/renderer/src/services/wsClient.test.ts`: add heartbeat tests:
    - Test: heartbeat ping sent every 30s after connection opens
    - Test: heartbeat pong updates lastPongReceived timestamp
    - Test: stale connection (no pong for 60s) triggers socket.close(4004)
    - Test: heartbeat timer cleared on disconnect
    - Test: heartbeat timer cleared on reconnect (new timer starts)
  - [ ] 9.2 In `client/src/renderer/src/services/wsClient.test.ts`: add network detection tests:
    - Test: offline event sets connectionState to 'reconnecting' and pauses reconnect attempts
    - Test: online event triggers immediate reconnection
    - Test: no reconnect timers fire while isNetworkOffline is true
    - Test: network listeners attached only once (idempotent setup)
  - [ ] 9.3 In `client/src/renderer/src/features/layout/ConnectionBanner.test.tsx`: add tests:
    - Test: shows "No internet connection. Waiting for network..." when isNetworkOffline is true
    - Test: shows "Trying to reconnect..." when isNetworkOffline is false and state is reconnecting
  - [ ] 9.4 Create `client/src/renderer/src/features/messages/MessageItem.test.tsx` (or update existing):
    - Test: failed message shows warning icon and "Failed to send" text
    - Test: failed message shows "Retry" button
    - Test: clicking "Retry" calls retryMessage
    - Test: non-failed messages do not show retry UI
  - [ ] 9.5 Create `client/src/renderer/src/components/FeatureErrorBoundary.test.tsx`:
    - Test: renders children normally when no error
    - Test: catches child error and shows fallback UI
    - Test: "Try again" button remounts children
    - Test: does not affect sibling components outside the boundary
  - [ ] 9.6 Create `client/src/renderer/src/services/errors.test.ts`:
    - Test: NetworkError has correct name and default message
    - Test: ApiError has code and message properties
  - [ ] 9.7 In `client/src/renderer/src/services/apiClient.test.ts` (create if needed):
    - Test: network failure (fetch throws TypeError) produces NetworkError
    - Test: HTTP error response produces ApiError with code and message
    - Test: successful response returns data normally

- [ ] Task 10: Final verification (AC: 1-10)
  - [ ] 10.1 Run `npm test -w server` — all existing + new tests pass
  - [ ] 10.2 Run `npm test -w client` — all existing + new tests pass
  - [ ] 10.3 Run `npm run lint` — no lint errors
  - [ ] 10.4 Verify no existing tests broken by heartbeat changes (especially wsClient.test.ts and wsServer.test.ts)
  - [ ] 10.5 Verify ConnectionBanner still works correctly for all states (connecting, reconnecting, disconnected, connected)

## Dev Notes

### Critical Architecture Patterns

**Heartbeat Implementation — Transport Level, Not Application Level:**
The heartbeat mechanism is transport-level infrastructure. Handle `heartbeat:ping` directly in `wsServer.ts` before message routing (similar to how the initial `presence:sync` request works). Do NOT route through `wsRouter.ts` — heartbeats are not application messages.

```
Client (every 30s):  → heartbeat:ping { timestamp }
Server (immediate):  → heartbeat:pong { timestamp }
Client (detection):  if no pong for 60s → close(4004) → startReconnection()
Server (cleanup):    if no ping for 90s → close(4005) → broadcast offline → cleanup voice
```

**Timing Constants (all defined in shared/src/constants.ts):**
- `WS_HEARTBEAT_INTERVAL = 30000` — already exists, currently unused
- Client detects stale: 2x interval = 60s (no pong received)
- Server detects stale: 3x interval = 90s (no ping received)
- Server cleanup sweep: every 45s (checks all connections)

**Network Detection — Browser APIs:**
```typescript
window.addEventListener('offline', () => { /* pause reconnection, update banner */ })
window.addEventListener('online', () => { /* immediate reconnect attempt */ })
```
These are standard browser APIs available in Electron's Chromium renderer. They fire reliably on macOS/Windows/Linux when the OS detects network interface changes.

**apiClient Error Handling Pattern:**
```typescript
// Current: fetch failure throws generic TypeError
// After:   fetch failure throws NetworkError with user-friendly message
try {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json();
    throw new ApiError(body.error.code, body.error.message);
  }
  return response;
} catch (err) {
  if (err instanceof TypeError) {
    throw new NetworkError(); // "Can't reach the server. Check your connection."
  }
  throw err; // Re-throw ApiError or other errors
}
```

**Feature Error Boundary — Class Component Required:**
React error boundaries MUST be class components (React 18 does not support error boundaries as function components). Use `componentDidCatch(error, errorInfo)` and `static getDerivedStateFromError(error)`. The "Try again" button resets `hasError` state to false, which remounts children.

### Existing Code to Modify

```
client/src/renderer/src/services/wsClient.ts          # Add heartbeat, network listeners, post-reconnect sync
client/src/renderer/src/services/apiClient.ts          # Network error handling
client/src/renderer/src/stores/usePresenceStore.ts     # Add isNetworkOffline state
client/src/renderer/src/features/layout/ConnectionBanner.tsx  # Network offline messaging
client/src/renderer/src/features/messages/MessageItem.tsx     # Failed message retry UI
client/src/renderer/src/services/messageService.ts     # retryMessage function
client/src/renderer/src/stores/useMessageStore.ts      # retryMessage action
client/src/renderer/src/features/layout/AppLayout.tsx  # Feature error boundary wrapping
server/src/ws/wsServer.ts                              # Heartbeat handler + stale cleanup
shared/src/ws-messages.ts                              # Heartbeat message types
shared/src/index.ts                                    # Export new types
```

### New Files to Create

```
client/src/renderer/src/components/FeatureErrorBoundary.tsx       # Feature-level error boundary
client/src/renderer/src/components/FeatureErrorBoundary.test.tsx
client/src/renderer/src/services/errors.ts                        # NetworkError, ApiError classes
client/src/renderer/src/services/errors.test.ts
```

### Existing Patterns to Follow

**WsClient singleton pattern** — wsClient.ts exports a single instance. All modifications happen on the class, not via external wrappers.

**Store error pattern** — Each Zustand store has `{ isLoading: boolean, error: string | null }`. Set `error` to the human-readable message string from `NetworkError.message` or `ApiError.message`.

**WebSocket message envelope** — `{ type: string, payload: unknown, id?: string }`. Heartbeat messages follow this exact format.

**Component file organization** — Co-located tests: `FeatureErrorBoundary.test.tsx` alongside `FeatureErrorBoundary.tsx`.

**Radix UI primitives** — Use existing component wrappers in `client/src/renderer/src/components/` for any UI elements. Check what's available before creating new ones.

**ESM imports** — Server-side requires `.js` extensions in import paths. Client-side does not.

### Previous Story Intelligence

**From Story 5-1 and 5-2 (most recent):**
- broadcastToAll is already exposed from wsServer.ts
- WS handlers registered directly in wsClient.ts handleMessage() using if/else chain, not via `on()` method
- Admin notifications use a dedicated store (useAdminNotificationStore) — follow similar pattern if needed
- Code review consistently flags: missing required arrays in Fastify schemas, using plain objects instead of Error instances, missing test coverage

**From Story 2-1 (WebSocket foundation):**
- wsClient was built with reconnection from day one
- presenceService broadcasts with per-client try/catch (fault tolerant)
- The `cleanupVoiceOnDisconnect()` pattern should be reused for server-side stale cleanup

### Anti-Patterns to Avoid

- **NEVER** leave orphaned intervals/timers — clear heartbeat timer on disconnect, close, and reconnect
- **NEVER** send heartbeat messages through the application message router — handle at transport level
- **NEVER** clear the local message cache on reconnect — messages should persist across disconnections
- **NEVER** use `console.log` on server — use `fastify.log` (Pino)
- **NEVER** create error boundaries as function components — React requires class components
- **NEVER** show raw Error objects or stack traces to users — always human-readable messages
- **NEVER** attempt WebSocket reconnection when browser reports `navigator.onLine === false` — it will fail
- **NEVER** swallow errors silently — all catch blocks must either handle the error or propagate it
- **NEVER** import Zustand stores inside other stores — wsClient imports stores, stores call services

### Deferred / Not In Scope

- **Offline message queue** — Queuing messages to send when reconnected is post-MVP. Current behavior (mark as failed, user retries) is sufficient
- **Connection quality indicator** — Latency/quality visualization is post-MVP
- **Voice auto-reconnect** — Per architecture: "WebRTC: no auto-reconnect — user manually rejoins voice channel." This remains unchanged
- **Rate limiting enforcement** — Constants exist (30 msg/min, 60 req/min) but enforcement is a separate story
- **Push notifications** — Phase 2 feature

### Project Structure Notes

- All new client files go in existing feature directories (`features/messages/`, `features/layout/`, `components/`, `services/`)
- New error classes in `services/errors.ts` — single concern, shared across features
- No new server plugins needed — heartbeat is added to existing `wsServer.ts`
- No database changes — this story is pure connection/transport layer
- No new shared types beyond heartbeat messages — reuse existing patterns

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR43] — "The app displays a clear 'Can't connect to server' message when the server is unreachable"
- [Source: _bmad-output/planning-artifacts/prd.md#FR44] — "The app automatically attempts to reconnect when connectivity is restored"
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-Reliability] — "Client app connection to server must auto-reconnect for text/presence after network interruptions"
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-Reliability] — "No silent data loss — if a message fails to send, the user must be clearly notified"
- [Source: _bmad-output/planning-artifacts/architecture.md#Retry-Reconnection-Patterns] — "WebSocket: exponential backoff (1s, 2s, 4s, 8s, max 30s). Auto-reconnect on disconnect."
- [Source: _bmad-output/planning-artifacts/architecture.md#Retry-Reconnection-Patterns] — "REST API calls: no retry — fail fast and show error to user"
- [Source: _bmad-output/planning-artifacts/architecture.md#Error-Handling-Patterns] — "React Error Boundary at app root. API/WS errors caught per-feature via Zustand store error state."
- [Source: _bmad-output/planning-artifacts/architecture.md#Connection-Resilience] — "wsClient.ts (reconnect logic), wsServer.ts (connection tracking)"
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#ConnectionError] — Banner states: reconnecting (amber pulse), failed (red static), reconnected (green flash 2s)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Feedback-Patterns] — "Error: Inline, persistent until resolved, non-blocking. Red text below relevant action area."
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Loading-States] — "Never show a full-screen loading spinner — the sidebar should always be interactive"
- [Source: _bmad-output/project-context.md#Connection-Resilience] — "WebSocket: exponential backoff, WS_HEARTBEAT_INTERVAL = 30000 (defined but not used)"
- [Source: _bmad-output/project-context.md#Error-Handling] — "Frontend: React Error Boundary at app root. Per-feature errors via Zustand store error state"
- [Source: shared/src/constants.ts] — WS_RECONNECT_DELAY=1000, WS_MAX_RECONNECT_DELAY=30000, WS_HEARTBEAT_INTERVAL=30000
- [Source: client/src/renderer/src/services/wsClient.ts] — Current reconnection logic, message routing, voice cleanup
- [Source: client/src/renderer/src/stores/usePresenceStore.ts] — connectionState, hasConnectedOnce fields
- [Source: client/src/renderer/src/features/layout/ConnectionBanner.tsx] — Current banner states and styling
- [Source: server/src/ws/wsServer.ts] — Client tracking, presence broadcast, connection management
- [Source: _bmad-output/implementation-artifacts/5-1-channel-management.md] — broadcastToAll pattern, WS handler registration
- [Source: _bmad-output/implementation-artifacts/5-2-user-management-and-administration.md] — Admin notification store pattern, WS force-disconnect

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
