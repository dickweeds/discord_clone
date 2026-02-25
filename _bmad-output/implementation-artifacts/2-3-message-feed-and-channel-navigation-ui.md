# Story 2.3: Message Feed & Channel Navigation UI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see messages displayed in a clean, chronological feed with Discord-familiar grouping,
so that I can follow conversations naturally and know who said what.

## Acceptance Criteria

1. **Given** I am viewing a text channel **When** messages are displayed **Then** they appear in chronological order in the content area **And** the content header shows the channel name with # prefix

2. **Given** consecutive messages are from the same author within 5 minutes **When** the messages render **Then** they are grouped under a single header showing avatar (32px), username (semibold), and timestamp (muted, 12px) **And** subsequent messages in the group have 4px vertical spacing

3. **Given** a new author sends a message or more than 5 minutes pass **When** the next message renders **Then** a new message group starts with its own header **And** 16px gap separates it from the previous group

4. **Given** the message input bar **When** I look at the bottom of the content area **Then** I see a text input with placeholder "Message #channel-name" **And** it has 12px border radius, bg-tertiary background, and 44px minimum height

5. **Given** I click a different text channel in the sidebar **When** the channel switches **Then** the content area instantly swaps to show that channel's messages **And** the previously active channel loses its selected state **And** the new channel shows the active/selected state

6. **Given** the message feed content **When** messages are displayed on a wide window (>1400px) **Then** message content width is capped at ~720px and centered in the content area

7. **Given** a text channel with no messages **When** I view the empty channel **Then** I see centered text: channel name + "This is the beginning of #channel-name. Send the first message!"

## Tasks / Subtasks

- [x] Task 1: Create MessageGroup component for same-author message grouping (AC: 2, 3)
  - [x] 1.1 Create `client/src/renderer/src/features/messages/MessageGroup.tsx` — renders a group of consecutive messages from the same author
  - [x] 1.2 Group header: 32px avatar circle (colored initial using `getAvatarColor` from `utils/avatarColor.ts`), username (16px, font-medium/500 weight, `text-text-primary`), timestamp (12px, `text-text-muted`)
  - [x] 1.3 Message body lines: each message content rendered below header with 4px vertical spacing, 16px font size, `text-text-secondary`, `whitespace-pre-wrap break-words`
  - [x] 1.4 Group container: 16px gap from previous group (use `mt-4` on non-first groups), hover effect `hover:bg-bg-hover` with `transition-colors duration-150` on the entire group
  - [x] 1.5 Failed/sending status indicators: same as current — "Sending..." italic muted text, "Message not delivered" red text on failed messages
  - [x] 1.6 Avatar column: fixed 32px width with 12px right gap, message content flows in adjacent column

- [x] Task 2: Create message grouping logic utility (AC: 2, 3)
  - [x] 2.1 Create `client/src/renderer/src/utils/groupMessages.ts` — pure function `groupMessages(messages: DecryptedMessage[]): MessageGroupData[]`
  - [x] 2.2 `MessageGroupData` type: `{ authorId: string, messages: DecryptedMessage[], firstTimestamp: string }`
  - [x] 2.3 Grouping rules: same `authorId` AND each subsequent message is within 5 minutes of the previous message in the group
  - [x] 2.4 A new group starts when: (a) different authorId, OR (b) >5 minute gap from previous message
  - [x] 2.5 Input messages assumed chronologically sorted (already guaranteed by store)

- [x] Task 3: Create username resolver hook (AC: 2)
  - [x] 3.1 Create `client/src/renderer/src/hooks/useUsername.ts` — hook `useUsername(authorId: string): { username: string, avatarColor: string }`
  - [x] 3.2 Look up user from `useMemberStore.members` array by matching `member.id === authorId`
  - [x] 3.3 Return `{ username: member.username, avatarColor: getAvatarColor(member.username) }` if found
  - [x] 3.4 Fallback if member not found: `{ username: authorId.slice(0, 8), avatarColor: getAvatarColor(authorId) }` (handles deleted users or race conditions)

