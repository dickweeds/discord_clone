# Story 5.2: User Management & Administration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the server owner (Aiden),
I want to view all users and manage membership (kick, ban, unban, reset passwords),
So that I can maintain the server and help friends who get locked out.

## Acceptance Criteria

1. **Given** I am the server owner **When** I access user management via server settings or right-click on a member **Then** I can view a list of all registered users with their status

2. **Given** I right-click on a member in the member list **When** the context menu appears (admin only) **Then** I see options: "Kick", "Ban", "Reset Password"

3. **Given** I select "Kick" on a user **When** a confirmation dialog appears and I confirm **Then** the user is removed from the server **And** their active sessions are invalidated **And** they receive a `user:kicked` WebSocket notification **And** they can rejoin via a new invite link

4. **Given** I select "Ban" on a user **When** a confirmation dialog appears and I confirm **Then** the user is removed from the server **And** their account is banned **And** they cannot log in or create new accounts **And** they receive a `user:banned` WebSocket notification

5. **Given** I access the banned users list **When** I select "Unban" on a previously banned user **Then** their ban is lifted **And** they can register a new account or log in again via invite

6. **Given** I select "Reset Password" on a user **When** the action is executed **Then** a new temporary password is generated **And** displayed to me (the admin) for sharing with the user directly **And** the user's existing sessions are invalidated

7. **Given** I am a regular user **When** I right-click on a member **Then** no admin options (kick, ban, reset password) are visible

## Tasks / Subtasks

- [x] Task 1: Create server-side admin plugin with kick/ban/unban/reset-password routes (AC: 2, 3, 4, 5, 6)
  - [x] 1.1 Create `server/src/plugins/admin/adminService.ts`:
    - `kickUser(db, userId)` — deletes all sessions for the user via `deleteUserSessions()` (already exists in `sessionService.ts`), removes user from presence (if online). Does NOT delete the user record — they can rejoin. Returns the kicked user's info
    - `banUser(db, userId, bannedBy)` — inserts into `bans` table, deletes all sessions, removes from presence. The ban check already exists in `authService` login/register flows
    - `unbanUser(db, userId)` — deletes the ban record from `bans` table
    - `resetPassword(db, userId)` — generates a random temporary password (crypto.randomBytes(16).toString('base64url')), hashes it with bcrypt (cost 12 — use existing `hashPassword()`), updates the user's `password_hash`, deletes all sessions. Returns the plaintext temporary password
    - `getBannedUsers(db)` — queries `bans` table joined with `users` to return `{ id, userId, username, bannedBy, createdAt }[]`
  - [x] 1.2 Create `server/src/plugins/admin/adminRoutes.ts` as a Fastify plugin:
    - Prefix: `/api/admin`
    - All routes use `requireOwner()` pre-handler (from `authMiddleware.ts`)
    - `POST /api/admin/kick/:userId` — kicks user, broadcasts `user:kicked` WS message, returns `204`
    - `POST /api/admin/ban/:userId` — bans user, broadcasts `user:banned` WS message, returns `204`
    - `POST /api/admin/unban/:userId` — unbans user, returns `204`
    - `POST /api/admin/reset-password/:userId` — resets password, returns `200 { data: { temporaryPassword: string } }`
    - `GET /api/admin/bans` — returns `200 { data: BannedUser[], count: number }`
    - Add Fastify JSON schema validation for all route params
    - Prevent owner from kicking/banning/resetting themselves (return `400 { error: { code: "INVALID_ACTION", message: "Cannot perform this action on yourself" } }`)
  - [x] 1.3 Register admin plugin in `server/src/app.ts` — add `fastify.register(adminRoutes, { prefix: '/api/admin' })` after user routes

- [x] Task 2: Add WebSocket notifications for admin actions (AC: 3, 4)
  - [x] 2.1 In `shared/src/ws-messages.ts`: add `UserKickedPayload { userId: string, reason?: string }` and `UserBannedPayload { userId: string }`
  - [x] 2.2 In `shared/src/ws-messages.ts`: add `WS_TYPES.USER_KICKED = 'user:kicked'` and `WS_TYPES.USER_BANNED = 'user:banned'` to the existing WS_TYPES object
  - [x] 2.3 In `shared/src/index.ts`: export the new payload types
  - [x] 2.4 After kick/ban in admin routes: send `user:kicked` or `user:banned` directly to the targeted user's WebSocket connection (NOT broadcast to all — only the affected user needs notification), then close their WS connection
  - [x] 2.5 After kick/ban: broadcast `presence:update { userId, status: 'offline' }` to all remaining clients so they see the user go offline
  - [x] 2.6 After kick/ban: broadcast `member:removed { userId }` to all remaining clients so they remove the user from their member list

