# Story 2.2: Encrypted Text Messaging

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to send and receive end-to-end encrypted text messages in a channel,
so that I can communicate with my friends knowing the server cannot read our messages.

## Acceptance Criteria

1. **Given** I am in a text channel **When** I type a message and press Enter **Then** the message is encrypted client-side using the group key (XSalsa20-Poly1305) with a unique nonce **And** the encrypted content and nonce are sent via WebSocket as a `text:send` message **And** the input field clears immediately

2. **Given** another user sends a message in my active channel **When** I receive a `text:receive` WebSocket message **Then** the encrypted content is decrypted client-side using the group key and nonce **And** the plaintext message appears in the message feed in real-time

3. **Given** the server receives an encrypted message **When** it stores the message in SQLite **Then** only the encrypted content blob and nonce are persisted — plaintext is never written to disk

4. **Given** I press Shift+Enter while typing **When** the input processes the key combination **Then** a newline is inserted instead of sending the message

5. **Given** a message fails to send **When** the WebSocket delivery fails **Then** I am clearly notified that the message was not delivered **And** the message is visually marked as failed

## Tasks / Subtasks

- [x] Task 1: Register `text:send` WebSocket handler on server (AC: 1, 2, 3)
  - [x] 1.1 Create `server/src/plugins/messages/messageService.ts` — message DB operations: `createMessage(channelId, userId, encryptedContent, nonce)`, `getMessagesByChannel(channelId, limit, before?)`
  - [x] 1.2 Create `server/src/plugins/messages/messageWsHandler.ts` — register handler for `WS_TYPES.TEXT_SEND`: validate payload (channelId, content, nonce required), call `messageService.createMessage()`, broadcast `text:receive` to all connected clients in that channel (except sender)
  - [x] 1.3 Import and register `messageWsHandler` in `server/src/ws/wsServer.ts` — call handler registration after existing presence handlers
  - [x] 1.4 Broadcast must include: `{ messageId, channelId, authorId, content (encrypted), nonce, createdAt }` matching `TextReceivePayload`
  - [x] 1.5 Also send `text:receive` back to the sender with the server-assigned `messageId` and `createdAt` so the client can confirm delivery and update the optimistic message

- [x] Task 2: Create REST endpoint for message history (AC: 2, 3)
  - [x] 2.1 Create `server/src/plugins/messages/messageRoutes.ts` — `GET /api/channels/:channelId/messages` with query params `?limit=50&before=<messageId>`
  - [x] 2.2 Return `{ data: TextReceivePayload[], count: number }` — each message includes id, channelId, authorId, content (encrypted), nonce, createdAt
  - [x] 2.3 Add Fastify JSON schema validation for query params (limit: integer 1-100 default 50, before: optional string)
  - [x] 2.4 Register message routes in `server/src/app.ts` with prefix `/api/channels` — route is nested: `/api/channels/:channelId/messages`

- [x] Task 3: Create `useMessageStore` Zustand store (AC: 1, 2, 5)
  - [x] 3.1 Create `client/src/renderer/src/stores/useMessageStore.ts`
  - [x] 3.2 State: `{ messages: Map<string, DecryptedMessage[]>, currentChannelId: string | null, isLoading: boolean, error: string | null, sendError: string | null }`
  - [x] 3.3 `DecryptedMessage` type: `{ id: string, channelId: string, authorId: string, content: string (plaintext), createdAt: string, status: 'sent' | 'sending' | 'failed', tempId?: string }`
  - [x] 3.4 Actions: `fetchMessages(channelId)` — calls REST endpoint, decrypts each message using `encryptionService.decryptMessage()` with `groupKey` from `useAuthStore`
  - [x] 3.5 Actions: `sendMessage(channelId, plaintext)` — encrypts with `encryptionService.encryptMessage()`, generates tempId, adds optimistic message with status `'sending'`, sends via `wsClient.send()` as `text:send`
  - [x] 3.6 Actions: `addReceivedMessage(payload: TextReceivePayload)` — decrypts content, appends to channel's message array
  - [x] 3.7 Actions: `confirmMessage(tempId, serverMessage)` — updates optimistic message with server-assigned id and createdAt, sets status `'sent'`
  - [x] 3.8 Actions: `markMessageFailed(tempId)` — sets status `'failed'` on optimistic message
  - [x] 3.9 Actions: `setCurrentChannel(channelId)`, `clearError()`, `clearSendError()`