- [x] Task 4: Refactor ContentArea to use MessageGroup and message width capping (AC: 1, 2, 3, 6, 7)
  - [x] 4.1 Replace the flat `MessageBubble` rendering with grouped rendering: call `groupMessages(channelMessages)` then map each group to `<MessageGroup />`
  - [x] 4.2 Remove the inline `MessageBubble` function from ContentArea.tsx — it's replaced by MessageGroup
  - [x] 4.3 Add message width capping: wrap the message list in a container with `max-w-[720px] mx-auto w-full` so messages are centered and capped at 720px on wide screens
  - [x] 4.4 The outer scroll container keeps full width (scrollbar stays at edge), only the inner message content area is width-capped
  - [x] 4.5 Update empty channel state text to match spec exactly: channel name bold + "This is the beginning of #channel-name. Send the first message!"
  - [x] 4.6 Keep ContentHeader as-is (already shows # prefix + channel name + member toggle — it works correctly)
  - [x] 4.7 Keep MessageInput integration as-is (already functional from story 2-2)

- [x] Task 5: Ensure channel sidebar active state works correctly (AC: 5)
  - [x] 5.1 Verify ChannelItem already highlights active channel with `bg-bg-active` and `text-text-primary` — confirmed working
  - [x] 5.2 Verify that clicking a different channel instantly fetches new messages via the `useEffect` in ContentArea that calls `fetchMessages(channelId)` on channelId change — confirmed working
  - [x] 5.3 Verify previous channel loses selected state and new channel gains it (this should already work via `activeChannelId` in `useChannelStore`) — confirmed working
  - [x] 5.4 All subtasks already work correctly. No changes needed.

- [x] Task 6: Write tests for message grouping utility (AC: 2, 3)
  - [x] 6.1 Create `client/src/renderer/src/utils/groupMessages.test.ts`
  - [x] 6.2 Test: single message produces single group
  - [x] 6.3 Test: consecutive messages from same author within 5 min are grouped together
  - [x] 6.4 Test: messages from different authors create separate groups
  - [x] 6.5 Test: messages from same author >5 min apart create separate groups
  - [x] 6.6 Test: mixed scenario with multiple authors and time gaps
  - [x] 6.7 Test: empty message array returns empty group array

- [x] Task 7: Write tests for MessageGroup component (AC: 2, 3)
  - [x] 7.1 Create `client/src/renderer/src/features/messages/MessageGroup.test.tsx`
  - [x] 7.2 Test: renders avatar with correct initial and color
  - [x] 7.3 Test: renders username (not authorId) from member store
  - [x] 7.4 Test: renders timestamp in readable format
  - [x] 7.5 Test: renders all messages in the group
  - [x] 7.6 Test: failed message shows red "Message not delivered" indicator
  - [x] 7.7 Test: sending message shows "Sending..." indicator
  - [x] 7.8 Test: fallback to truncated authorId when member not found

- [x] Task 8: Write tests for useUsername hook (AC: 2)
  - [x] 8.1 Create `client/src/renderer/src/hooks/useUsername.test.ts`
  - [x] 8.2 Test: returns username and avatarColor for known member
  - [x] 8.3 Test: returns truncated ID fallback for unknown member
  - [x] 8.4 Mock `useMemberStore` with test members

- [x] Task 9: Update ContentArea tests (AC: 1, 6, 7)
  - [x] 9.1 Update `client/src/renderer/src/features/layout/ContentArea.test.tsx`
  - [x] 9.2 Test: messages render as grouped (MessageGroup components) not as flat list
  - [x] 9.3 Test: empty channel shows "This is the beginning of #channel-name. Send the first message!"
  - [x] 9.4 Test: message container has max-width constraint

- [x] Task 10: Final verification (AC: 1-7)
  - [x] 10.1 Run `npm test -w client` — 195 tests pass (29 test files)
  - [x] 10.2 Run `npm run lint` — clean, no lint errors
  - [x] 10.3 Run `npm test -w server` — 270 tests pass, no regressions
  - [ ] 10.4 Manual test: send messages from two users, verify grouping (same author grouped, different authors separated)
  - [ ] 10.5 Manual test: send messages >5 min apart from same user, verify new group starts
  - [ ] 10.6 Manual test: click between channels, verify instant swap with correct active state
  - [ ] 10.7 Manual test: resize window >1400px, verify message content is capped at ~720px and centered
  - [ ] 10.8 Manual test: view empty channel, verify welcome message displays

## Dev Notes

### Critical Architecture Patterns

**Message Grouping Logic:**
```
Messages are grouped when:
  1. Same authorId as previous message
  2. AND timestamp within 5 minutes of previous message in group

New group starts when:
  1. Different authorId, OR
  2. >5 minute gap from previous message

Group structure:
  [Group Header: Avatar(32px) + Username(16px, font-500) + Timestamp(12px, muted)]
  [Message body 1]          ← 4px gap between messages within group
  [Message body 2]
  [Message body 3]
                            ← 16px gap between groups
  [Next Group Header: ...]
  [Message body 4]
```

**Username Resolution Pattern:**
```typescript
// The useMemberStore already has all server members loaded (fetched in AppLayout on mount)
// Members array: UserPublic[] = [{ id, username, role, createdAt }, ...]
// To resolve authorId → username:
const member = useMemberStore.getState().members.find(m => m.id === authorId)
const username = member?.username ?? authorId.slice(0, 8)  // fallback for deleted users
const avatarColor = getAvatarColor(username)
```

**Avatar Rendering (reuse existing pattern from MemberItem.tsx):**
```typescript
// Same avatar circle pattern already used in MemberItem
<div
  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-text-primary"
  style={{ backgroundColor: avatarColor }}
>
  {username.charAt(0).toUpperCase()}
</div>
```

**Message Width Capping (>1400px screens):**
```typescript
// Outer container: full width, handles scroll
<div className="flex-1 overflow-y-auto">
  {/* Inner container: capped width, centered */}
  <div className="max-w-[720px] mx-auto w-full px-4 py-4">
    {groups.map((group) => <MessageGroup key={...} group={group} />)}
  </div>
</div>
```
The scrollbar stays at the content area edge (not at 720px), only message content is width-constrained.

**Timestamp Formatting:**
```typescript
// For group header: show date context
const formatTimestamp = (iso: string): string => {
  const date = new Date(iso)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today at ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`
  return `${date.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' })} ${time}`
}
```

### Existing Infrastructure to Reuse

**DO NOT recreate these — they already exist:**
- `ContentArea.tsx` (client/src/renderer/src/features/layout/) — refactor in-place, don't create a new file
- `ContentHeader` function in ContentArea.tsx — already shows # prefix + channel name + member toggle button. Keep it.
- `MessageInput.tsx` (client/src/renderer/src/features/messages/) — fully functional from story 2-2, DO NOT touch
- `useMessageStore.ts` — `messages` Map keyed by channelId, `DecryptedMessage` type with `id, channelId, authorId, content, createdAt, status, tempId`
- `useChannelStore.ts` — `activeChannelId`, `setActiveChannel()`, `channels` array
- `useMemberStore.ts` — `members: UserPublic[]` with `{ id, username, role, createdAt }` per member
- `getAvatarColor(username)` from `utils/avatarColor.ts` — deterministic color from username hash
- `ChannelItem.tsx` — already handles active/hover/default states with `bg-bg-active` / `bg-bg-hover`
- `ChannelSidebar.tsx` — already groups text/voice channels, handles navigation
- `ConnectionBanner.tsx` — already handles connection state display
- `messageService.ts` — `fetchMessages()`, `sendMessage()` with encryption
- Color tokens already configured in `globals.css`: `bg-primary`, `bg-secondary`, `bg-tertiary`, `bg-hover`, `bg-active`, `text-primary`, `text-secondary`, `text-muted`, `accent-primary`, `border-default`
- `lucide-react` icons — `Hash`, `Users` already imported in ContentArea

**DO NOT import these in the new components:**
- `wsClient` — only services import wsClient, never components
- `encryptionService` — only messageService uses this
- Any Zustand store from inside another store — stores are independent

### ESM Import Rules

Client-side imports do NOT use `.js` extensions:
```typescript
import { MessageGroup } from '../messages/MessageGroup'
import { groupMessages } from '../../utils/groupMessages'
import { useUsername } from '../../hooks/useUsername'
import { getAvatarColor } from '../../utils/avatarColor'
import { useMemberStore } from '../../stores/useMemberStore'
```

### Testing Patterns

**Component tests (MessageGroup):** React Testing Library + Vitest. Mock `useMemberStore` with `vi.mock`. Test that username (not authorId) is rendered, avatar color is applied, all messages in group appear.

**Utility tests (groupMessages):** Pure function, no mocks needed. Test edge cases: empty array, single message, same author within 5 min, same author > 5 min, different authors.

**Hook tests (useUsername):** Mock `useMemberStore`, verify correct username/color for known member, verify fallback for unknown member.

**ContentArea tests:** Mock `useMessageStore`, `useChannelStore`, `useMemberStore`. Verify grouped rendering (MessageGroup components), empty state text, max-width wrapper presence.

**Test file co-location:** Tests live next to source files:
```
utils/groupMessages.ts
utils/groupMessages.test.ts
features/messages/MessageGroup.tsx
features/messages/MessageGroup.test.tsx
hooks/useUsername.ts
hooks/useUsername.test.ts
```

### Anti-Patterns to Avoid

- **NEVER** create a new Zustand store for message grouping — grouping is a derived computation, not state
- **NEVER** import `useMemberStore` inside `useMessageStore` — stores are independent. Use a hook or component to combine data from both stores
- **NEVER** store grouped messages in state — derive groups from flat messages array each render (use `useMemo` if needed)
- **NEVER** add message pagination/infinite scroll — that's story 2-4
- **NEVER** add auto-scroll behavior — that's story 2-4
- **NEVER** add "New messages" indicator — that's story 2-4
- **NEVER** add rich text/markdown rendering — not in MVP
- **NEVER** add typing indicators — not in MVP
- **NEVER** use `console.log` on the server
- **NEVER** import one Zustand store inside another
- **NEVER** prop drill beyond 2 levels — use stores or hooks
- **NEVER** create React Context for any state — Zustand only

### Deferred / Not In Scope

- **Message history pagination / infinite scroll** — story 2-4
- **Auto-scroll to bottom on new messages** — story 2-4
- **"New messages" indicator when scrolled up** — story 2-4
- **Message editing or deletion** — not in MVP
- **Rich text / markdown rendering** — not in MVP
- **Typing indicators** — not in MVP
- **Message reactions/replies** — not in MVP
- **Day separators** — nice to have but not in AC, skip
- **Virtualized scrolling** — only needed when pagination exists (story 2-4)
- **Unread channel indicators** — not in this story's AC

### Previous Story (2-2) Intelligence

**Key patterns established:**
- `DecryptedMessage` type: `{ id, channelId, authorId, content, createdAt, status: 'sent' | 'sending' | 'failed', tempId? }`
- Messages stored decrypted in `useMessageStore.messages` Map, keyed by channelId
- Messages fetched via `fetchMessages(channelId)` in `messageService.ts` — decrypts and reverses to chronological order
- ContentArea renders messages from store via `channelMessages = s.messages.get(channelId) ?? EMPTY_MESSAGES`
- `EMPTY_MESSAGES` module-level constant prevents infinite re-renders from `[] ?? []` — maintain this pattern

**Debug learnings from 2-2:**
- Zustand selector stability: `[] ?? []` creates new array references — use module-level `EMPTY_MESSAGES` constant (already done)
- vi.mock hoisting: use `vi.hoisted()` to hoist mock variables
- Mock contamination: use `mockImplementationOnce` for one-time behavior overrides

**Code review fixes from 2-2:**
- `useMessageStore` no longer imports `wsClient` or `useAuthStore` — those are in `messageService.ts` service layer
- Store is pure state, services handle side effects
- Always create `Error` instances (not plain objects) when throwing

### Git Intelligence

Recent commits show stories 5-2 (user management), 5-1 (channel management), 3-1 (voice infrastructure), and 2-2 (encrypted messaging) complete. Current main branch has all these merged.

Key pattern from recent stories:
- Components use Radix UI primitives + Tailwind styling
- lucide-react for icons (Hash, Users, etc.)
- Feature-based file organization (`features/{domain}/`)
- Tests co-located with source files

### Project Structure Notes

**New files to create:**
```
client/src/renderer/src/features/messages/
  MessageGroup.tsx                    # Grouped message display component
  MessageGroup.test.tsx               # Component tests