- [x] Task 3: Add client-side WebSocket handlers for admin events (AC: 3, 4)
  - [x] 3.1 In `client/src/renderer/src/services/wsClient.ts`: register handler for `user:kicked` → show a dialog informing the user they've been kicked, then call `useAuthStore.getState().logout()` to clear tokens and redirect to login
  - [x] 3.2 In `client/src/renderer/src/services/wsClient.ts`: register handler for `user:banned` → show a dialog informing the user they've been banned, then call `useAuthStore.getState().logout()` to clear tokens and redirect to login
  - [x] 3.3 In `client/src/renderer/src/services/wsClient.ts`: register handler for `member:removed` → calls `useMemberStore.getState().removeMember(payload.userId)` to remove from member list
  - [x] 3.4 In `client/src/renderer/src/stores/useMemberStore.ts`: add `removeMember(userId: string)` action — removes user from `members` array

- [x] Task 4: Add context menu to MemberItem for admin actions (AC: 2, 7)
  - [x] 4.1 Create `client/src/renderer/src/features/admin/MemberContextMenu.tsx` — Radix `ContextMenu` wrapper. Only renders for owner role (from `useAuthStore`). Never renders when targeting self (the owner). Regular users: right-click does nothing (no menu rendered)
  - [x] 4.2 Context menu items:
    - "Kick" with a person-remove icon
    - "Ban" with a ban/block icon, styled in `error` color (#f23f43), preceded by Radix `Separator`
    - "Reset Password" with a key/lock icon
  - [x] 4.3 Menu styling: `bg-floating` (#161310) background, 8px border radius, 6px padding, min-width 180px
  - [x] 4.4 Wrap each `MemberItem` in `MemberList.tsx` with `MemberContextMenu` — pass `userId` and `username` as props
  - [x] 4.5 "Kick" opens `KickConfirmDialog`, "Ban" opens `BanConfirmDialog`, "Reset Password" opens `ResetPasswordDialog`

- [x] Task 5: Create confirmation dialogs for destructive admin actions (AC: 3, 4, 6)
  - [x] 5.1 Create `client/src/renderer/src/features/admin/KickConfirmDialog.tsx` — Radix Dialog:
    - Title: "Kick {username}?"
    - Description: "They will be removed from the server but can rejoin with a new invite."
    - Buttons: "Cancel" (secondary) + "Kick" (danger `error` fill)
    - On confirm: call `POST /api/admin/kick/:userId` via apiClient, show loading on button, close on success
    - NOT a destructive action that needs warning about data loss — kick is reversible
  - [x] 5.2 Create `client/src/renderer/src/features/admin/BanConfirmDialog.tsx` — Radix Dialog:
    - Title: "Ban {username}?"
    - Description: "They will be permanently removed and cannot log in or create new accounts."
    - Buttons: "Cancel" (secondary) + "Ban" (danger `error` fill)
    - On confirm: call `POST /api/admin/ban/:userId` via apiClient, show loading on button, close on success
  - [x] 5.3 Create `client/src/renderer/src/features/admin/ResetPasswordDialog.tsx` — Radix Dialog:
    - Title: "Reset Password for {username}"
    - On trigger: calls `POST /api/admin/reset-password/:userId` immediately (no confirmation per UX spec — non-destructive)
    - Shows generated temporary password with a "Copy" button
    - Description: "Share this temporary password with {username} directly. Their current sessions have been invalidated."
    - Buttons: "Copy Password" (primary) + "Done" (secondary)
    - Copies temporary password to clipboard via `navigator.clipboard.writeText()`
  - [x] 5.4 Dialog styling: `bg-floating` background, max-width 440px, 16px padding, 8px border radius, semi-transparent dark overlay

- [x] Task 6: Add admin panel for banned users management (AC: 5)
  - [x] 6.1 Create `client/src/renderer/src/features/admin/BannedUsersPanel.tsx`:
    - Accessible from server settings dropdown ("Manage Bans" or "Banned Users")
    - Fetches banned users from `GET /api/admin/bans`
    - Displays list of banned users with username and ban date
    - Each entry has an "Unban" button
    - On unban: calls `POST /api/admin/unban/:userId`, removes from list on success
    - Empty state: "No banned users" message
  - [x] 6.2 Add "Banned Users" option to the server settings dropdown (from Story 5-1's `ServerHeader.tsx`) — only visible to owner

- [x] Task 7: Add kicked/banned notification dialog for affected users (AC: 3, 4)
  - [x] 7.1 Create `client/src/renderer/src/features/admin/KickedNotification.tsx` — Modal that appears when user receives `user:kicked` WS message:
    - Title: "You've been kicked"
    - Description: "The server owner has removed you from the server. You can rejoin with a new invite link."
    - Button: "OK" — triggers logout and redirect to login page
    - Cannot be dismissed by clicking outside or pressing Escape — must click OK
  - [x] 7.2 Create `client/src/renderer/src/features/admin/BannedNotification.tsx` — Modal that appears when user receives `user:banned` WS message:
    - Title: "You've been banned"
    - Description: "The server owner has banned your account. You cannot log in or create new accounts."
    - Button: "OK" — triggers logout and redirect to login page
    - Cannot be dismissed by clicking outside or pressing Escape — must click OK

- [x] Task 8: Write server-side tests (AC: 1-7)
  - [x] 8.1 Create `server/src/plugins/admin/adminService.test.ts`:
    - Test kickUser: verifies sessions deleted, returns user info
    - Test kickUser: throws 404 for non-existent user
    - Test banUser: verifies ban record created, sessions deleted
    - Test banUser: throws 404 for non-existent user
    - Test unbanUser: verifies ban record deleted
    - Test unbanUser: throws 404 for non-existent ban
    - Test resetPassword: verifies password hash changed, sessions deleted, returns temp password
    - Test getBannedUsers: returns all banned users with usernames
  - [x] 8.2 Create `server/src/plugins/admin/adminRoutes.test.ts`:
    - Test POST /api/admin/kick/:userId with owner token → 204
    - Test POST /api/admin/kick/:userId with non-owner token → 403
    - Test POST /api/admin/kick/:ownUserId (self-kick) → 400
    - Test POST /api/admin/kick/:nonexistentId → 404
    - Test POST /api/admin/ban/:userId with owner token → 204
    - Test POST /api/admin/ban/:userId with non-owner token → 403
    - Test POST /api/admin/ban/:ownUserId (self-ban) → 400
    - Test POST /api/admin/unban/:userId with owner token → 204
    - Test POST /api/admin/unban/:userId with non-owner token → 403
    - Test POST /api/admin/reset-password/:userId with owner token → 200, returns temporaryPassword
    - Test POST /api/admin/reset-password/:userId with non-owner token → 403
    - Test POST /api/admin/reset-password/:ownUserId (self-reset) → 400
    - Test GET /api/admin/bans with owner token → 200, returns list
    - Test GET /api/admin/bans with non-owner token → 403
    - Test ban then login → 401 (verifies existing ban check in auth works)
    - Test ban then register → 403 (verifies existing ban check in auth works)

- [x] Task 9: Write client-side tests (AC: 1-7)
  - [x] 9.1 Create `client/src/renderer/src/features/admin/MemberContextMenu.test.tsx`:
    - Test: context menu renders for owner role only
    - Test: no context menu for regular user
    - Test: no context menu when right-clicking self
    - Test: "Kick", "Ban", "Reset Password" items visible
    - Test: clicking each item opens correct dialog
  - [x] 9.2 Create `client/src/renderer/src/features/admin/KickConfirmDialog.test.tsx`:
    - Test: renders with username in title
    - Test: cancel closes dialog
    - Test: confirm calls kick API
    - Test: shows loading state during API call
  - [x] 9.3 Create `client/src/renderer/src/features/admin/BanConfirmDialog.test.tsx`:
    - Test: renders with username in title and warning
    - Test: cancel closes dialog
    - Test: confirm calls ban API
  - [x] 9.4 Create `client/src/renderer/src/features/admin/ResetPasswordDialog.test.tsx`:
    - Test: calls API on open and displays temp password
    - Test: copy button copies to clipboard
    - Test: done closes dialog
  - [x] 9.5 Create `client/src/renderer/src/features/admin/BannedUsersPanel.test.tsx`:
    - Test: fetches and displays banned users
    - Test: unban button calls API and removes from list
    - Test: empty state message when no bans
  - [x] 9.6 Update `client/src/renderer/src/stores/useMemberStore.test.ts`:
    - Test: removeMember removes user from list

- [x] Task 10: Final verification (AC: 1-7)
  - [x] 10.1 Run `npm test -w server` — all existing + new tests pass (157 passed, 0 failed)
  - [x] 10.2 Run `npm test -w client` — all existing + new tests pass (111 passed, 0 failed)
  - [x] 10.3 Run `npm run lint` — no lint errors across all workspaces
  - [ ] 10.4 Manual test: log in as owner, right-click member → context menu appears with Kick/Ban/Reset Password
  - [ ] 10.5 Manual test: kick a user → user is disconnected and sees notification
  - [ ] 10.6 Manual test: kicked user can rejoin via invite
  - [ ] 10.7 Manual test: ban a user → user is disconnected and sees notification
  - [ ] 10.8 Manual test: banned user cannot log in or register
  - [ ] 10.9 Manual test: unban user from Banned Users panel → user can register again
  - [ ] 10.10 Manual test: reset password → temp password displayed, user's sessions invalidated
  - [ ] 10.11 Manual test: log in as regular user → no context menu on right-click

## Dev Notes

### Critical Architecture Patterns

**Server-Side Admin Plugin (NEW):**
```
server/src/plugins/admin/
├── adminRoutes.ts        # POST kick/ban/unban/reset-password, GET bans
├── adminService.ts       # Business logic for admin actions
├── adminRoutes.test.ts   # Route integration tests
└── adminService.test.ts  # Service unit tests
```

**CRITICAL: Reuse existing infrastructure — DO NOT reinvent:**
- `sessionService.deleteUserSessions(db, userId)` — already exists, deletes all sessions for a user
- `authService.hashPassword(password)` — already exists (bcrypt cost 12)
- `requireOwner()` — already exists in `authMiddleware.ts` as a pre-handler guard
- Ban check in login/register — already implemented in `authRoutes.ts`, checks `bans` table before allowing access
- `bans` table — already defined in `server/src/db/schema.ts` with `id`, `user_id`, `banned_by`, `created_at` columns + index on `user_id`
- `presenceService.removeUser(userId)` — already exists, removes from in-memory presence map
- `GET /api/users` — already exists in `userRoutes.ts`, returns all users as `UserPublic[]`
- `useMemberStore.fetchMembers()` — already exists, fetches user list

**CRITICAL: Owner authorization pattern (same as Story 5-1):**
```typescript
// adminRoutes.ts — use requireOwner pre-handler
import { requireOwner } from '../auth/authMiddleware.js'

export default fp(async function adminRoutes(fastify) {
  // Apply requireOwner to ALL routes in this plugin
  fastify.addHook('preHandler', requireOwner)

  fastify.post('/kick/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    if (userId === request.user!.userId) {
      return reply.status(400).send({ error: { code: 'INVALID_ACTION', message: 'Cannot kick yourself' } })
    }
    // ... kick logic
  })
})
```

**CRITICAL: WebSocket notification to kicked/banned user:**
```typescript
// After kick/ban, send WS message to ONLY the affected user, then close their connection
import { getClientByUserId, removeClient } from '../../ws/wsServer.js'

const ws = getClientByUserId(userId)
if (ws) {
  ws.send(JSON.stringify({ type: WS_TYPES.USER_KICKED, payload: { userId } }))
  ws.close(4003, 'Kicked by admin')
}
```
- You MUST expose a `getClientByUserId(userId)` helper from `wsServer.ts` — the clients map is keyed by userId
- Also broadcast `presence:update` for the user going offline to all remaining clients

**CRITICAL: Cascade on ban — sessions + presence + WS connection:**
```
1. Insert ban record → bans table
2. Delete all sessions → sessions table (prevents token refresh)
3. Remove from presence → in-memory map (marks offline for other users)
4. Send user:banned WS message to user → notification
5. Close WS connection → forces disconnect
6. Broadcast presence:update offline → other clients see user leave
7. Broadcast member:removed → other clients remove from member list
```

### Client-Side Component Architecture

**New files to create:**
```
client/src/renderer/src/features/admin/
├── MemberContextMenu.tsx         # Right-click menu on member items
├── MemberContextMenu.test.tsx
├── KickConfirmDialog.tsx          # Kick confirmation
├── KickConfirmDialog.test.tsx
├── BanConfirmDialog.tsx           # Ban confirmation
├── BanConfirmDialog.test.tsx
├── ResetPasswordDialog.tsx        # Reset password + show temp password
├── ResetPasswordDialog.test.tsx
├── BannedUsersPanel.tsx           # Admin panel for managing bans
├── BannedUsersPanel.test.tsx
├── KickedNotification.tsx         # Notification shown to kicked user
└── BannedNotification.tsx         # Notification shown to banned user
```

**Modified files:**
```
client/src/renderer/src/features/members/MemberList.tsx    # Wrap MemberItem with MemberContextMenu
client/src/renderer/src/features/members/MemberItem.tsx    # May need minor adjustments for context menu wrapping
client/src/renderer/src/features/channels/ServerHeader.tsx # Add "Banned Users" dropdown item
client/src/renderer/src/stores/useMemberStore.ts           # Add removeMember action
client/src/renderer/src/services/wsClient.ts               # Register user:kicked, user:banned, member:removed handlers
shared/src/ws-messages.ts                                   # Add user:kicked, user:banned, member:removed types + payloads
shared/src/index.ts                                         # Export new types
server/src/app.ts                                           # Register admin plugin
server/src/ws/wsServer.ts                                   # Expose getClientByUserId helper
```

### Existing Components to Reuse

**Radix UI wrappers (already in `client/src/renderer/src/components/`):**
- `ContextMenu.tsx` — use for MemberContextMenu (same pattern as ChannelContextMenu from 5-1)
- `Modal.tsx` — Radix Dialog wrapper for all confirmation dialogs
- `Button.tsx` — primary, secondary, danger button variants

**Stores:**
- `useAuthStore` — read `user.role` for owner check, `logout()` for kicked/banned users
- `useMemberStore` — `members` array, `fetchMembers()`, add `removeMember()`
- `usePresenceStore` — online/offline status for member list

**Services:**
- `apiClient` — `apiRequest<T>(path, options)` for admin API calls
- `wsClient` — `on(type, callback)` for registering WS handlers

### UX Requirements Summary

**Context Menu on MemberItem (admin only):**
- Right-click member → Radix ContextMenu
- Items: "Kick" (normal), separator, "Ban" (`error` color #f23f43), separator, "Reset Password" (normal)
- Never show context menu for self (the owner)
- Regular users: no context menu rendered at all
- `bg-floating` (#161310) background, 8px radius, min-width 180px

**Kick Confirmation (Radix Dialog):**
- Title: "Kick {username}?"
- Description: "They will be removed from the server but can rejoin with a new invite."
- Buttons: "Cancel" (secondary) + "Kick" (danger)
- Loading on confirm button during API call

**Ban Confirmation (Radix Dialog):**
- Title: "Ban {username}?"
- Description: "They will be permanently removed and cannot log in or create new accounts."
- Buttons: "Cancel" (secondary) + "Ban" (danger)
- Loading on confirm button during API call

**Reset Password (Radix Dialog — no confirmation needed, non-destructive):**
- Title: "Reset Password for {username}"
- Immediately calls API on open, shows loading, then displays temp password
- Shows temporary password with "Copy" button
- Description: "Share this temporary password with {username} directly."
- Buttons: "Copy Password" (primary) + "Done" (secondary)

**Banned Users Panel (accessed from server dropdown):**
- List of banned users with username and ban date
- "Unban" button on each entry
- Empty state: "No banned users"

**Kicked/Banned User Notification:**
- Non-dismissible modal (must click OK)
- Kicked: "You've been kicked — The server owner has removed you. You can rejoin with a new invite."
- Banned: "You've been banned — You cannot log in or create new accounts."
- OK button triggers logout + redirect to login

### WebSocket Message Types

**Add to `shared/src/ws-messages.ts`:**
```typescript
export interface UserKickedPayload {
  userId: string
}

export interface UserBannedPayload {
  userId: string
}

export interface MemberRemovedPayload {
  userId: string
}

// Add to WS_TYPES
export const WS_TYPES = {
  // ... existing types
  USER_KICKED: 'user:kicked',
  USER_BANNED: 'user:banned',
  MEMBER_REMOVED: 'member:removed',
} as const
```

**Note:** `USER_UPDATE` already exists in WS_TYPES — the new types are specific admin action events, not generic updates.

### API Response Formats

**POST /api/admin/kick/:userId** (204): No body

**POST /api/admin/ban/:userId** (204): No body

**POST /api/admin/unban/:userId** (204): No body

**POST /api/admin/reset-password/:userId** (200):
```json
{
  "data": {
    "temporaryPassword": "aB3dEf7gHiJkLmNo"
  }
}
```

**GET /api/admin/bans** (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "username": "banneduser",
      "bannedBy": "uuid",
      "createdAt": "2026-02-24T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Error responses (all admin routes):**
```json
{ "error": { "code": "FORBIDDEN", "message": "Only the server owner can perform this action" } }
{ "error": { "code": "NOT_FOUND", "message": "User not found" } }
{ "error": { "code": "INVALID_ACTION", "message": "Cannot perform this action on yourself" } }
```

### ESM Import Patterns

**Server-side (requires .js extensions):**
```typescript
import { bans, users, sessions } from '../db/schema.js'
import { deleteUserSessions } from '../auth/sessionService.js'
import { hashPassword } from '../auth/authService.js'
import { requireOwner } from '../auth/authMiddleware.js'
import { getClientByUserId } from '../../ws/wsServer.js'
import { removeUser as removePresence } from '../presence/presenceService.js'
```

**Client-side (no .js extension):**
```typescript
import { useAuthStore } from '../stores/useAuthStore'
import { useMemberStore } from '../stores/useMemberStore'
import { apiRequest } from '../services/apiClient'
```

### Anti-Patterns to Avoid

- **NEVER** render admin context menu for regular users — completely absent from DOM
- **NEVER** render admin context menu for self (the owner targeting themselves)
- **NEVER** allow owner to kick/ban/reset-password themselves — validate server-side AND hide client-side
- **NEVER** broadcast kick/ban notification to ALL clients — send only to the affected user
- **NEVER** skip session invalidation on kick/ban/password-reset — must delete ALL sessions
- **NEVER** create a new auth middleware for admin — reuse `requireOwner()` from `authMiddleware.ts`
- **NEVER** create a new sessions deletion function — reuse `deleteUserSessions()` from `sessionService.ts`
- **NEVER** create a new password hashing function — reuse `hashPassword()` from `authService.ts`
- **NEVER** skip the presence removal on kick/ban — user must appear offline immediately
- **NEVER** use `console.log` on the server — use `fastify.log` (Pino)
- **NEVER** create API responses without the `{ data }` or `{ error }` wrapper envelope
- **NEVER** import Zustand stores inside other stores
- **NEVER** grey out admin controls for regular users — hide them completely
- **NEVER** allow kicked/banned notification to be dismissed without clicking OK — force acknowledgment

### Deferred / Not In Scope

- **User profile editing:** Not in AC. Users cannot change their own username or avatar
- **DM system:** Not in this story. Member click shows profile popover (future feature)
- **Role management beyond owner/user:** Two-role system only (owner/user)
- **Audit log of admin actions:** Not required for MVP
- **Ban reasons/notes:** Not in AC, but `reason` field could be added later
- **IP-based bans:** Out of scope — bans are account-based via `bans` table
- **Bulk admin actions:** No multi-select kick/ban/unban
- **Email notifications:** No email system exists — admin shares temp password directly

### Previous Story (5-1) Intelligence

**Key patterns from Story 5-1 to follow:**
- `requireOwner()` pre-handler: used on channel create/delete routes — apply same pattern to all admin routes
- ServerHeader dropdown: already has "Create Channel" and "Invite People" items — add "Banned Users" item
- ChannelContextMenu pattern: Radix ContextMenu wrapping items, owner-only rendering — follow EXACT same pattern for MemberContextMenu
- Confirmation dialog pattern: delete channel uses Radix Dialog with Cancel + danger button — follow same for kick/ban
- WebSocket broadcast pattern: `channel:created`/`channel:deleted` broadcast to all clients — but for kick/ban, send ONLY to affected user (different pattern)
- Non-optimistic updates: channel store waits for WS broadcast — member store should similarly update via WS handler for `member:removed`

**Code review patterns from previous stories to follow:**
- Always create `Error` instances (not plain objects) when throwing
- Add `required` arrays to Fastify JSON schemas
- Extract shared utilities — don't duplicate code
- Write tests for all new components and services

### Git Intelligence

Recent commits show Story 2-1 (WebSocket) and Story 5-1 (Channel Management) were last implemented:
```
041720f code - review 2-1: update review
a1fd6c1 Implement story 2-1: WebSocket connection and real-time transport
```

The wsServer.ts module was built in story 2-1 and provides the client tracking infrastructure needed for targeted WS messages.

### Project Structure Notes

**Alignment with architecture document file map:**
- `features/admin/` — for MemberContextMenu, KickConfirmDialog, BanConfirmDialog, ResetPasswordDialog, BannedUsersPanel, KickedNotification, BannedNotification (architecture specifies `features/admin/` for user management)
- `features/members/` — existing MemberList.tsx and MemberItem.tsx, will be wrapped with admin context menu
- `plugins/admin/` — new admin plugin (architecture specifies `plugins/admin/` for admin routes)
- No new database tables needed — `bans` table already exists in schema
- No new Drizzle migrations needed — schema is already complete

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-5-server-administration-user-management.md#Story-5.2] — Acceptance criteria, user story, BDD scenarios
- [Source: _bmad-output/planning-artifacts/prd.md#FR5] — Server owner can reset any user's password
- [Source: _bmad-output/planning-artifacts/prd.md#FR28] — Server owner can view a list of all registered users
- [Source: _bmad-output/planning-artifacts/prd.md#FR29] — Server owner can kick a user from the server
- [Source: _bmad-output/planning-artifacts/prd.md#FR30] — Server owner can ban a user from the server
- [Source: _bmad-output/planning-artifacts/prd.md#FR31] — Server owner can unban a previously banned user
- [Source: _bmad-output/planning-artifacts/prd.md#FR32] — Banned users cannot log in or create new accounts
- [Source: _bmad-output/planning-artifacts/architecture.md#Backend-File-Structure] — plugins/admin/ for adminRoutes.ts and adminService.ts
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend-File-Structure] — features/admin/ for UserManagement, InvitePanel, ServerSettings
- [Source: _bmad-output/planning-artifacts/architecture.md#WebSocket-Message-Types] — user:kicked, user:banned message types
- [Source: _bmad-output/planning-artifacts/architecture.md#Data-Architecture] — bans table schema: id, user_id, banned_by, created_at
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Boundaries] — Admin routes check role === 'owner' via auth middleware
- [Source: _bmad-output/planning-artifacts/architecture.md#Session-Management] — Refresh tokens stored in SQLite for revocation (kick/ban)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-3-Admin] — Server administration flowchart, admin access pattern
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#MemberItem] — Right-click (admin only): context menu with kick/ban/reset password
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#MemberList] — Fixed 240px, online/offline sections
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Confirmation-Dialogs] — Destructive actions (kick, ban) require confirmation
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Admin-Access-Pattern] — Admin-only options not rendered for regular users
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Button-Hierarchy] — Danger button for kick/ban, only in confirmation dialogs
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Form-Patterns] — Password reset: generated password + copy button
- [Source: _bmad-output/project-context.md] — API envelope format, HTTP status codes, WS message envelope, anti-patterns
- [Source: server/src/db/schema.ts] — bans table definition, sessions table, users table
- [Source: server/src/plugins/auth/authMiddleware.ts] — requireOwner() pre-handler, request.user decoration
- [Source: server/src/plugins/auth/authService.ts] — hashPassword(), verifyPassword()
- [Source: server/src/plugins/auth/sessionService.ts] — deleteUserSessions(), createSession()
- [Source: server/src/plugins/auth/authRoutes.ts] — Existing ban check in login/register
- [Source: server/src/plugins/presence/presenceService.ts] — removeUser(), broadcastPresenceUpdate()
- [Source: server/src/ws/wsServer.ts] — WebSocket client tracking, clients Map
- [Source: shared/src/ws-messages.ts] — WsMessage interface, existing WS_TYPES
- [Source: shared/src/types.ts] — User, UserPublic, Ban, Session interfaces
- [Source: client/src/renderer/src/stores/useMemberStore.ts] — Existing member store with fetchMembers()
- [Source: client/src/renderer/src/stores/useAuthStore.ts] — User state, logout(), role access
- [Source: client/src/renderer/src/services/wsClient.ts] — WS handler registration, on(type, callback)
- [Source: client/src/renderer/src/services/apiClient.ts] — apiRequest<T>() for REST calls
- [Source: client/src/renderer/src/features/members/MemberList.tsx] — Existing member list component
- [Source: client/src/renderer/src/features/members/MemberItem.tsx] — Existing member item component
- [Source: client/src/renderer/src/features/channels/ServerHeader.tsx] — Existing server dropdown (from Story 5-1)
- [Source: client/src/renderer/src/components/] — Existing Radix UI wrappers (ContextMenu, Modal, Button)
- [Source: _bmad-output/implementation-artifacts/5-1-channel-management.md] — Channel management patterns, owner auth, WS broadcast, context menu patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed `fp()` wrapping on adminRoutes causing route registration failure with prefix. Removed `fp()` to match channelRoutes pattern — routes registered correctly without encapsulation breaking.

### Completion Notes List

- Task 1: Created adminService.ts with kickUser, banUser, unbanUser, resetPassword, getBannedUsers. Created adminRoutes.ts (without fp() wrapper) with all 5 routes + requireOwner preHandler. Registered in app.ts.
- Task 2: Added UserKickedPayload, UserBannedPayload, MemberRemovedPayload to shared/ws-messages.ts. Added WS_TYPES.USER_KICKED, USER_BANNED, MEMBER_REMOVED. Exported from shared/index.ts. WS notifications sent in admin routes — targeted to affected user only, then broadcast presence:offline + member:removed.
- Task 3: Registered user:kicked/user:banned/member:removed handlers in wsClient.ts. Created useAdminNotificationStore for kicked/banned notification state. Added removeMember to useMemberStore.
- Task 4: Created MemberContextMenu.tsx wrapping MemberItem in MemberList.tsx. Owner-only, never renders for self. Radix ContextMenu with Kick/Ban/Reset Password items.
- Task 5: Created KickConfirmDialog, BanConfirmDialog (confirmation + API call + loading state), ResetPasswordDialog (auto-calls API on open, shows temp password + copy button).
- Task 6: Created BannedUsersPanel.tsx with fetch/display/unban flow. Note: ServerHeader.tsx does not exist yet (Story 5-1 is backlog) — the "Banned Users" dropdown item integration is deferred until Story 5-1 is implemented.
- Task 7: Created KickedNotification.tsx and BannedNotification.tsx — non-dismissible modals that trigger logout on OK. Mounted in App.tsx.
- Task 8: 26 server tests (10 service + 16 routes) — all pass.
- Task 9: 24 client tests (6 MemberContextMenu + 4 KickConfirmDialog + 3 BanConfirmDialog + 3 ResetPasswordDialog + 3 BannedUsersPanel + 5 useMemberStore) — all pass.
- Task 10: 157 server tests pass, 111 client tests pass, 0 lint errors. Manual tests deferred.

### Change Log

- 2026-02-24: Implemented Story 5-2 — User Management & Administration (kick, ban, unban, reset password, context menu, dialogs, WS notifications)
- 2026-02-24: Code review — Fixed 10 issues (4 HIGH, 3 MEDIUM, 3 LOW): WS reconnect after kick/ban, double presence broadcast, missing tests, BannedUsersPanel entry point, dismiss/logout order, existing ban check, error feedback in dialogs, custom error classes, getClientByUserId helper, broadcastMemberRemoved refactor. Server: 162 tests pass (+5 new). Client: 111 tests pass. 0 lint errors.

### File List

**New files:**
- server/src/plugins/admin/adminService.ts
- server/src/plugins/admin/adminRoutes.ts
- server/src/plugins/admin/adminService.test.ts
- server/src/plugins/admin/adminRoutes.test.ts
- client/src/renderer/src/features/admin/MemberContextMenu.tsx
- client/src/renderer/src/features/admin/MemberContextMenu.test.tsx
- client/src/renderer/src/features/admin/KickConfirmDialog.tsx
- client/src/renderer/src/features/admin/KickConfirmDialog.test.tsx
- client/src/renderer/src/features/admin/BanConfirmDialog.tsx
- client/src/renderer/src/features/admin/BanConfirmDialog.test.tsx
- client/src/renderer/src/features/admin/ResetPasswordDialog.tsx
- client/src/renderer/src/features/admin/ResetPasswordDialog.test.tsx
- client/src/renderer/src/features/admin/BannedUsersPanel.tsx
- client/src/renderer/src/features/admin/BannedUsersPanel.test.tsx
- client/src/renderer/src/features/admin/KickedNotification.tsx
- client/src/renderer/src/features/admin/BannedNotification.tsx
- client/src/renderer/src/stores/useAdminNotificationStore.ts

**Modified files:**
- server/src/app.ts — registered adminRoutes plugin
- server/src/ws/wsServer.ts — added getClientByUserId/removeClientByUserId helpers, guarded close handler against double broadcast
- server/src/plugins/presence/presenceService.ts — added broadcastMemberRemoved function
- shared/src/ws-messages.ts — added UserKickedPayload, UserBannedPayload, MemberRemovedPayload, WS_TYPES entries
- shared/src/index.ts — exported new payload types
- client/src/renderer/src/App.tsx — mounted KickedNotification + BannedNotification
- client/src/renderer/src/features/members/MemberList.tsx — wrapped MemberItem with MemberContextMenu, added BannedUsersPanel entry point (owner-only)
- client/src/renderer/src/stores/useMemberStore.ts — added removeMember action
- client/src/renderer/src/stores/useMemberStore.test.ts — added removeMember test
- client/src/renderer/src/services/wsClient.ts — added user:kicked, user:banned, member:removed handlers, added 4003 close code to no-reconnect list