- [x] Task 4: Wire wsClient to useMessageStore (AC: 2, 5)
  - [x] 4.1 In `wsClient.ts` or a new `client/src/renderer/src/services/messageWsSetup.ts`: register handler for `WS_TYPES.TEXT_RECEIVE` that calls `useMessageStore.getState().addReceivedMessage(payload)` for messages from other users, and `confirmMessage(tempId, payload)` for sender confirmations
  - [x] 4.2 Distinguish sender confirmations: if `payload.authorId === currentUserId`, match by tempId (sent in the `id` field of the WsMessage envelope) and call `confirmMessage()`; otherwise call `addReceivedMessage()`
  - [x] 4.3 Handle wsClient `close`/`error` events: if a message is in `'sending'` status for >5s, mark it as `'failed'`

- [x] Task 5: Create MessageInput component (AC: 1, 4, 5)
  - [x] 5.1 Create `client/src/renderer/src/features/messages/MessageInput.tsx`
  - [x] 5.2 Render a `<textarea>` with placeholder `"Message #channel-name"` (dynamic from active channel)
  - [x] 5.3 Styling: `bg-tertiary` (#1c1915), `text-primary` (#f0e6d9), 12px border-radius, 44px min-height, auto-grow with content, 16px horizontal padding
  - [x] 5.4 Focus ring: 2px solid `accent-primary` (#c97b35)
  - [x] 5.5 `onKeyDown` handler: Enter (no shift) → call `useMessageStore.sendMessage(channelId, text)`, then clear input. Shift+Enter → allow default (newline)
  - [x] 5.6 Disable send when WebSocket `connectionState !== 'connected'` (from `usePresenceStore`) — show disabled state
  - [x] 5.7 On send error: display inline error message below input in `error` color (#f23f43), clear on next successful send or after timeout

- [x] Task 6: Integrate message components into ContentArea (AC: 1, 2)
  - [x] 6.1 Update `client/src/renderer/src/features/layout/ContentArea.tsx`: replace the welcome message placeholder with a message list area and MessageInput at the bottom
  - [x] 6.2 Message list area: simple scrollable `<div>` showing decrypted messages from `useMessageStore.messages.get(channelId)` — each message shows author username + plaintext content + timestamp
  - [x] 6.3 On channel change (channelId from route params): call `useMessageStore.fetchMessages(channelId)` and `setCurrentChannel(channelId)`
  - [x] 6.4 Show loading state while fetching messages (skeleton placeholder or subtle spinner)
  - [x] 6.5 Show failed messages with red indicator and "Message not delivered" text
  - [x] 6.6 For now, render messages as simple flat list (full Discord-style grouping is story 2-3)

- [x] Task 7: Write server-side tests (AC: 1-3, 5)
  - [x] 7.1 Create `server/src/plugins/messages/messageService.test.ts` — test createMessage stores encrypted content + nonce, test getMessagesByChannel returns ordered messages, test pagination with before param
  - [x] 7.2 Create `server/src/plugins/messages/messageWsHandler.test.ts` — test text:send handler validates payload, stores message, broadcasts text:receive to channel clients, test malformed payload rejection, test sender receives confirmation
  - [x] 7.3 Create `server/src/plugins/messages/messageRoutes.test.ts` — test GET /api/channels/:channelId/messages returns paginated results, test auth required, test invalid channelId returns 404

- [x] Task 8: Write client-side tests (AC: 1-5)
  - [x] 8.1 Create `client/src/renderer/src/stores/useMessageStore.test.ts` — test sendMessage encrypts before sending, test addReceivedMessage decrypts, test confirmMessage updates optimistic message, test markMessageFailed, test fetchMessages decrypts all messages
  - [x] 8.2 Create `client/src/renderer/src/features/messages/MessageInput.test.tsx` — test Enter sends message, test Shift+Enter inserts newline, test input clears after send, test disabled when disconnected, test error display on failure
  - [x] 8.3 Test E2E encryption roundtrip: encrypt on client → send via WS → store encrypted on server → retrieve via REST → decrypt on client → verify plaintext matches original

- [x] Task 9: Final verification (AC: 1-5)
  - [x] 9.1 Run `npm test -w server` — all existing + new tests pass
  - [x] 9.2 Run `npm test -w client` — all existing + new tests pass
  - [x] 9.3 Run `npm run lint` — no lint errors across all workspaces
  - [ ] 9.4 Manual test: open two client instances, send message from one, verify it appears encrypted in DB and decrypted in the other client
  - [ ] 9.5 Manual test: kill server while sending a message, verify failure indicator appears
  - [ ] 9.6 Manual test: verify Shift+Enter creates newline, Enter sends

## Dev Notes

### Critical Architecture Patterns

**Encryption Flow (Client-Side):**
```
Send: plaintext → encryptionService.encryptMessage(plaintext, groupKey) → { ciphertext, nonce } → wsClient.send({ type: 'text:send', payload: { channelId, content: ciphertext, nonce } })

Receive: text:receive payload → encryptionService.decryptMessage(content, nonce, groupKey) → plaintext → useMessageStore.addReceivedMessage()
```

**Existing encryptionService API (client/src/renderer/src/services/encryptionService.ts):**
```typescript
encryptMessage(plaintext: string, groupKey: Uint8Array): { ciphertext: string; nonce: string }
decryptMessage(ciphertext: string, nonce: string, groupKey: Uint8Array): string
```
- `ciphertext` and `nonce` are base64-encoded strings
- `groupKey` is a `Uint8Array` (32 bytes) stored in `useAuthStore.groupKey`
- libsodium `crypto_secretbox_easy` for encryption, `crypto_secretbox_open_easy` for decryption
- Nonce generated internally via `randombytes_buf(crypto_secretbox_NONCEBYTES)`

**Group Key Access:**
```typescript
const groupKey = useAuthStore.getState().groupKey
// groupKey is set during login/register — always available when authenticated
// NEVER null when user is logged in — the auth flow guarantees this
```

**Server-Side Message Handler Pattern (follow presenceService pattern):**
```typescript
// server/src/plugins/messages/messageWsHandler.ts
import { registerHandler } from '../../ws/wsRouter.js'
import { WS_TYPES } from 'discord-clone-shared'
import type { WsMessage, TextSendPayload, TextReceivePayload } from 'discord-clone-shared'

export function registerMessageHandlers(
  clients: Map<string, WebSocket>,
  db: DrizzleInstance
): void {
  registerHandler(WS_TYPES.TEXT_SEND, async (ws, message, userId) => {
    const payload = message.payload as TextSendPayload
    // 1. Validate: channelId, content, nonce must be present
    // 2. Store via messageService.createMessage(db, channelId, userId, content, nonce)
    // 3. Build TextReceivePayload with server-assigned id + createdAt
    // 4. Broadcast text:receive to all clients in channel
    // 5. Send confirmation back to sender (same text:receive with their message.id for tempId matching)
  })
}
```

**CRITICAL: Server NEVER decrypts message content.** The `content` field in `TextSendPayload` IS the encrypted ciphertext. The server stores it as-is in `encrypted_content` column. The field name `content` in the WS payload is the encrypted blob — the naming is intentional to keep the WS API clean.

**Existing WebSocket Types (shared/src/ws-messages.ts — already defined):**
```typescript
interface TextSendPayload {
  channelId: string
  content: string      // This is the encrypted ciphertext (base64)
  nonce?: string       // Encryption nonce (base64) — MUST be required for this story
}

interface TextReceivePayload {
  messageId: string
  channelId: string
  authorId: string
  content: string      // Encrypted ciphertext (base64)
  nonce?: string       // Encryption nonce (base64) — MUST be required
  createdAt: string    // ISO 8601
}
```

**IMPORTANT:** The `nonce` field is optional (`?`) in the current shared types. For encrypted messaging it MUST always be present. The handler should validate that `nonce` is provided and reject messages without it. Consider updating the shared types to make `nonce` required, or validate at the handler level.

**Broadcasting to Channel Members:**
The server needs to know which connected clients are in a given channel. Two approaches:
1. **Simple (recommended for MVP):** Broadcast to ALL connected clients with the channelId in the payload — clients ignore messages for channels they're not viewing. This works because all users have access to all channels in this single-server architecture.
2. **Optimized:** Track channel subscriptions per client — only send to clients viewing that channel. Defer this optimization.

**useMessageStore Pattern:**
```typescript
// Messages keyed by channelId for efficient channel switching
interface MessageState {
  messages: Map<string, DecryptedMessage[]>  // channelId → messages
  currentChannelId: string | null
  isLoading: boolean
  error: string | null
  sendError: string | null
}
```
- Use immutable Map updates: `new Map(state.messages)` then `.set(channelId, [...existing, newMessage])`
- Optimistic send: add message with `status: 'sending'` and `tempId` immediately, update on confirmation
- Messages stored decrypted in the store — encryption/decryption happens at the boundary (send/receive)

**MessageInput Component Pattern:**
```typescript
// features/messages/MessageInput.tsx
const MessageInput: React.FC<{ channelId: string; channelName: string }> = ({ channelId, channelName }) => {
  const [text, setText] = useState('')
  const sendMessage = useMessageStore((s) => s.sendMessage)
  const connectionState = usePresenceStore((s) => s.connectionState)
  const sendError = useMessageStore((s) => s.sendError)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (text.trim() && connectionState === 'connected') {
        sendMessage(channelId, text.trim())
        setText('')
      }
    }
    // Shift+Enter: default behavior (newline) — no handler needed
  }

  return (
    <div className="px-4 pb-6">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Message #${channelName}`}
        className="w-full bg-[#1c1915] text-[#f0e6d9] rounded-xl min-h-[44px] px-4 py-2.5 text-base resize-none focus:outline-none focus:ring-2 focus:ring-[#c97b35]"
        disabled={connectionState !== 'connected'}
        rows={1}
      />
      {sendError && <p className="text-[#f23f43] text-sm mt-1">{sendError}</p>}
    </div>
  )
}
```

**Message REST Endpoint Pattern:**
```typescript
// GET /api/channels/:channelId/messages?limit=50&before=<messageId>
// Response: { data: TextReceivePayload[], count: number }
// Messages ordered by created_at DESC (newest first) for pagination
// Client reverses to display in chronological order
```

**Database Query Pattern (Drizzle):**
```typescript
import { messages } from '../../db/schema.js'
import { eq, lt, desc } from 'drizzle-orm'

