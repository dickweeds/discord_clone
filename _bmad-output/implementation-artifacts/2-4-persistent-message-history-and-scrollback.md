# Story 2.4: Persistent Message History & Scrollback

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see previous message history when I open a channel and scroll through past conversations,
so that I never lose context from earlier discussions.

## Acceptance Criteria

1. **Given** I open the app and navigate to a text channel **When** the channel loads **Then** the most recent messages are fetched from the server via GET /api/channels/:channelId/messages **And** the encrypted messages are decrypted client-side and displayed

2. **Given** the message feed is loaded **When** I am at the bottom of the feed **Then** new incoming messages auto-scroll the feed to show the latest message

3. **Given** I have scrolled up in the message feed **When** a new message arrives **Then** the feed does NOT auto-scroll **And** a "New messages" indicator appears to let me jump to the latest

4. **Given** I am viewing a channel with extensive history **When** I scroll to the top of the loaded messages **Then** older messages are fetched from the server (paginated) **And** decrypted and prepended to the feed without losing scroll position

5. **Given** the server restarts **When** I reconnect and view a text channel **Then** all previously stored messages are still available and decryptable **And** zero messages are lost

## Tasks / Subtasks

- [ ] Task 1: Update messageService.fetchMessages to support cursor-based pagination (AC: 1, 4)
  - [ ] 1.1 Modify `fetchMessages()` in `client/src/renderer/src/services/messageService.ts` to accept optional `before` cursor parameter
  - [ ] 1.2 When `before` is provided, append `?before={messageId}&limit=50` query params to the GET request
  - [ ] 1.3 When no `before` is provided (initial load), fetch latest 50 messages (current behavior, but now explicitly limited)
  - [ ] 1.4 Return metadata indicating whether more messages exist (if fewer than `limit` messages returned, no more history)
  - [ ] 1.5 Decrypt messages and return them in chronological order (reverse the DESC response from server)

- [ ] Task 2: Add pagination state and prepend logic to useMessageStore (AC: 1, 4)
  - [ ] 2.1 Add `hasMoreMessages: Map<string, boolean>` to track per-channel whether older messages exist
  - [ ] 2.2 Add `isLoadingMore: boolean` flag (separate from `isLoading` which is for initial load)
  - [ ] 2.3 Add `prependMessages(channelId: string, messages: DecryptedMessage[], hasMore: boolean)` action — prepends older messages to the beginning of the channel's message array
  - [ ] 2.4 Modify existing `setMessages()` to also set `hasMoreMessages` for the channel based on count returned vs limit
  - [ ] 2.5 Add `getOldestMessageId(channelId: string): string | undefined` selector — returns the ID of the first message in the channel array (used as `before` cursor)

