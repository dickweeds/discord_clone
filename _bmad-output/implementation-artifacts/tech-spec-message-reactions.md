---
title: 'Message Reactions'
slug: 'message-reactions'
created: '2026-03-02'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript 5.x', 'React 18+', 'Fastify v5.7.x', 'Drizzle ORM v0.45.x', 'Zustand v5.0.x', 'Radix UI (radix-ui v1.4.3)', 'Tailwind CSS v4.2', 'Vitest', '@emoji-mart/react', '@emoji-mart/data']
files_to_modify: ['server/src/db/schema.ts', 'shared/src/ws-messages.ts', 'shared/src/index.ts', 'server/src/plugins/messages/messageWsHandler.ts', 'server/src/plugins/messages/messageRoutes.ts', 'client/src/renderer/src/services/wsClient.ts', 'client/src/renderer/src/features/messages/MessageGroup.tsx', 'client/src/renderer/src/stores/useMessageStore.ts']
code_patterns: ['Drizzle pgTable with uuid PK, FK cascade, enableRLS, composite index', 'registerHandler(WS_TYPES.X, async (ws, message, userId) => {...})', 'broadcast to all clients Map, filter OPEN readyState', 'Fastify plugin with prefix registration', '{ data } / { error: { code, message } } REST envelope', 'Zustand create<State>((set, get) => ...) with Map-based collections', 'wsClient.on(type, callback) returns unsubscribe', 'wsClient handleMessage if/else chain for known types']
test_patterns: ['Vitest + PGlite in-memory Postgres (no mocking DB)', 'vi.hoisted(() => process.env setup) before imports', 'setupApp/teardownApp/truncateAll/seedRegularUser helpers', 'createMockSocket/createMockLogger factories for WS tests', 'routeMessage() + waitForCall() for async WS handler tests', 'React Testing Library + vi.mock for component tests', 'app.inject({ method, url, headers }) for route tests']
---

# Tech-Spec: Message Reactions

**Created:** 2026-03-02

## Overview

### Problem Statement

Users can't react to messages in text channels — no way to express quick feedback without typing a reply. Reactions are a core Discord feature that enables lightweight, expressive interaction.

### Solution