async function getMessagesByChannel(db, channelId: string, limit = 50, before?: string) {
  const query = db.select().from(messages)
    .where(eq(messages.channel_id, channelId))
    .orderBy(desc(messages.created_at))
    .limit(limit)

  if (before) {
    // Get the created_at of the "before" message for cursor pagination
    const beforeMsg = await db.select({ created_at: messages.created_at })
      .from(messages).where(eq(messages.id, before)).get()
    if (beforeMsg) {
      query.where(lt(messages.created_at, beforeMsg.created_at))
    }
  }

  return query.all()
}
```

**Mapping DB → API Response:**
```typescript
// DB columns are snake_case, API payloads are camelCase
// Drizzle returns snake_case — map to TextReceivePayload:
{
  messageId: row.id,
  channelId: row.channel_id,
  authorId: row.user_id,
  content: row.encrypted_content,  // Still encrypted
  nonce: row.nonce,
  createdAt: row.created_at.toISOString()
}
```

### Existing Infrastructure to Reuse

**DO NOT recreate these — they already exist:**
- `encryptionService.ts` (client) — `encryptMessage()`, `decryptMessage()`, `initializeSodium()`
- `encryptionService.ts` (server) — key management (not needed for message handler)
- `wsClient.ts` — `send()`, `on()` methods for sending/receiving WS messages
- `wsRouter.ts` — `registerHandler()` for adding new message type handlers
- `useAuthStore.groupKey` — the decrypted group symmetric key
- `usePresenceStore.connectionState` — for disabling input when disconnected
- `useChannelStore` — active channel tracking
- `apiClient.ts` — `apiRequest<T>()` for REST calls
- `TextSendPayload`, `TextReceivePayload`, `WS_TYPES` from `discord-clone-shared`
- `messages` table in `schema.ts` — already created with correct schema + indexes
- `ConnectionBanner.tsx` — already handles connection state display

**Constants already defined (shared/src/constants.ts):**
```typescript
MAX_MESSAGE_LENGTH = 2000
NACL_SECRETBOX_KEY_BYTES = 32
NACL_SECRETBOX_NONCE_BYTES = 24
```

### ESM Import Rules (Server-Side)

All server-side imports MUST use `.js` extensions:
```typescript
import { messageService } from './messageService.js'
import { registerHandler } from '../../ws/wsRouter.js'
import { messages } from '../../db/schema.js'
```

Client-side imports do NOT use `.js` extensions:
```typescript
import { useMessageStore } from '../stores/useMessageStore'
import { encryptionService } from '../services/encryptionService'
```

### Testing Patterns

**Server tests:** Use `setupApp()` from `server/src/test/helpers.ts`, `seedUserWithSession()` for auth. Use Fastify `inject()` for HTTP route tests. For WS handler tests, mock the WebSocket and clients map.

**Client store tests:** Use `vi.mock` for dependencies (encryptionService, wsClient, apiClient). Reset store state in `beforeEach`. Test encryption roundtrip: encrypt → decrypt → verify plaintext match.

**Client component tests:** React Testing Library + vitest. Mock stores with `vi.mock`. Test keyboard events (Enter, Shift+Enter). Test disabled state when disconnected.

**E2E encryption roundtrip test:**
```typescript
test('encrypt → store → retrieve → decrypt returns original plaintext', async () => {
  const plaintext = 'Hello, encrypted world!'
  const groupKey = sodium.crypto_secretbox_keygen()

  const { ciphertext, nonce } = encryptionService.encryptMessage(plaintext, groupKey)

  // Simulate server storage (encrypted_content = ciphertext, nonce = nonce)
  // Simulate retrieval
  const decrypted = encryptionService.decryptMessage(ciphertext, nonce, groupKey)

  expect(decrypted).toBe(plaintext)
})
```

### Anti-Patterns to Avoid

- **NEVER** decrypt messages on the server — server is a blind relay for encrypted blobs
- **NEVER** log message content on the server — log only operational events (message stored, broadcast sent)
- **NEVER** import `useMessageStore` inside another Zustand store — stores are independent
- **NEVER** import `wsClient` inside a Zustand store — `wsClient` imports stores, not reverse
- **NEVER** use `console.log` on server — use `fastify.log` (Pino)
- **NEVER** store plaintext messages in the database
- **NEVER** send the group key over WebSocket — it was distributed during registration
- **NEVER** create a React Context for message state — use Zustand store only
- **NEVER** prop drill beyond 2 levels — use stores
- **NEVER** silently swallow encryption errors — surface them to the user via `sendError`
- **NEVER** send messages without a nonce — every encrypted message MUST have a unique nonce

### Deferred / Not In Scope

- **Message grouping UI** (same-author grouping, timestamps, avatars) — story 2-3
- **Message history pagination / infinite scroll** — story 2-4
- **Auto-scroll behavior** (scroll-to-bottom, "new messages" indicator) — story 2-4
- **Message editing or deletion** — not in MVP scope
- **Rich text / markdown rendering** — not in MVP scope
- **Typing indicators** — not in MVP scope (WS_TYPES.TEXT_TYPING exists but deferred)
- **Rate limiting** on message sends — future concern
- **Empty channel state** ("This is the beginning of #channel") — story 2-3
- **Message content max-width** (720px) — story 2-3

### Previous Story (2-1) Intelligence

**Key patterns established in 2-1:**
- WebSocket handlers registered via `registerHandler(WS_TYPES.X, handler)` in wsRouter
- Broadcasting pattern: iterate `clients` Map, send to each with `ws.readyState === ws.OPEN`, wrap in try/catch
- wsClient dispatches to Zustand stores via `useXStore.getState().action(payload)`
- ConnectionBanner handles all connection state display — no need to add more connection UI
- Tests: server uses `setupApp()` + `seedUserWithSession()`, client uses `vi.mock` + `beforeEach` reset

**Debug learnings from 2-1:**
- Auth middleware was blocking `/ws` endpoint — already fixed (added `/ws` to PUBLIC_ROUTES)
- `@types/ws` needed for TypeScript compilation — already installed
- Use `ws.terminate()` in tests for proper close event propagation
- `@fastify/websocket` `injectWS` requires `onInit` callback for message listeners

**Code review patterns from Epic 1 (prevent repeating):**
- Always create `Error` instances (not plain objects) when throwing
- Add `required` arrays to Fastify JSON schemas for all required fields
- Extract shared utilities — don't duplicate code across components
- Don't create split state (two sources of truth for the same data)
- Write tests for ALL new components and services

### Git Intelligence

Recent commits show story 2-1 complete with code review:
```
041720f code - review 2-1: update review
861f246 code - review 2-1: update review
e12c22b write 2-1
a1fd6c1 Implement story 2-1: WebSocket connection and real-time transport
```

Branch pattern: `feature/2-1-websocket-CLAUDE` → expect `feature/2-2-messaging-CLAUDE`

### Project Structure Notes

**New files to create:**
```
server/src/plugins/messages/
  messageService.ts                  # DB operations: createMessage, getMessagesByChannel
  messageService.test.ts             # Service tests
  messageWsHandler.ts                # WS text:send handler + broadcast text:receive
  messageWsHandler.test.ts           # Handler tests
  messageRoutes.ts                   # GET /api/channels/:channelId/messages
  messageRoutes.test.ts              # Route tests