client/src/renderer/src/utils/
  groupMessages.ts                    # Pure grouping function
  groupMessages.test.ts               # Utility tests

client/src/renderer/src/hooks/
  useUsername.ts                       # Username resolver hook
  useUsername.test.ts                  # Hook tests
```

**Modified files:**
```
client/src/renderer/src/features/layout/ContentArea.tsx    # Replace flat list with grouped rendering + max-width
client/src/renderer/src/features/layout/ContentArea.test.tsx  # Update tests for grouped rendering
```

**No server-side changes expected for this story.**

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-real-time-text-communication.md#Story-2.3] — Acceptance criteria, user story, BDD scenarios
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#MessageFeed] — Message group spacing (4px within, 16px between), avatar 32px, username 16px semibold, timestamp 12px muted
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#ContentArea] — Max-width 720px centered on >1400px screens, empty channel state text
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#ColorTokens] — bg-hover #362f28, text-primary #f0e6d9, text-secondary #a89882, text-muted #6d5f4e
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Typography] — 16px base message text, 12px timestamps, 500 weight usernames
- [Source: _bmad-output/planning-artifacts/architecture.md#FrontendArchitecture] — Zustand store pattern, feature-based organization, service layer
- [Source: _bmad-output/project-context.md] — Anti-patterns, import boundaries, testing rules, casing conventions
- [Source: client/src/renderer/src/features/layout/ContentArea.tsx] — Current flat MessageBubble implementation to refactor
- [Source: client/src/renderer/src/stores/useMessageStore.ts] — DecryptedMessage type, messages Map structure
- [Source: client/src/renderer/src/stores/useMemberStore.ts] — UserPublic members array for username resolution
- [Source: client/src/renderer/src/utils/avatarColor.ts] — getAvatarColor() for deterministic avatar colors
- [Source: client/src/renderer/src/features/members/MemberItem.tsx] — Avatar circle rendering pattern to reuse
- [Source: client/src/renderer/src/features/channels/ChannelItem.tsx] — Active channel highlighting pattern (bg-bg-active)
- [Source: _bmad-output/implementation-artifacts/2-2-encrypted-text-messaging.md] — Previous story patterns, debug learnings, service layer pattern

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- ContentArea test fix: `getByText('general')` matched multiple elements after empty state text change. Fixed by using `getAllByText` for header test and checking unique welcome text for empty state test.

### Completion Notes List

- Created `groupMessages.ts` pure utility — groups consecutive messages by same author within 5-minute window. 7 unit tests.
- Created `useUsername.ts` hook — resolves authorId to username/avatarColor via useMemberStore lookup with truncated-ID fallback. 3 unit tests.
- Created `MessageGroup.tsx` component — renders grouped messages with avatar, username header, timestamps, and status indicators. 9 unit tests.
- Refactored `ContentArea.tsx` — replaced flat MessageBubble rendering with grouped MessageGroup rendering, added `max-w-[720px] mx-auto` width capping, updated empty channel text to match AC 7 spec.
- Updated `ContentArea.test.tsx` — added useMemberStore setup, updated empty state assertions, added tests for grouped rendering and max-width constraint. 2 new tests.
- Verified channel sidebar active state (Task 5) — ChannelItem already handles bg-bg-active/bg-bg-hover correctly via activeChannelId store. No changes needed.
- All automated tests pass: 195 client tests, 270 server tests, lint clean.
- Manual tests (10.4-10.8) deferred to user for visual verification.

### Change Log

- 2026-02-25: Story 2-3 implementation complete. Created message grouping system with MessageGroup component, groupMessages utility, and useUsername hook. Refactored ContentArea for grouped rendering with width capping.
- 2026-02-25: Code review fixes (8 issues). Fixed username font-weight to font-semibold (AC 2). Extracted formatTimestamp to utility with dedicated tests and invalid-date guard. Added aria-hidden on avatars, role="group" on message groups, role="log" on message feed. Improved ContentArea tests with structural group validation and empty-state heading assertion. Optimized useUsername Zustand selector to target specific member.

### File List

New files:
- client/src/renderer/src/features/messages/MessageGroup.tsx
- client/src/renderer/src/features/messages/MessageGroup.test.tsx
- client/src/renderer/src/utils/groupMessages.ts
- client/src/renderer/src/utils/groupMessages.test.ts
- client/src/renderer/src/utils/formatTimestamp.ts
- client/src/renderer/src/utils/formatTimestamp.test.ts
- client/src/renderer/src/hooks/useUsername.ts
- client/src/renderer/src/hooks/useUsername.test.ts

Modified files:
- client/src/renderer/src/features/layout/ContentArea.tsx
- client/src/renderer/src/features/layout/ContentArea.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/2-3-message-feed-and-channel-navigation-ui.md