- [ ] Task 3: Create fetchOlderMessages service function (AC: 4)
  - [ ] 3.1 Add `fetchOlderMessages(channelId: string)` to `messageService.ts`
  - [ ] 3.2 Get oldest message ID from store via `getOldestMessageId(channelId)`
  - [ ] 3.3 If no oldest message, return (nothing to paginate from)
  - [ ] 3.4 Set `isLoadingMore = true` in store
  - [ ] 3.5 Call `fetchMessages(channelId, { before: oldestMessageId })`
  - [ ] 3.6 Decrypt returned messages, reverse to chronological order
  - [ ] 3.7 Call `prependMessages(channelId, decryptedMessages, messages.length === 50)` — if 50 returned, assume more exist
  - [ ] 3.8 Set `isLoadingMore = false`
  - [ ] 3.9 On error, set `isLoadingMore = false` and log error (don't show error toast for pagination failures — just stop loading)

- [ ] Task 4: Add scroll position tracking and auto-scroll to ContentArea (AC: 2, 3)
  - [ ] 4.1 Add a `ref` to the scroll container div (`overflow-y-auto` element) in `ContentArea.tsx`
  - [ ] 4.2 Track whether user is "at bottom" using a scroll event listener: `isAtBottom = scrollHeight - scrollTop - clientHeight < 50` (50px threshold)
  - [ ] 4.3 Store `isAtBottom` in a `useRef<boolean>` (not state — avoid re-renders on every scroll event)
  - [ ] 4.4 On initial message load (`isLoading` transitions from true to false), scroll to bottom
  - [ ] 4.5 When new messages arrive (messages array length increases) AND `isAtBottom` is true, auto-scroll to bottom
  - [ ] 4.6 When new messages arrive AND `isAtBottom` is false, do NOT scroll — show the "New messages" indicator instead
  - [ ] 4.7 Use `useEffect` with messages dependency to detect new message arrivals

- [ ] Task 5: Implement "New messages" jump indicator (AC: 3)
  - [ ] 5.1 Add `newMessagesSinceScroll: number` state (or boolean `hasNewMessages`) tracked via `useRef` to count messages received while scrolled up
  - [ ] 5.2 Create inline indicator component at bottom of message feed (above MessageInput): pill-shaped button with text "New messages" and a down-arrow icon
  - [ ] 5.3 Style: `bg-accent-primary text-text-primary rounded-full px-4 py-1.5 text-sm font-medium shadow-lg cursor-pointer` positioned sticky/absolute at the bottom of the scroll area
  - [ ] 5.4 On click: scroll to bottom of feed smoothly (`scrollTo({ top: scrollHeight, behavior: 'smooth' })`) and hide the indicator
  - [ ] 5.5 Auto-hide indicator when user manually scrolls to bottom (detected by scroll event in Task 4)
  - [ ] 5.6 Use `lucide-react` `ArrowDown` icon in the indicator button

- [ ] Task 6: Implement infinite scroll-up to load older messages (AC: 4)
  - [ ] 6.1 Add scroll event listener to detect when user scrolls near the top: `scrollTop < 100` (100px from top)
  - [ ] 6.2 When near top AND `hasMoreMessages[channelId]` is true AND `isLoadingMore` is false, call `fetchOlderMessages(channelId)`
  - [ ] 6.3 **Preserve scroll position** after prepending older messages: capture `scrollHeight` before prepend, after prepend calculate delta (`newScrollHeight - oldScrollHeight`), set `scrollTop += delta`
  - [ ] 6.4 Show a subtle loading spinner at the top of the message feed while `isLoadingMore` is true: `<div className="flex justify-center py-2"><Loader2 className="animate-spin text-text-muted" size={20} /></div>`
  - [ ] 6.5 When `hasMoreMessages` is false for this channel, show "This is the beginning of #channel-name" at the top (already exists for empty state, reuse pattern)
  - [ ] 6.6 Debounce the scroll-near-top check to avoid rapid-fire pagination requests (use a ref flag or 300ms debounce)

- [ ] Task 7: Write tests for updated messageService (AC: 1, 4)
  - [ ] 7.1 Create or update tests in `client/src/renderer/src/services/messageService.test.ts`
  - [ ] 7.2 Test: `fetchMessages(channelId)` without cursor fetches latest messages (no query params)
  - [ ] 7.3 Test: `fetchMessages(channelId, { before: 'msg-id' })` appends before query param to URL
  - [ ] 7.4 Test: `fetchOlderMessages(channelId)` gets oldest message ID from store and calls fetchMessages with cursor
  - [ ] 7.5 Test: `fetchOlderMessages` sets `isLoadingMore` during request
  - [ ] 7.6 Test: `fetchOlderMessages` calls `prependMessages` with decrypted results
  - [ ] 7.7 Test: `fetchOlderMessages` when no messages exist (no oldest ID) returns without fetching

- [ ] Task 8: Write tests for updated useMessageStore (AC: 1, 4)
  - [ ] 8.1 Update tests in `client/src/renderer/src/stores/useMessageStore.test.ts`
  - [ ] 8.2 Test: `prependMessages` adds messages to beginning of channel array
  - [ ] 8.3 Test: `prependMessages` updates `hasMoreMessages` for channel
  - [ ] 8.4 Test: `hasMoreMessages` is initialized to true for new channels
  - [ ] 8.5 Test: `getOldestMessageId` returns first message's ID
  - [ ] 8.6 Test: `getOldestMessageId` returns undefined for empty channel
  - [ ] 8.7 Test: `isLoadingMore` flag toggles correctly

- [ ] Task 9: Write tests for scroll behavior and new messages indicator (AC: 2, 3, 4)
  - [ ] 9.1 Update `client/src/renderer/src/features/layout/ContentArea.test.tsx`
  - [ ] 9.2 Test: "New messages" indicator appears when messages arrive while scrolled up
  - [ ] 9.3 Test: "New messages" indicator does NOT appear when at bottom of feed
  - [ ] 9.4 Test: clicking "New messages" indicator scrolls to bottom
  - [ ] 9.5 Test: loading spinner appears at top when `isLoadingMore` is true
  - [ ] 9.6 Test: initial load scrolls to bottom

- [ ] Task 10: Final verification (AC: 1-5)
  - [ ] 10.1 Run `npm test -w client` — all tests pass, no regressions
  - [ ] 10.2 Run `npm run lint` — clean, no lint errors
  - [ ] 10.3 Run `npm test -w server` — all tests pass, no regressions
  - [ ] 10.4 Manual test: open a channel with messages, verify latest messages load and feed is scrolled to bottom
  - [ ] 10.5 Manual test: send a message while at bottom, verify auto-scroll to show new message
  - [ ] 10.6 Manual test: scroll up, have another user send a message, verify "New messages" indicator appears and feed does NOT auto-scroll
  - [ ] 10.7 Manual test: click "New messages" indicator, verify smooth scroll to bottom
  - [ ] 10.8 Manual test: scroll to top of messages, verify older messages load without losing scroll position
  - [ ] 10.9 Manual test: restart server, reconnect, verify all messages are still available and decryptable
  - [ ] 10.10 Manual test: channel with fewer than 50 messages does NOT show loading spinner at top (no more history)

## Dev Notes

### Critical Architecture Patterns

**Server-Side Pagination (ALREADY EXISTS — DO NOT REBUILD):**
The server endpoint `GET /api/channels/:channelId/messages` already supports cursor-based pagination:
- `?limit=N` (default 50, max 100)
- `?before=messageId` (cursor — fetches messages with rowid < the cursor message's rowid)
- Returns messages in `rowid DESC` order (newest first)
- Response format: `{ data: [...], count: N }`

The client currently ignores pagination and lets the server return default 50. This story adds the client-side logic to USE the existing server pagination.

**Message Store Pagination Pattern:**
```typescript
// Current: setMessages replaces all messages for a channel
setMessages(channelId, messages)  // KEEP for initial load

// NEW: prependMessages adds older messages to the beginning
prependMessages(channelId, olderMessages, hasMore)

// State additions:
hasMoreMessages: Map<string, boolean>  // per-channel flag
isLoadingMore: boolean                  // global loading-more flag
```

**Scroll Position Preservation (CRITICAL for AC 4):**
When prepending older messages, the scroll position MUST be preserved. The technique:
```typescript
const scrollEl = scrollRef.current
const prevScrollHeight = scrollEl.scrollHeight
// ... messages prepended, DOM updates ...
requestAnimationFrame(() => {
  const newScrollHeight = scrollEl.scrollHeight
  scrollEl.scrollTop += (newScrollHeight - prevScrollHeight)
})
```
Use `requestAnimationFrame` to ensure DOM has updated before adjusting scroll. This prevents the jarring "jump to top" effect.

**Auto-Scroll Detection Pattern:**
```typescript
const isAtBottom = useRef(true)

const handleScroll = () => {
  const el = scrollRef.current
  if (!el) return
  isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50
}
```
Use a 50px threshold to account for sub-pixel rendering differences. Store in `useRef` not `useState` to avoid re-renders on every scroll event.

**New Messages Indicator Pattern:**
```typescript
// Show when: new messages arrived AND user is NOT at bottom
// Hide when: user scrolls to bottom OR clicks the indicator
// Position: sticky at bottom of scroll container, above MessageInput
// Animation: fade-in, translate-y for smooth appearance
```

**Scroll-to-Top Pagination Trigger:**
```typescript
const handleScroll = () => {
  // ... isAtBottom check ...
  if (scrollEl.scrollTop < 100 && hasMoreMessages && !isLoadingMore) {
    fetchOlderMessages(channelId)
  }
}
```
Use a 100px threshold from top. The `isLoadingMore` check prevents duplicate requests. No explicit debounce needed since the flag guards against it.

### Existing Infrastructure to Reuse

**DO NOT recreate these — they already exist and work:**
- `messageService.ts` (`client/src/renderer/src/services/messageService.ts`) — already has `fetchMessages()` and `sendMessage()`. EXTEND, don't rewrite
- `useMessageStore.ts` (`client/src/renderer/src/stores/useMessageStore.ts`) — messages Map, DecryptedMessage type, addReceivedMessage. EXTEND, don't rewrite
- `ContentArea.tsx` (`client/src/renderer/src/features/layout/ContentArea.tsx`) — message rendering with MessageGroup, scroll container. MODIFY in-place
- `MessageGroup.tsx` (`client/src/renderer/src/features/messages/MessageGroup.tsx`) — renders grouped messages. DO NOT touch
- `groupMessages.ts` (`client/src/renderer/src/utils/groupMessages.ts`) — pure grouping function. DO NOT touch
- `MessageInput.tsx` (`client/src/renderer/src/features/messages/MessageInput.tsx`) — send message UI. DO NOT touch
- `apiClient.ts` (`client/src/renderer/src/services/apiClient.ts`) — HTTP client for REST calls
- `encryptionService.ts` (`client/src/renderer/src/services/encryptionService.ts`) — decrypt function for messages
- `formatTimestamp.ts` (`client/src/renderer/src/utils/formatTimestamp.ts`) — timestamp formatting utility
- Server message route already supports `before` and `limit` query params — NO server changes needed
- `Loader2` from `lucide-react` — spinning loader icon, already a project dependency
- `ArrowDown` from `lucide-react` — for new messages indicator

**Server-side files — DO NOT MODIFY:**
- `server/src/plugins/messages/messageRoutes.ts` — pagination already works
- `server/src/plugins/messages/messageService.ts` — cursor pagination already works
- `server/src/db/schema.ts` — messages table with indexes already correct

### ESM Import Rules

Client-side imports do NOT use `.js` extensions:
```typescript
import { fetchOlderMessages } from '../../services/messageService'
import { useMessageStore } from '../../stores/useMessageStore'
import { ArrowDown, Loader2 } from 'lucide-react'
```

### Testing Patterns

**Service tests:** Mock `apiClient`, `encryptionService`, `useAuthStore`, `useMessageStore`. Verify correct URL construction with query params. Verify decrypt is called on each message. Verify store methods called with correct args.

**Store tests:** Direct store manipulation via `useMessageStore.getState()` and `.setState()`. Test `prependMessages` preserves existing messages. Test `hasMoreMessages` flag toggling. Test `getOldestMessageId` selector.

**Component tests:** Mock stores, verify indicator visibility based on scroll state. Note: testing actual scroll behavior in JSDOM is limited — mock `scrollHeight`, `scrollTop`, `clientHeight` properties or test at the logic level.

**Test file co-location:**
```
services/messageService.ts
services/messageService.test.ts
stores/useMessageStore.ts
stores/useMessageStore.test.ts
features/layout/ContentArea.tsx
features/layout/ContentArea.test.tsx
```

### Anti-Patterns to Avoid

- **NEVER** modify server-side code — pagination is already complete on the server
- **NEVER** use `useState` for scroll position tracking — use `useRef` to avoid re-renders on every scroll event
- **NEVER** use `window.addEventListener('scroll', ...)` — attach to the scroll container element, not window
- **NEVER** create a separate React Context for scroll state — keep it local to ContentArea
- **NEVER** use `overflow-anchor` CSS property alone for scroll preservation — explicitly calculate and set scrollTop
- **NEVER** fetch all messages at once — always use limit parameter (50 per page)
- **NEVER** import `wsClient` in components — only services import wsClient
- **NEVER** import one Zustand store inside another store
- **NEVER** use `console.log` on the server
- **NEVER** create new Zustand stores — extend existing `useMessageStore`
- **NEVER** add virtual scrolling / windowing (e.g., react-window, react-virtuoso) in this story — the ~20 user friend group won't generate enough messages to need it in MVP. Add only if perf issues arise later
- **NEVER** add `after` cursor support to the server — not needed. Only `before` cursor for loading older messages
- **NEVER** debounce the auto-scroll-to-bottom on new messages — it should be instant

### Deferred / Not In Scope

- **Virtual scrolling / windowing** — only needed if message count causes perf issues (unlikely for 20-user group)
- **Unread message counts per channel** — separate feature, not in this story
- **Day separator dividers in message feed** — nice to have but not in AC
- **Message search** — constrained by E2E encryption, not in MVP
- **Jump to specific date/message** — not in AC
- **Message editing or deletion** — not in MVP
- **Typing indicators** — not in MVP
- **Client-side message caching** (IndexedDB/localStorage) — channel messages only live in Zustand store (memory). On channel switch, messages are re-fetched. This is fine for MVP with ~20 users

### Previous Story (2-3) Intelligence

**Key patterns established in 2-3 that MUST be continued:**
- `ContentArea.tsx` uses `useMemo` for `groupMessages()` — keep this pattern, groups are derived from flat message array
- Messages render inside `<div className="max-w-[720px] mx-auto w-full px-4 py-4">` — the scroll container wraps this inner div
- `EMPTY_MESSAGES` module-level constant prevents re-render loops — maintain this pattern
- `MessageGroup` component uses `key={group.authorId}-${group.firstTimestamp}` — keep this key pattern
- The `useEffect` that calls `fetchMessages(channelId)` on channel change needs to be updated to also reset scroll position and pagination state

**Debug learnings from 2-3:**
- Zustand selector stability: use module-level constants for empty defaults
- `vi.mock` hoisting: use `vi.hoisted()` for mock variable declarations
- Mock contamination: use `mockImplementationOnce` for one-time overrides

**Code review fixes from 2-3:**
- Username font-weight corrected to `font-semibold`
- `formatTimestamp` extracted to standalone utility with invalid-date guard
- Accessibility: `aria-hidden` on avatars, `role="group"` on message groups, `role="log"` on message feed — continue these accessibility patterns

### Git Intelligence

Recent commits:
```
eb1be8e Merge story 2-3: Message feed and channel navigation UI
658d33b Code review 2-3: fix 8 issues from adversarial code review
4ba38e9 Bug fix 2-2
8058733 Implement story 2-3: Message feed and channel navigation UI
```

Key patterns from recent work:
- Components use Tailwind utility classes exclusively (no CSS modules, no styled-components)
- lucide-react for all icons
- Feature-based file organization (`features/{domain}/`)
- Tests co-located with source files
- Radix UI primitives for accessible interactive components

### Project Structure Notes

**Files to modify:**
```
client/src/renderer/src/services/messageService.ts     # Add pagination params + fetchOlderMessages
client/src/renderer/src/stores/useMessageStore.ts       # Add prependMessages, hasMoreMessages, isLoadingMore
client/src/renderer/src/features/layout/ContentArea.tsx  # Add scroll tracking, auto-scroll, indicator, infinite scroll-up
```

**Files to create:**
```
(none — all changes are modifications to existing files)
```

**Test files to update:**
```
client/src/renderer/src/services/messageService.test.ts     # Add pagination tests
client/src/renderer/src/stores/useMessageStore.test.ts       # Add prepend/hasMore tests
client/src/renderer/src/features/layout/ContentArea.test.tsx  # Add scroll behavior tests
```

**No new files needed. No server-side changes needed.**

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-real-time-text-communication.md#Story-2.4] — Acceptance criteria, user story, BDD scenarios
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#MessageFeed] — Auto-scroll to newest, "New messages" indicator when scrolled up
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — "Use virtualized scrolling for the message feed if history grows large (1000+ messages)" — deferred to post-MVP
- [Source: _bmad-output/planning-artifacts/architecture.md#FrontendArchitecture] — Zustand store pattern, service layer pattern
- [Source: _bmad-output/planning-artifacts/prd.md#FR13] — Users can view persistent message history in text channels upon login
- [Source: _bmad-output/planning-artifacts/prd.md#FR14] — Users can scroll through past message history in a text channel
- [Source: _bmad-output/project-context.md] — Anti-patterns, import boundaries, testing rules, casing conventions
- [Source: server/src/plugins/messages/messageRoutes.ts] — Existing pagination: `before` cursor + `limit` query params
- [Source: server/src/plugins/messages/messageService.ts] — `getMessagesByChannel` uses rowid DESC ordering with cursor
- [Source: server/src/db/schema.ts] — messages table: id, channel_id, user_id, encrypted_content, nonce, created_at; indexes on channel_id and created_at
- [Source: client/src/renderer/src/services/messageService.ts] — Current fetchMessages (no pagination), sendMessage with encryption
- [Source: client/src/renderer/src/stores/useMessageStore.ts] — DecryptedMessage type, messages Map, addReceivedMessage, setMessages
- [Source: client/src/renderer/src/features/layout/ContentArea.tsx] — Current scroll container, grouped rendering, useEffect for channel fetch
- [Source: _bmad-output/implementation-artifacts/2-3-message-feed-and-channel-navigation-ui.md] — Previous story patterns, debug learnings, existing infrastructure list

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