Add Discord-style emoji reactions to text channel messages. A hover toolbar on each message provides ~6 quick-react Unicode emojis plus a "more" button that opens a full emoji-mart picker. Reactions are stored plaintext server-side (not encrypted — they're emoji identifiers, not user content). Real-time sync via WebSocket broadcasts reaction add/remove events to all channel participants. Reaction pills below each message show emoji + count; clicking a pill toggles the current user's reaction.

### Scope

**In Scope:**
- `message_reactions` DB table — plaintext, unique constraint on `(message_id, user_id, emoji)`
- Server: reaction service + WS handlers (`reaction:add` / `reaction:remove`)
- Server: include reactions when fetching message history via REST
- Client: hover toolbar on messages with ~6 quick-react emojis + "more" button opening emoji-mart full picker
- Client: reaction pills below messages showing emoji + count, click to toggle own reaction
- Real-time broadcast of reaction add/remove to all channel participants
- Shared types for reaction WS events and payloads

**Out of Scope:**
- Custom server emojis (upload, storage, CDN)
- Reaction notifications / mentions
- Reaction-based permissions or roles
- Animated emoji or GIF reactions

## Context for Development

### Codebase Patterns

- **DB Schema**: Drizzle ORM `pgTable` with `uuid().primaryKey().defaultRandom()`, FK with `{ onDelete: 'cascade' }`, `.enableRLS()`, composite indexes via `(table) => [index('name').on(...)]`
- **Type Inference**: `InferSelectModel<typeof table>` / `InferInsertModel<typeof table>` for DB types
- **Service Functions**: Take `db: AppDatabase` first param, return shaped DTOs (camelCase), `Date` → `.toISOString()` on return
- **WS Handlers**: `registerHandler(WS_TYPES.X, async (ws, message, userId) => {...})` in `registerMessageHandlers()`, validate payload fields with `sendTextError()` on failure, `withDbRetry()` for DB ops, broadcast to all clients in `clients` Map
- **WS Types**: `WS_TYPES` object `as const` with `SCREAMING_SNAKE_CASE` keys → `'namespace:action'` values. Client sends present tense (`text:send`, `reaction:add`), server broadcasts past tense or noun (`text:receive`, `channel:created`)
- **REST Routes**: Fastify plugin, `{ data }` / `{ error: { code, message } }` envelope, auth via global middleware, JSON schema inline
- **Client Store**: `useMessageStore` with `Map<channelId, DecryptedMessage[]>`, immutable updates via `new Map(get().messages)`, accessed as hook in components, `getState()` in services
- **Client WS**: `wsClient.handleMessage()` has hardcoded `if/else if` chain for known event types, dispatches to store actions. Also supports `wsClient.on(type, callback)` for dynamic handlers
- **Component Styling**: Tailwind v4 `@theme` tokens — `bg-bg-hover`, `bg-bg-floating`, `text-text-primary`, `text-text-muted`, `border-border-default`. Radix UI for tooltips/popovers/dropdowns imported from monolithic `radix-ui` package
- **Message Rendering**: `MessageGroup.tsx` renders groups of consecutive same-author messages. Each message is `<div key={msg.id} className="mt-1">`. Group div has `hover:bg-bg-hover`. No per-message hover toolbar exists yet

### Files to Modify

| File | Purpose |
| ---- | ------- |
| `server/src/db/schema.ts` | Add `messageReactions` table with unique constraint on `(message_id, user_id, emoji)` |
| `shared/src/ws-messages.ts` | Add `REACTION_ADD`, `REACTION_REMOVE`, `REACTION_ADDED`, `REACTION_REMOVED` to `WS_TYPES` + payload interfaces |
| `shared/src/index.ts` | Re-export new reaction types and payload interfaces |
| `server/src/plugins/messages/messageWsHandler.ts` | Add `reaction:add` and `reaction:remove` handlers in `registerMessageHandlers()` |
| `server/src/plugins/messages/messageRoutes.ts` | Extend `GET /:channelId/messages` to include reaction summaries per message |
| `client/src/renderer/src/services/wsClient.ts` | Add `reaction:added` / `reaction:removed` handling in `handleMessage()` if/else chain |
| `client/src/renderer/src/features/messages/MessageGroup.tsx` | Add per-message hover toolbar + render reaction pills below message body |
| `client/src/renderer/src/stores/useMessageStore.ts` | Add `reactions` state (`Map<messageId, ReactionSummary[]>`) and actions |
| `server/src/test/helpers.ts` | Add `message_reactions` to `truncateAll` for test isolation |
| `client/src/renderer/src/features/layout/ContentArea.test.tsx` | Add emoji-mart and reactionService mocks, reaction pills integration test |

### Files to Create

| File | Purpose |
| ---- | ------- |
| `server/src/plugins/messages/reactionService.ts` | `addReaction()`, `removeReaction()`, `getReactionsForMessages()` DB operations |
| `server/src/plugins/messages/reactionService.test.ts` | Unit tests for reaction service |
| `client/src/renderer/src/features/messages/MessageHoverToolbar.tsx` | Quick-react emoji bar + "more" button, appears on message hover |
| `client/src/renderer/src/features/messages/MessageHoverToolbar.test.tsx` | Tests for hover toolbar |
| `client/src/renderer/src/features/messages/ReactionPills.tsx` | Emoji pill display below messages — emoji + count, click to toggle |
| `client/src/renderer/src/features/messages/ReactionPills.test.tsx` | Tests for reaction pills |
| `client/src/renderer/src/features/messages/EmojiPicker.tsx` | Wrapper around `@emoji-mart/react` Picker |
| `client/src/renderer/src/services/reactionService.ts` | `toggleReaction()` — sends `reaction:add` or `reaction:remove` via wsClient |

### Technical Decisions

- **Plaintext reactions**: Emoji identifiers stored unencrypted server-side — not sensitive user content
- **Unicode emoji only**: No custom emoji support in this iteration
- **emoji-mart library**: `@emoji-mart/react` + `@emoji-mart/data` for the full emoji picker
- **One reaction per user per emoji per message**: Enforced by DB unique constraint `(message_id, user_id, emoji)`
- **No cap on unique emoji types per message**: Any number of distinct emojis allowed
- **Separate reactionService.ts**: Keep reaction DB logic separate from messageService.ts for single-concern files
- **Reactions included in message fetch**: `GET /:channelId/messages` returns reaction summaries aggregated per message — avoids separate API call
- **WS broadcast pattern**: Follow existing broadcast-to-all model; clients filter by `channelId` in payload
- **Reaction summary shape**: `{ emoji: string, count: number, userIds: string[] }[]` per message — allows UI to show count and highlight if current user reacted
- **Hover toolbar**: Appears on individual message `<div>` hover (not the group hover), positioned absolutely relative to message

## Implementation Plan

### Tasks

- [x] Task 1: Add shared reaction types and WS constants
  - File: `shared/src/ws-messages.ts`
  - Action: Add to `WS_TYPES` object: `REACTION_ADD: 'reaction:add'`, `REACTION_REMOVE: 'reaction:remove'`, `REACTION_ADDED: 'reaction:added'`, `REACTION_REMOVED: 'reaction:removed'`. Add payload interfaces:
    - `ReactionAddPayload { messageId: string; channelId: string; emoji: string; }` (client → server)
    - `ReactionRemovePayload { messageId: string; channelId: string; emoji: string; }` (client → server)
    - `ReactionAddedPayload { messageId: string; channelId: string; userId: string; emoji: string; }` (server → all clients)
    - `ReactionRemovedPayload { messageId: string; channelId: string; userId: string; emoji: string; }` (server → all clients)
  - File: `shared/src/index.ts`
  - Action: Add `export type { ReactionAddPayload, ReactionRemovePayload, ReactionAddedPayload, ReactionRemovedPayload }` to the ws-messages re-export block. Add `REACTION_ADD`, `REACTION_REMOVE`, `REACTION_ADDED`, `REACTION_REMOVED` is automatic since `WS_TYPES` is already exported as a value.

- [x] Task 2: Add `message_reactions` database table
  - File: `server/src/db/schema.ts`
  - Action: Add `messageReactions` table with columns:
    - `id`: `uuid('id').primaryKey().defaultRandom()`
    - `message_id`: `uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' })`
    - `user_id`: `uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })`
    - `emoji`: `text('emoji').notNull()`
    - `created_at`: `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`
  - Action: Add unique composite index: `uniqueIndex('uq_message_reactions_message_user_emoji').on(table.message_id, table.user_id, table.emoji)` and lookup index: `index('idx_message_reactions_message_id').on(table.message_id)`
  - Action: Chain `.enableRLS()` on the table
  - Action: Export `type MessageReaction = InferSelectModel<typeof messageReactions>` and `type NewMessageReaction = InferInsertModel<typeof messageReactions>`
  - Notes: Import `uniqueIndex` from `drizzle-orm/pg-core` alongside existing imports

- [x] Task 3: Create reaction service with DB operations
  - File: `server/src/plugins/messages/reactionService.ts` (new)
  - Action: Create service with three exported functions:
    - `addReaction(db: AppDatabase, params: { messageId: string; userId: string; emoji: string }): Promise<{ id: string; messageId: string; userId: string; emoji: string; createdAt: string }>` — `db.insert(messageReactions).values({...}).returning()`, map `created_at` → ISO string. On unique constraint violation (duplicate reaction), silently return the existing reaction (query it via select)
    - `removeReaction(db: AppDatabase, params: { messageId: string; userId: string; emoji: string }): Promise<boolean>` — `db.delete(messageReactions).where(and(eq(...), eq(...), eq(...)))`, return `true` if a row was deleted (check `returning()` result length)
    - `getReactionsForMessages(db: AppDatabase, messageIds: string[]): Promise<Map<string, { emoji: string; count: number; userIds: string[] }[]>>` — Single query: `db.select().from(messageReactions).where(inArray(messageReactions.message_id, messageIds))`, then aggregate in JS: group by `message_id` → group by `emoji` → `{ emoji, count, userIds[] }`. Return a `Map<messageId, ReactionSummary[]>`
  - Notes: Import `eq`, `and`, `inArray` from `drizzle-orm`. Follow the same `AppDatabase` first-param pattern as `messageService.ts`

- [x] Task 4: Create reaction service tests
  - File: `server/src/plugins/messages/reactionService.test.ts` (new)
  - Action: Test all three service functions against PGlite:
    - `addReaction`: stores reaction, returns correct shape with ISO `createdAt`. Adding same reaction twice returns existing (idempotent)
    - `removeReaction`: removes existing reaction returns `true`, removing non-existent returns `false`
    - `getReactionsForMessages`: returns grouped summaries, correct counts, correct userIds, empty map for no reactions, multiple messages in single call, multiple emojis per message
  - Notes: Follow `messageService.test.ts` pattern — `vi.hoisted` env setup, `setupApp/teardownApp/truncateAll`, seed channel + user + messages in `beforeEach`

- [x] Task 5: Add reaction WS handlers
  - File: `server/src/plugins/messages/messageWsHandler.ts`
  - Action: Import `ReactionAddPayload`, `ReactionRemovePayload`, `ReactionAddedPayload`, `ReactionRemovedPayload` from `discord-clone-shared`. Import `addReaction`, `removeReaction` from `./reactionService.js`. Add two new `registerHandler` calls inside `registerMessageHandlers()`:
    - `registerHandler(WS_TYPES.REACTION_ADD, async (ws, message, userId) => {...})`:
      1. Extract `payload` as `ReactionAddPayload`
      2. Validate: `messageId` (string, required), `channelId` (string, required), `emoji` (string, required, non-empty)
      3. On validation failure: `ws.send(JSON.stringify({ type: WS_TYPES.TEXT_ERROR, payload: { error: 'MISSING_FIELD_NAME', tempId: '' } }))` and return
      4. `await withDbRetry(() => addReaction(db, { messageId: payload.messageId, userId, emoji: payload.emoji }))`
      5. On success: broadcast `{ type: WS_TYPES.REACTION_ADDED, payload: { messageId, channelId, userId, emoji } }` to all clients
      6. On DB error: log error, send error to sender
    - `registerHandler(WS_TYPES.REACTION_REMOVE, async (ws, message, userId) => {...})`:
      1. Same validation as add
      2. `await withDbRetry(() => removeReaction(db, { messageId: payload.messageId, userId, emoji: payload.emoji }))`
      3. If removed (`true`): broadcast `{ type: WS_TYPES.REACTION_REMOVED, payload: { messageId, channelId, userId, emoji } }` to all clients
      4. If not found (`false`): no-op (don't broadcast, don't error)
  - Notes: Reuse existing `sendTextError` helper for validation errors. Follow exact broadcast loop pattern from `text:send` handler

- [x] Task 6: Add reaction WS handler tests
  - File: `server/src/plugins/messages/messageWsHandler.test.ts` (extend existing)
  - Action: Add a new `describe('reaction handlers', ...)` block with tests:
    - `reaction:add` — stores reaction in DB, broadcasts `reaction:added` to all clients with correct payload shape
    - `reaction:add` — duplicate reaction is idempotent (no error, still broadcasts)
    - `reaction:add` — missing messageId/channelId/emoji returns error
    - `reaction:remove` — removes reaction, broadcasts `reaction:removed`
    - `reaction:remove` — non-existent reaction is silent no-op (no broadcast)
    - `reaction:remove` — missing fields returns error
  - Notes: Follow existing test pattern — `createMockSocket`, `routeMessage`, `waitForCall`. Seed a message in `beforeEach` to react to

- [x] Task 7: Extend REST message fetch to include reactions
  - File: `server/src/plugins/messages/messageRoutes.ts`
  - Action: In the `GET /:channelId/messages` handler, after fetching messages:
    1. Import `getReactionsForMessages` from `./reactionService.js`
    2. Extract message IDs from the fetched rows: `const messageIds = rows.map(r => r.id)`
    3. Call `const reactionsMap = await getReactionsForMessages(fastify.db, messageIds)`
    4. In the response mapping, add `reactions` field to each message DTO: `reactions: reactionsMap.get(row.id) ?? []`
  - Action: Update the JSON schema `response[200]` to include `reactions` array in each message object: `reactions: { type: 'array', items: { type: 'object', properties: { emoji: { type: 'string' }, count: { type: 'integer' }, userIds: { type: 'array', items: { type: 'string' } } } } }`
  - Notes: Single additional DB query for all messages in the page — no N+1

- [x] Task 8: Add REST reaction route tests
  - File: `server/src/plugins/messages/messageRoutes.test.ts` (extend existing)
  - Action: Add tests to verify reactions are included in message fetch:
    - Message with no reactions returns empty `reactions: []`
    - Message with reactions returns correct `{ emoji, count, userIds }` summary
    - Multiple emojis on same message are all returned
    - Reactions from multiple users show correct count and all userIds

- [x] Task 9: Install emoji-mart in client
  - File: `client/package.json`
  - Action: `cd client && npm install @emoji-mart/react @emoji-mart/data`
  - Notes: These are runtime dependencies, not devDependencies

- [x] Task 10: Extend message store with reaction state
  - File: `client/src/renderer/src/stores/useMessageStore.ts`
  - Action: Add to state interface:
    - `reactions: Map<string, { emoji: string; count: number; userIds: string[] }[]>` — keyed by messageId
  - Action: Add actions:
    - `setReactionsForMessages(reactionsMap: Map<string, ReactionSummary[]>)` — merges into existing reactions Map (called after REST fetch)
    - `addReaction(messageId: string, userId: string, emoji: string)` — optimistic: if reaction summary exists for this emoji, increment count + add userId; else add new entry `{ emoji, count: 1, userIds: [userId] }`
    - `removeReaction(messageId: string, userId: string, emoji: string)` — optimistic: decrement count + remove userId from matching entry; if count reaches 0, remove the entry entirely
  - Action: Initialize `reactions: new Map()` in initial state
  - Notes: All Map mutations via `new Map(get().reactions)` for immutability. When `setMessages` is called (channel switch), clear reactions for that channel's messages or let them accumulate (accumulate is simpler, stale entries are harmless)

- [x] Task 11: Add message store reaction tests
  - File: `client/src/renderer/src/stores/useMessageStore.test.ts` (extend existing)
  - Action: Add tests for new reaction actions:
    - `setReactionsForMessages` merges reaction data
    - `addReaction` creates new entry when emoji is new
    - `addReaction` increments count when emoji exists
    - `addReaction` is idempotent (same user+emoji doesn't double-count)
    - `removeReaction` decrements count and removes userId
    - `removeReaction` removes entry when count reaches 0
    - `removeReaction` is no-op for non-existent reaction

- [x] Task 12: Create client reaction service
  - File: `client/src/renderer/src/services/reactionService.ts` (new)
  - Action: Export `toggleReaction(messageId: string, channelId: string, emoji: string): void`:
    1. Get `userId` from `useAuthStore.getState().user.id`
    2. Get current reactions from `useMessageStore.getState().reactions.get(messageId)`
    3. Check if user already reacted with this emoji: `existingReaction?.find(r => r.emoji === emoji)?.userIds.includes(userId)`
    4. If already reacted: optimistic `removeReaction(messageId, userId, emoji)` in store, send `wsClient.send({ type: WS_TYPES.REACTION_REMOVE, payload: { messageId, channelId, emoji } })`
    5. If not reacted: optimistic `addReaction(messageId, userId, emoji)` in store, send `wsClient.send({ type: WS_TYPES.REACTION_ADD, payload: { messageId, channelId, emoji } })`
  - Notes: Follow `messageService.ts` pattern — access stores via `getState()`, call `wsClient.send()`

- [x] Task 13: Add wsClient reaction event handling
  - File: `client/src/renderer/src/services/wsClient.ts`
  - Action: In `handleMessage()`, add two new `else if` branches after the existing `text:error` handler:
    - `else if (message.type === WS_TYPES.REACTION_ADDED)`: extract `ReactionAddedPayload`, call `useMessageStore.getState().addReaction(payload.messageId, payload.userId, payload.emoji)`. Use dynamic import like `text:receive` handler does: `const { default: useMessageStore } = await import('../stores/useMessageStore')`
    - `else if (message.type === WS_TYPES.REACTION_REMOVED)`: extract `ReactionRemovedPayload`, call `useMessageStore.getState().removeReaction(payload.messageId, payload.userId, payload.emoji)`. Same dynamic import pattern
  - Action: Import `ReactionAddedPayload`, `ReactionRemovedPayload` types from `discord-clone-shared`
  - Notes: Dynamic imports maintain the existing pattern of lazy-loading stores to avoid circular dependencies

- [x] Task 14: Update message fetch to store reactions
  - File: `client/src/renderer/src/services/messageService.ts`
  - Action: In `fetchMessages()` and `fetchOlderMessages()`, after decrypting messages:
    1. Extract reactions from the API response: each message in `result.data` now has a `reactions` field
    2. Build a `Map<string, ReactionSummary[]>` from the response data
    3. Call `useMessageStore.getState().setReactionsForMessages(reactionsMap)`
  - Notes: The REST response now includes `reactions` per message (from Task 7). Type the response to include `reactions` field alongside existing `TextReceivePayload` fields

- [x] Task 15: Create ReactionPills component
  - File: `client/src/renderer/src/features/messages/ReactionPills.tsx` (new)
  - Action: Create component that renders reaction pills below a message:
    - Props: `{ messageId: string; channelId: string }`
    - Read reactions from store: `useMessageStore((s) => s.reactions.get(messageId) ?? [])`
    - Read current userId from `useAuthStore`
    - If no reactions, render nothing (`null`)
    - Render a `<div className="flex flex-wrap gap-1 mt-1">` containing pills
    - Each pill: `<button>` with emoji + count. Styling: `px-1.5 py-0.5 rounded-full text-xs bg-bg-tertiary hover:bg-bg-hover border border-border-default` + `border-accent-primary bg-accent-primary/10` when current user has reacted
    - `onClick`: call `toggleReaction(messageId, channelId, emoji)` from `reactionService`
    - Render a "+" button at the end to open the emoji picker (same as hover toolbar "more" button behavior)
  - Notes: Use `Tooltip` component to show who reacted on hover (list first 3 usernames + "and N more")

- [x] Task 16: Create ReactionPills tests
  - File: `client/src/renderer/src/features/messages/ReactionPills.test.tsx` (new)
  - Action: Test:
    - Renders nothing when no reactions exist
    - Renders emoji + count for each reaction
    - Highlights pill when current user has reacted
    - Calls `toggleReaction` on pill click
    - Shows "+" button to add reaction
    - Tooltip shows reactor usernames on hover

- [x] Task 17: Create EmojiPicker component
  - File: `client/src/renderer/src/features/messages/EmojiPicker.tsx` (new)
  - Action: Create wrapper around emoji-mart:
    - Props: `{ onSelect: (emoji: string) => void; onClose: () => void }`
    - Import `Picker` from `@emoji-mart/react` and `data` from `@emoji-mart/data`
    - Render `<Picker data={data} onEmojiSelect={(emoji) => onSelect(emoji.native)} theme="dark" />` inside a Radix `Popover` content
    - Style the container: `bg-bg-floating rounded-lg shadow-lg border border-border-default`
    - Apply emoji-mart custom CSS overrides to match the warm earthy theme (override `--em-color-border`, `--em-color-border-over`, `--em-rgb-background` etc.)
  - Notes: emoji-mart exposes CSS custom properties for theming. The `emoji.native` field gives the Unicode character

- [x] Task 18: Create MessageHoverToolbar component
  - File: `client/src/renderer/src/features/messages/MessageHoverToolbar.tsx` (new)
  - Action: Create toolbar that appears on message hover:
    - Props: `{ messageId: string; channelId: string }`
    - Render a row of ~6 quick-react emoji buttons: 👍 ❤️ 😂 😮 😢 🔥
    - Each button: `<button onClick={() => toggleReaction(messageId, channelId, emoji)}>` with `Tooltip` showing emoji name
    - Last button: "+" icon that opens the `EmojiPicker` via Radix `Popover`
    - On emoji select from picker: call `toggleReaction(messageId, channelId, selectedEmoji)`, close picker
    - Positioning: `absolute -top-4 right-2` relative to the message div (floats above-right of message on hover)
    - Styling: `flex gap-0.5 rounded-md bg-bg-secondary border border-border-default shadow-md p-0.5` with `text-text-muted hover:text-text-primary hover:bg-bg-hover` on each button
  - Notes: Use `Popover` from `radix-ui` for the emoji picker dropdown, not `DropdownMenu` (picker is custom content, not a menu)

- [x] Task 19: Create MessageHoverToolbar tests
  - File: `client/src/renderer/src/features/messages/MessageHoverToolbar.test.tsx` (new)
  - Action: Test:
    - Renders quick-react emoji buttons
    - Calls `toggleReaction` with correct emoji on quick-react click
    - Opens emoji picker on "+" button click
    - Calls `toggleReaction` on picker emoji selection
    - Closes picker after selection

- [x] Task 20: Integrate hover toolbar and reaction pills into MessageGroup
  - File: `client/src/renderer/src/features/messages/MessageGroup.tsx`
  - Action: For each message `<div key={msg.id}>` in the messages map:
    1. Wrap in a `relative` container with `group/msg` class (Tailwind group modifier for scoping hover): `<div key={msg.id} className="relative group/msg mt-1">`
    2. Render `<MessageHoverToolbar messageId={msg.id} channelId={msg.channelId} />` inside the message div, visible only on hover: add `hidden group-hover/msg:flex` to the toolbar's outer wrapper
    3. Render `<ReactionPills messageId={msg.id} channelId={msg.channelId} />` after the message `<p>` body
  - Action: Import `MessageHoverToolbar` and `ReactionPills` components
  - Notes: The `group/msg` Tailwind syntax creates a named group so hover only applies to the specific message, not the entire MessageGroup. The toolbar uses `absolute` positioning to float above the message without affecting layout

- [x] Task 21: Update MessageGroup tests
  - File: `client/src/renderer/src/features/messages/MessageGroup.test.tsx` (extend existing)
  - Action: Add tests:
    - Each message renders a `ReactionPills` component
    - Hover toolbar is hidden by default (has `hidden` class)
    - Verify message div has `group/msg` class for hover scoping

- [x] Task 22: Update ContentArea to pass reactions from fetch
  - File: `client/src/renderer/src/features/layout/ContentArea.tsx`
  - Action: No code changes needed in `ContentArea.tsx` — `fetchMessages` and `fetchOlderMessages` in `messageService.ts` already write to the store (Task 14). `ReactionPills` reads directly from `useMessageStore`. `ContentArea` doesn't need to thread reaction props.
  - File: `client/src/renderer/src/features/layout/ContentArea.test.tsx`
  - Action: Added emoji-mart and reactionService mocks to prevent import errors. Added integration test verifying reaction pills render within ContentArea when messages have reactions.
  - Notes: Verification task for ContentArea.tsx (no changes), but test file required updates for new component dependencies

### Acceptance Criteria

- [x] AC 1: Given a user hovers over a message, when the cursor enters the message area, then a toolbar with 6 quick-react emojis (👍 ❤️ 😂 😮 😢 🔥) and a "+" button appears above-right of the message
- [x] AC 2: Given a user clicks a quick-react emoji in the toolbar, when the click fires, then the reaction is added to the message (pill appears below message with emoji + count "1") and other connected clients see the reaction in real-time
- [x] AC 3: Given a user clicks the "+" button in the hover toolbar, when the click fires, then a full emoji picker (emoji-mart) opens in a popover
- [x] AC 4: Given a user selects an emoji from the full picker, when the selection fires, then the reaction is added to the message, the picker closes, and other clients see it in real-time
- [x] AC 5: Given a message has reactions, when a user views the message, then reaction pills are displayed below the message body showing each unique emoji + count
- [x] AC 6: Given a user has reacted with a specific emoji, when they view the reaction pill, then that pill is visually highlighted (accent border + tinted background) to indicate their reaction
- [x] AC 7: Given a user clicks a reaction pill for an emoji they already reacted with, when the click fires, then their reaction is removed (count decrements, pill disappears if count reaches 0) and other clients see the removal in real-time
- [x] AC 8: Given a user clicks a reaction pill for an emoji they have NOT reacted with, when the click fires, then their reaction is added (count increments) and other clients see it in real-time
- [x] AC 9: Given a message has reactions and the user loads the channel via REST, when the messages load, then existing reactions are displayed correctly with counts and user highlighting
- [x] AC 10: Given the same user tries to add the same emoji reaction twice to the same message, when the second add fires, then the operation is idempotent — no duplicate, no error
- [x] AC 11: Given a user tries to remove a reaction that doesn't exist, when the remove fires, then nothing happens — no error, no broadcast
- [x] AC 12: Given a message is deleted (cascade), when the message is removed from DB, then all associated reactions are also deleted (FK cascade)

## Additional Context

### Dependencies

- `@emoji-mart/react` — React component for emoji picker (install in `client/`)
- `@emoji-mart/data` — Emoji dataset for emoji-mart (install in `client/`)
- No server-side dependencies added
- Drizzle ORM `uniqueIndex` and `inArray` imports (already available in drizzle-orm)

### Testing Strategy

**Server Unit Tests (PGlite):**
- `reactionService.test.ts`: All CRUD operations — add, remove, batch fetch with aggregation, idempotency, cascade delete
- Extend `messageWsHandler.test.ts`: Reaction WS handlers — validation errors, successful add/remove, broadcast verification, idempotent add, silent no-op remove
- Extend `messageRoutes.test.ts`: REST response includes reactions — empty reactions, populated reactions, multi-emoji, multi-user

**Client Unit Tests:**
- Extend `useMessageStore.test.ts`: Reaction state actions — add, remove, set, idempotency, count-to-zero removal
- `ReactionPills.test.tsx`: Render states, click behavior, highlight state, tooltip
- `MessageHoverToolbar.test.tsx`: Quick-react buttons, picker open/close, emoji selection callback
- Extend `MessageGroup.test.tsx`: Integration — hover toolbar presence, reaction pills presence, group/msg hover class

**Manual Testing:**
1. Send a message, hover over it, verify toolbar appears
2. Click a quick-react emoji, verify pill appears with count 1
3. Click the "+" button, verify full picker opens, select emoji, verify pill
4. Open a second client, verify reactions appear in real-time
5. Click own reaction pill to remove, verify count decrements / pill disappears
6. Click another user's reaction pill to add your own, verify count increments
7. Refresh page, verify reactions persist from REST fetch
8. Delete a message, verify reactions are gone

### Notes

- **Performance**: `getReactionsForMessages()` uses a single query with `inArray` for the entire page of messages — no N+1 queries. Client-side aggregation is bounded by page size (max 50 messages × reactions per message)
- **emoji-mart bundle size**: `@emoji-mart/data` is ~1.4MB. Since this is an Electron desktop app (not a web app), bundle size is not a critical concern. The picker is lazy-loaded via Radix Popover (only rendered when opened)
- **Race conditions**: Optimistic updates + server broadcast means the sender receives both their optimistic update AND the server broadcast. The store's `addReaction` action must be idempotent — if userId already exists in the emoji's `userIds` array, don't double-add
- **Future considerations**: Custom emoji support would require a new `custom_emojis` table, upload/storage infrastructure, and modifications to the reaction summary shape to distinguish Unicode vs custom. The current `emoji: text` column works for both Unicode characters and future custom emoji identifiers