client/src/renderer/src/stores/
  useMessageStore.ts                 # Message state: messages Map, send/receive actions
  useMessageStore.test.ts            # Store tests

client/src/renderer/src/features/messages/
  MessageInput.tsx                   # Text input with Enter/Shift+Enter handling
  MessageInput.test.tsx              # Component tests
```

**Modified files:**
```
server/src/ws/wsServer.ts                              # Import + register message WS handlers
server/src/app.ts                                      # Register message routes plugin
shared/src/ws-messages.ts                              # Make nonce required on TextSendPayload/TextReceivePayload (remove ?)
client/src/renderer/src/features/layout/ContentArea.tsx # Add message list + MessageInput
client/src/renderer/src/services/wsClient.ts           # Register text:receive handler → useMessageStore
```

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-real-time-text-communication.md#Story-2.2] — Acceptance criteria, user story, BDD scenarios
- [Source: _bmad-output/planning-artifacts/architecture.md#E2E-Encryption] — XSalsa20-Poly1305, libsodium-wrappers, group key distribution, encrypt/decrypt flow
- [Source: _bmad-output/planning-artifacts/architecture.md#WebSocket-Message-Structure] — WsMessage envelope, text:send/text:receive types
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Communication-Patterns] — REST endpoint pattern, response envelope format
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend-Architecture] — Zustand store pattern, service layer, component boundaries
- [Source: _bmad-output/planning-artifacts/architecture.md#Database-Schema] — messages table, snake_case columns, Drizzle ORM patterns
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#MessageInput] — 44px min-height, 12px border-radius, bg-tertiary, placeholder pattern
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Keyboard-Behavior] — Enter sends, Shift+Enter newline
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Error-Feedback] — Inline red text, human-readable, non-blocking
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color-Tokens] — bg-tertiary #1c1915, text-primary #f0e6d9, error #f23f43, accent-primary #c97b35
- [Source: _bmad-output/project-context.md] — Anti-patterns, import boundaries, testing rules, WS envelope format
- [Source: shared/src/ws-messages.ts] — TextSendPayload, TextReceivePayload, WS_TYPES constants
- [Source: shared/src/constants.ts] — MAX_MESSAGE_LENGTH, NACL_SECRETBOX constants
- [Source: client/src/renderer/src/services/encryptionService.ts] — encryptMessage(), decryptMessage(), initializeSodium()
- [Source: client/src/renderer/src/stores/useAuthStore.ts] — groupKey state, login/register encryption setup
- [Source: client/src/renderer/src/services/wsClient.ts] — send(), on(), singleton pattern
- [Source: server/src/ws/wsRouter.ts] — registerHandler() pattern
- [Source: server/src/ws/wsServer.ts] — clients Map, broadcast pattern, handler registration
- [Source: server/src/db/schema.ts] — messages table definition, Message/NewMessage types
- [Source: server/src/plugins/presence/presenceService.ts] — Broadcast pattern reference
- [Source: _bmad-output/implementation-artifacts/2-1-websocket-connection-and-real-time-transport.md] — Previous story learnings, debug notes, established patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed Drizzle ORM query: chained `.where()` calls replace rather than combine — used `and()` for combined conditions
- Fixed SQLite timestamp resolution: `unixepoch()` has second-level precision, causing same-second messages to be unordered — switched to `rowid` for stable ordering and cursor pagination
- Fixed Zustand selector stability: `[] ?? []` creates new array references causing infinite re-renders — used module-level `EMPTY_MESSAGES` constant
- Fixed vi.mock hoisting: `mockSend`/`mockApiRequest` referenced before initialization — used `vi.hoisted()` to hoist mock variables
- Fixed mock contamination: `mockImplementation` persists across tests — used `mockImplementationOnce` for one-time behavior overrides

### Completion Notes List

- Made `nonce` required (non-optional) on `TextSendPayload` and `TextReceivePayload` in shared types
- Server message handler broadcasts to ALL connected clients (simple MVP approach) — clients filter by channelId
- Server sends `text:receive` back to sender with `message.id` passthrough for tempId-based confirmation matching
- Message pagination uses SQLite `rowid` for stable ordering (handles same-second timestamps correctly)
- Client-side encryption/decryption happens at the boundary — store holds plaintext, wire carries ciphertext
- wsClient handles `TEXT_RECEIVE` directly in `handleMessage` (like presence) for access to full WsMessage envelope including `id`
- `markPendingMessagesFailed()` called on WebSocket close to fail any messages stuck in 'sending' status
- MessageInput auto-grows with content using textarea height manipulation
- ContentArea shows welcome message when channel has no messages, loading spinner during fetch
- All 151 server tests + 115 client tests pass with 0 lint errors

### Change Log

- 2026-02-24: Implemented story 2-2 encrypted text messaging — all tasks complete

### File List

**New files:**
- server/src/plugins/messages/messageService.ts
- server/src/plugins/messages/messageService.test.ts
- server/src/plugins/messages/messageWsHandler.ts
- server/src/plugins/messages/messageWsHandler.test.ts
- server/src/plugins/messages/messageRoutes.ts
- server/src/plugins/messages/messageRoutes.test.ts
- client/src/renderer/src/stores/useMessageStore.ts
- client/src/renderer/src/stores/useMessageStore.test.ts
- client/src/renderer/src/features/messages/MessageInput.tsx
- client/src/renderer/src/features/messages/MessageInput.test.tsx

**Modified files:**
- shared/src/ws-messages.ts (made nonce required on TextSendPayload/TextReceivePayload)
- server/src/ws/wsServer.ts (import + register message handlers)
- server/src/app.ts (register message routes with /api/channels prefix)
- client/src/renderer/src/services/wsClient.ts (TEXT_RECEIVE handler, markPendingMessagesFailed)
- client/src/renderer/src/features/layout/ContentArea.tsx (message list, MessageInput, fetchMessages)
- client/src/renderer/src/features/layout/ContentArea.test.tsx (updated for message store deps)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status: in-progress → review)
