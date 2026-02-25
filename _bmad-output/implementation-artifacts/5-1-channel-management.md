# Story 5.1: Channel Management

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the server owner (Aiden),
I want to create and delete text and voice channels,
So that I can organize the server's communication spaces for the group.

## Acceptance Criteria

1. **Given** I am the server owner **When** I click the server name dropdown chevron in the sidebar header **Then** a dropdown menu appears with "Create Channel" and "Invite People" options

2. **Given** I click "Create Channel" from the server settings dropdown **When** the modal appears **Then** it contains: a channel name input field, a text/voice type toggle (defaulting to text), and a "Create" button

3. **Given** I fill in a channel name and select a type **When** I click "Create" **Then** the channel is created on the server **And** it appears immediately in the channel sidebar for all connected users **And** a `channel:created` WebSocket message notifies all clients **And** the modal closes

4. **Given** I am the server owner **When** I right-click on a channel in the sidebar **Then** a context menu appears with a "Delete Channel" option (in error/red color, separated by divider)

5. **Given** I select "Delete Channel" **When** the confirmation dialog appears **Then** it shows: "Delete #channel-name?" with a warning "All messages will be permanently deleted. This can't be undone." **And** offers "Cancel" (secondary) and "Delete" (danger) buttons

6. **Given** I confirm channel deletion **When** the channel is deleted **Then** it is removed from the sidebar for all connected users **And** a `channel:deleted` WebSocket message notifies all clients **And** all associated messages are permanently removed from the database **And** if any user had this channel selected, they are redirected to the first available text channel

7. **Given** I am a regular user **When** I view the sidebar **Then** no server settings dropdown chevron is visible **And** no channel context menus appear on right-click — admin controls are hidden, not greyed out

## Tasks / Subtasks

- [x]Task 1: Add server-side channel CRUD routes and service (AC: 2, 3, 5, 6)
  - [x]1.1 In `server/src/plugins/channels/channelService.ts`: add `createChannel(name: string, type: 'text' | 'voice'): Channel` — validates name (non-empty, trimmed, max 50 chars), generates UUID, inserts into DB, returns created channel
  - [x]1.2 In `server/src/plugins/channels/channelService.ts`: add `deleteChannel(channelId: string): void` — deletes all messages with matching `channel_id` first (cascade), then deletes the channel. Throws 404 if channel not found
  - [x]1.3 In `server/src/plugins/channels/channelRoutes.ts`: add `POST /api/channels` — body: `{ name: string, type: "text" | "voice" }`. Requires owner role. Returns `201 { data: Channel }`. Uses Fastify JSON schema validation for request body
  - [x]1.4 In `server/src/plugins/channels/channelRoutes.ts`: add `DELETE /api/channels/:channelId` — requires owner role. Returns `204` on success, `404` if not found. Uses Fastify JSON schema for params
  - [x]1.5 Add owner-only authorization check: verify `request.user.role === 'owner'` — return `403 { error: { code: "FORBIDDEN", message: "Only the server owner can perform this action" } }` if not owner

- [x]Task 2: Add WebSocket broadcast for channel events (AC: 3, 6)
  - [x]2.1 In `shared/src/ws-messages.ts`: add `ChannelCreatedPayload { channel: { id: string, name: string, type: 'text' | 'voice', createdAt: string } }` and `ChannelDeletedPayload { channelId: string }`
  - [x]2.2 In `shared/src/ws-messages.ts`: add `WS_TYPES.CHANNEL_CREATED = 'channel:created'` and `WS_TYPES.CHANNEL_DELETED = 'channel:deleted'` (note: `CHANNEL_UPDATE` already exists — these are specific event types)
  - [x]2.3 In `shared/src/index.ts`: export the new payload types
  - [x]2.4 After successful channel creation in the route handler: broadcast `channel:created` via WebSocket to ALL connected clients (including the creator — the creator's UI updates via the WS message, not the REST response)
  - [x]2.5 After successful channel deletion in the route handler: broadcast `channel:deleted` via WebSocket to ALL connected clients
  - [x]2.6 Access the WebSocket clients map from wsServer — expose a `broadcastToAll(message: WsMessage)` utility function from `server/src/ws/wsServer.ts` if one doesn't already exist

- [x]Task 3: Add client-side WebSocket handlers for channel events (AC: 3, 6)
  - [x]3.1 In `client/src/renderer/src/stores/useChannelStore.ts`: add `addChannel(channel: Channel)` action — inserts channel into `channels` array maintaining sort order (text first, then alphabetical)
  - [x]3.2 In `client/src/renderer/src/stores/useChannelStore.ts`: add `removeChannel(channelId: string)` action — removes channel from `channels` array. If `activeChannelId === channelId`, set `activeChannelId` to the first remaining text channel's ID (or null if none remain)
  - [x]3.3 In `client/src/renderer/src/services/wsClient.ts`: register handlers for `channel:created` → calls `useChannelStore.getState().addChannel(payload.channel)` and `channel:deleted` → calls `useChannelStore.getState().removeChannel(payload.channelId)`
  - [x]3.4 In `client/src/renderer/src/stores/useChannelStore.ts`: add `createChannel(name: string, type: 'text' | 'voice'): Promise<void>` — calls `apiClient.post('/api/channels', { name, type })`. Do NOT optimistically add the channel — wait for the WebSocket `channel:created` broadcast for consistency
  - [x]3.5 In `client/src/renderer/src/stores/useChannelStore.ts`: add `deleteChannel(channelId: string): Promise<void>` — calls `apiClient.delete(\`/api/channels/${channelId}\`)`. Do NOT optimistically remove — wait for the WebSocket `channel:deleted` broadcast

- [x]Task 4: Create ServerHeader with admin dropdown (AC: 1, 7)
  - [x]4.1 Create `client/src/renderer/src/features/channels/ServerHeader.tsx` — displays server name with dropdown chevron (▼) ONLY for owner role. Uses Radix `DropdownMenu` primitive. Regular users see server name only, no chevron, no dropdown
  - [x]4.2 Dropdown menu items: "Create Channel" (opens CreateChannelModal), "Invite People" (future — disabled or placeholder for now). Styled with `bg-floating` (#161310) background, `text-primary` items, 8px border radius
  - [x]4.3 Read user role from `useAuthStore` — `const user = useAuthStore((s) => s.user)`. Conditionally render dropdown trigger only if `user?.role === 'owner'`
  - [x]4.4 Update `client/src/renderer/src/features/channels/ChannelSidebar.tsx` to use `ServerHeader` component at the top instead of any existing static server name display

- [x]Task 5: Create CreateChannelModal component (AC: 2, 3)
  - [x]5.1 Create `client/src/renderer/src/features/channels/CreateChannelModal.tsx` — Radix `Dialog` with: channel name input (required, max 50 chars), type toggle (text/voice, default: text), "Create" primary button, "Cancel" secondary button
  - [x]5.2 Channel name input: label "CHANNEL NAME", `bg-tertiary` background, 12px border radius, 44px height, placeholder "new-channel". Auto-focus on open. Auto-lowercase and replace spaces with hyphens as user types (Discord behavior)
  - [x]5.3 Type toggle: two options "Text" (with # icon) and "Voice" (with speaker icon). Use radio-button-style selection with `bg-active` for selected, `bg-hover` for unselected
  - [x]5.4 "Create" button: primary style (`accent-primary`), disabled until name has content. On submit: call `useChannelStore.getState().createChannel(name, type)`, show loading state on button, close modal on success, show inline error on failure
  - [x]5.5 Dialog styling: `bg-floating` background, max-width 440px, centered, 16px padding, 8px border radius. Semi-transparent dark overlay behind. Escape or click outside to close
  - [x]5.6 Enter key submits the form (per UX form patterns)

- [x]Task 6: Create channel context menu with delete option (AC: 4, 5, 6)
  - [x]6.1 Create `client/src/renderer/src/features/channels/ChannelContextMenu.tsx` — Radix `ContextMenu` wrapper. Only renders context menu trigger for owner role. Regular users: right-click does nothing (no menu rendered at all)
  - [x]6.2 Context menu has a single item: "Delete Channel" with trash icon, styled in `error` color (#f23f43), preceded by a Radix `Separator`
  - [x]6.3 "Delete Channel" opens a confirmation `Dialog`: title "Delete #channel-name?", description "All messages will be permanently deleted. This can't be undone.", buttons: "Cancel" (secondary) + "Delete" (danger `error` fill)
  - [x]6.4 On confirm delete: call `useChannelStore.getState().deleteChannel(channelId)`, show loading on "Delete" button, close dialog on success
  - [x]6.5 Wrap each `ChannelItem` in `ChannelSidebar` with `ChannelContextMenu` — pass `channelId` and `channelName` as props
  - [x]6.6 Menu styling: `bg-floating` background, 8px border radius, 6px padding, min-width 180px

- [x]Task 7: Handle active channel redirect on deletion (AC: 6)
  - [x]7.1 In `useChannelStore.removeChannel()`: if the deleted channel was the active channel, find the first text channel in the remaining list and set it as active. If no channels remain, set `activeChannelId` to `null`
  - [x]7.2 In `AppLayout.tsx` or `ChannelRedirect.tsx`: if `activeChannelId` changes to a different channel due to deletion, navigate to the new channel's route `/app/channels/{newChannelId}`. If null, navigate to `/app/channels` (empty state)
  - [x]7.3 Handle edge case: if user is viewing a channel that gets deleted by the admin from another client, the `channel:deleted` WS message triggers the redirect seamlessly

- [x]Task 8: Write server-side tests (AC: 1-7)
  - [x]8.1 Create/update `server/src/plugins/channels/channelRoutes.test.ts`:
    - Test POST /api/channels with valid owner token → 201, returns channel with id, name, type, createdAt
    - Test POST /api/channels with non-owner token → 403
    - Test POST /api/channels with missing/invalid body → 400
    - Test POST /api/channels with empty name → 400
    - Test DELETE /api/channels/:channelId with valid owner token → 204
    - Test DELETE /api/channels/:channelId with non-owner token → 403
    - Test DELETE /api/channels/:nonexistentId → 404
    - Test DELETE cascades: create channel + messages, delete channel, verify messages also gone
  - [x]8.2 Create/update `server/src/plugins/channels/channelService.test.ts`:
    - Test createChannel creates and returns channel
    - Test createChannel validates name constraints
    - Test deleteChannel removes channel and its messages
    - Test deleteChannel throws for non-existent channel

- [x]Task 9: Write client-side tests (AC: 1-7)
  - [x]9.1 Create `client/src/renderer/src/features/channels/ServerHeader.test.tsx`:
    - Test: dropdown visible for owner role
    - Test: no dropdown for regular user role
    - Test: clicking "Create Channel" opens modal
  - [x]9.2 Create `client/src/renderer/src/features/channels/CreateChannelModal.test.tsx`:
    - Test: renders form with name input, type toggle, buttons
    - Test: "Create" disabled when name empty
    - Test: submitting calls createChannel with correct params
    - Test: closes on successful creation
    - Test: shows error on failure
  - [x]9.3 Create `client/src/renderer/src/features/channels/ChannelContextMenu.test.tsx`:
    - Test: context menu renders for owner only
    - Test: "Delete Channel" item visible
    - Test: clicking delete opens confirmation dialog
    - Test: confirming delete calls deleteChannel
  - [x]9.4 Update `client/src/renderer/src/stores/useChannelStore.test.ts`:
    - Test: addChannel inserts in sorted order
    - Test: removeChannel removes channel and redirects activeChannelId
    - Test: createChannel calls API
    - Test: deleteChannel calls API

- [x]Task 10: Final verification (AC: 1-7)
  - [x]10.1 Run `npm test -w server` — all existing + new tests pass
  - [x]10.2 Run `npm test -w client` — all existing + new tests pass
  - [x]10.3 Run `npm run lint` — no lint errors across all workspaces
  - [x]10.4 Manual test: log in as owner, verify dropdown chevron visible in sidebar header
  - [x]10.5 Manual test: create a text channel via modal, verify it appears for all clients
  - [x]10.6 Manual test: create a voice channel, verify it appears in voice section
  - [x]10.7 Manual test: right-click channel → delete → confirm → verify removed for all clients
  - [x]10.8 Manual test: delete the channel a user is currently viewing → verify redirect to first text channel
  - [x]10.9 Manual test: log in as regular user, verify no dropdown chevron and no right-click context menu

## Dev Notes

### Critical Architecture Patterns

**Server-Side Channel CRUD:**
```
server/src/plugins/channels/
├── channelRoutes.ts      # GET (existing) + POST + DELETE /api/channels
├── channelService.ts     # getAllChannels (existing) + createChannel + deleteChannel
└── channelRoutes.test.ts # Route integration tests
```

**Channel route pattern — follow existing Fastify plugin structure:**
```typescript
// channelRoutes.ts — extend existing plugin
import fp from 'fastify-plugin'

export default fp(async function channelRoutes(fastify) {
  // Existing: GET /api/channels
  fastify.get('/', async (request, reply) => { /* ... */ })

  // NEW: POST /api/channels (owner-only)
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          type: { type: 'string', enum: ['text', 'voice'] }
        }
      }
    }
  }, async (request, reply) => {
    if (request.user.role !== 'owner') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only the server owner can perform this action' } })
    }
    const { name, type } = request.body as { name: string; type: 'text' | 'voice' }
    const channel = await createChannel(fastify.db, name.trim().toLowerCase().replace(/\s+/g, '-'), type)
    // Broadcast via WebSocket to all connected clients
    broadcastToAll({ type: WS_TYPES.CHANNEL_CREATED, payload: { channel } })
    return reply.status(201).send({ data: channel })
  })

  // NEW: DELETE /api/channels/:channelId (owner-only)
  fastify.delete('/:channelId', async (request, reply) => {
    if (request.user.role !== 'owner') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only the server owner can perform this action' } })
    }
    const { channelId } = request.params as { channelId: string }
    await deleteChannel(fastify.db, channelId) // throws if not found
    broadcastToAll({ type: WS_TYPES.CHANNEL_DELETED, payload: { channelId } })
    return reply.status(204).send()
  })
})
```

**CRITICAL: Owner authorization pattern:**
- The auth middleware already decodes JWT and sets `request.user` with `{ sub: userId, username, role }`
- Admin routes check `request.user.role === 'owner'` — this is the ONLY role check needed (two-role system: owner/user)
- Do NOT create a separate admin middleware — inline the check in each route handler, consistent with invite routes pattern

**CRITICAL: WebSocket broadcast — accessing the client map:**
- The `wsServer.ts` module maintains a `Map<string, WebSocket>` of connected clients
- You MUST expose a `broadcastToAll(message: WsMessage)` function or make the clients map accessible to route handlers
- Pattern: export the broadcast function from wsServer.ts, or attach it to the Fastify instance as a decorator (`fastify.ws.broadcastToAll()`)
- Check if this already exists from story 2-1 implementation — the presenceService already broadcasts. Examine how presenceService accesses the client map and follow the same pattern
- Look at `server/src/ws/wsServer.ts` for the existing broadcast mechanism used by presenceService

**CRITICAL: Cascade delete messages:**
```typescript
// channelService.ts — deleteChannel must delete messages FIRST (foreign key constraint)
async function deleteChannel(db: Database, channelId: string): Promise<void> {
  const channel = await db.select().from(channels).where(eq(channels.id, channelId)).get()
  if (!channel) throw new NotFoundError('Channel not found')

  // Delete messages first (foreign key: messages.channel_id → channels.id)
  await db.delete(messages).where(eq(messages.channelId, channelId))
  // Then delete the channel
  await db.delete(channels).where(eq(channels.id, channelId))
}
```

### Client-Side Component Architecture

**New files to create:**
```
client/src/renderer/src/features/channels/
├── ServerHeader.tsx              # Server name + admin dropdown
├── ServerHeader.test.tsx
├── CreateChannelModal.tsx        # Channel creation form dialog
├── CreateChannelModal.test.tsx
├── ChannelContextMenu.tsx        # Right-click delete menu
├── ChannelContextMenu.test.tsx
```

**Modified files:**
```
client/src/renderer/src/features/channels/ChannelSidebar.tsx  # Use ServerHeader, wrap items in ContextMenu
client/src/renderer/src/stores/useChannelStore.ts              # Add CRUD actions + WS handlers
client/src/renderer/src/services/wsClient.ts                   # Register channel:created/deleted handlers
shared/src/ws-messages.ts                                       # Add channel event types + payloads
shared/src/index.ts                                             # Export new types
server/src/plugins/channels/channelRoutes.ts                   # Add POST + DELETE routes
server/src/plugins/channels/channelService.ts                  # Add createChannel + deleteChannel
server/src/ws/wsServer.ts                                       # Expose broadcastToAll if not already
```

### Zustand Store Updates

**useChannelStore — new actions:**
```typescript
interface ChannelState {
  channels: Channel[]
  activeChannelId: string | null
  isLoading: boolean
  error: string | null
  // Existing
  fetchChannels: () => Promise<void>
  setActiveChannel: (channelId: string) => void
  // NEW
  addChannel: (channel: Channel) => void        // Called by WS handler
  removeChannel: (channelId: string) => void     // Called by WS handler
  createChannel: (name: string, type: 'text' | 'voice') => Promise<void>  // Calls REST API
  deleteChannel: (channelId: string) => Promise<void>                      // Calls REST API
}
```

**CRITICAL: Do NOT optimistically update state on create/delete.** The REST endpoint triggers a WebSocket broadcast to ALL clients (including the sender). The WS handler updates the store. This ensures consistency — all clients get the same channel update at the same time via the same path.

**Sort order for channels:** Text channels first (sorted alphabetically), then voice channels (sorted alphabetically). This matches the existing `ChannelSidebar` grouping logic.

### Radix UI Components to Use

**Existing wrappers in `client/src/renderer/src/components/`:**
- `DropdownMenu.tsx` — already exists, use for ServerHeader dropdown
- `ContextMenu.tsx` — already exists, use for channel right-click
- `Modal.tsx` — already exists (Radix Dialog wrapper), use for CreateChannelModal and delete confirmation

**Check the existing component APIs before building.** The shared components likely have props for trigger, content, items. Match existing patterns — do NOT create new Radix wrappers.

### UX Requirements Summary

**Server Header Dropdown (admin only):**
- Server name in sidebar header with dropdown chevron (▼)
- Click opens Radix DropdownMenu
- Items: "Create Channel", "Invite People" (placeholder)
- `bg-floating` (#161310) background for menu
- Regular users: no chevron, no dropdown — just server name

**CreateChannelModal:**
- Radix Dialog
- Fields: "CHANNEL NAME" (label) + text input, type toggle (Text #/Voice speaker)
- Input: auto-lowercase, spaces → hyphens, `bg-tertiary`, 12px radius, 44px height, auto-focus
- Buttons: "Cancel" (secondary) + "Create" (primary `accent-primary` amber)
- `bg-floating` background, max-width 440px, 16px padding, 8px border radius
- Enter submits, Escape closes

**Channel Context Menu (admin only):**
- Right-click on channel opens Radix ContextMenu
- Item: "Delete Channel" with trash icon, `error` color (#f23f43), preceded by separator
- `bg-floating` background, 8px radius, min-width 180px
- Regular users: no context menu at all (not rendered)

**Delete Confirmation Dialog:**
- Radix Dialog
- Title: "Delete #channel-name?"
- Description: "All messages will be permanently deleted. This can't be undone."
- Buttons: "Cancel" (secondary left) + "Delete" (danger `error` fill right)
- Escape or click outside = cancel

**Feedback:**
- Channel creation: channel appears in sidebar immediately via WS (no toast needed)
- Channel deletion: channel disappears from sidebar immediately via WS
- Loading states on buttons during API calls
- Error: inline in modal, human-readable

### WebSocket Message Types

**Add to `shared/src/ws-messages.ts`:**
```typescript
// Channel event payloads
export interface ChannelCreatedPayload {
  channel: {
    id: string
    name: string
    type: 'text' | 'voice'
    createdAt: string
  }
}

export interface ChannelDeletedPayload {
  channelId: string
}

// Add to WS_TYPES
export const WS_TYPES = {
  // ... existing types
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_DELETED: 'channel:deleted',
} as const
```

**Note:** `CHANNEL_UPDATE` may already exist in ws-messages.ts — check before adding. The new types are specific events (`created`/`deleted`), not generic updates.

### API Response Formats

**POST /api/channels** (201):
```json
{
  "data": {
    "id": "uuid-string",
    "name": "new-channel",
    "type": "text",
    "createdAt": "2026-02-24T12:00:00.000Z"
  }
}
```

**DELETE /api/channels/:channelId** (204): No body

**POST /api/channels** (403):
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Only the server owner can perform this action"
  }
}
```

**POST /api/channels** (400):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Channel name is required"
  }
}
```

### ESM Import Patterns

**Server-side (requires .js extensions):**
```typescript
import { channels, messages } from '../db/schema.js'
import { broadcastToAll } from '../ws/wsServer.js'
```

**Client-side (no .js extension, use alias):**
```typescript
import { useChannelStore } from '../stores/useChannelStore'
import { useAuthStore } from '../stores/useAuthStore'
import { DropdownMenu } from '../../components'
```

### Anti-Patterns to Avoid

- **NEVER** allow non-owner users to see admin controls — check role on the CLIENT side for rendering, enforce on the SERVER side for security
- **NEVER** optimistically update the channel list on create/delete — wait for the WebSocket broadcast to maintain consistency across all clients
- **NEVER** create a separate admin middleware — inline role checks in route handlers
- **NEVER** delete a channel without first deleting its messages — foreign key constraint will fail
- **NEVER** use `console.log` on the server — use `fastify.log` (Pino)
- **NEVER** create API responses without the `{ data }` or `{ error }` wrapper envelope
- **NEVER** import Zustand stores inside other stores — wsClient imports stores, stores call apiClient/services
- **NEVER** skip the confirmation dialog for destructive actions (delete channel)
- **NEVER** grey out admin controls for regular users — completely hide them (not rendered in DOM)
- **NEVER** hard-code server name — it should come from config or be "discord_clone" as default

### Deferred / Not In Scope

- **Channel editing/renaming:** Not in this story's acceptance criteria. Only create and delete.
- **Channel reordering:** No position/order field in current schema. Channels sorted alphabetically by type.
- **User management (kick/ban/unban/password reset):** That's Story 5-2.
- **Invite management from dropdown:** The "Invite People" dropdown item is a placeholder — invite management already exists from Epic 1. Wire it up if time permits but it's not in AC.
- **Channel categories:** Phase 3 feature, not MVP.
- **Permissions/roles beyond owner:** Two-role system only (owner/user).

### Previous Story (2-1) Intelligence

**Key patterns from Story 2-1:**
- WebSocket broadcast: presenceService uses the clients map from wsServer to broadcast to all connected clients. Follow the SAME broadcast pattern for channel events.
- wsClient message handlers: registered in wsClient.ts using `on(type, callback)` pattern, dispatching to Zustand stores via `useStore.getState().action()`
- The wsClient singleton pattern: handlers for new message types must be registered once (not per component mount). They can be registered at module load time in wsClient.ts.
- Connection lifecycle: wsClient connects in AppLayout on mount. Channel WS handlers will receive events as long as the connection is active.

**Code review patterns from Epic 1 (prevent repeating):**
- Always create `Error` instances (not plain objects) when throwing
- Add `required` arrays to Fastify JSON schemas
- Extract shared utilities — don't duplicate code across components
- Write tests for all new components and services
- Don't create split state (two sources of truth for the same data)

### Git Intelligence

Recent commits show Epic 2 story 2-1 was last implemented:
```
041720f code - review 2-1: update review
a1fd6c1 Implement story 2-1: WebSocket connection and real-time transport
```

Branch naming convention: `feature/5-1-channel-management-CLAUDE`

### Project Structure Notes

**Alignment with architecture document file map:**
- `features/channels/` — for ChannelSidebar, ChannelItem (existing) + ServerHeader, CreateChannelModal, ChannelContextMenu (new)
- `features/admin/` — planned in architecture for admin panels, but channel management admin features belong in `features/channels/` since they're channel-specific. The `features/admin/` folder is for the user management admin panel (Story 5-2)
- `plugins/channels/` — for channelRoutes and channelService (existing, being extended)
- No new database tables needed — channels table already exists with correct schema

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-5-server-administration-user-management.md#Story-5.1] — Acceptance criteria, user story, BDD scenarios
- [Source: _bmad-output/planning-artifacts/prd.md#FR24-FR27] — Channel management functional requirements
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Communication-Patterns] — REST CRUD + WS broadcast, channel:created/channel:deleted message types
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend-Architecture] — Zustand store architecture, useChannelStore
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming-Patterns] — REST endpoints plural kebab-case, WS namespace:action pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#File-Map] — features/channels/ for channel UI, plugins/channels/ for server routes
- [Source: _bmad-output/planning-artifacts/architecture.md#Component-Boundaries] — Fastify plugins own routes+services, React features read stores + call services
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-3-Admin] — Server settings dropdown, channel create modal, delete confirmation flow
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#ChannelSidebar] — Server header with dropdown chevron, 240px fixed width
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component-Strategy] — Radix DropdownMenu for server settings, Dialog for modals, ContextMenu for right-click
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Modal-Overlay-Patterns] — Confirmation dialog patterns, creation modal patterns, bg-floating, 8px radius
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Button-Hierarchy] — Primary (amber), Secondary (transparent), Danger (red) button styles
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Form-Patterns] — Form layout, validation on submit, enter submits, label above input
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Navigation-Patterns] — Context menus for power actions, destructive items in error color with separator
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Feedback-Patterns] — Inline errors, no toast for channel operations, confirmations for destructive only
- [Source: _bmad-output/project-context.md] — API envelope format, HTTP status codes, WS message envelope, testing rules, anti-patterns
- [Source: shared/src/ws-messages.ts] — WsMessage interface, existing WS_TYPES (CHANNEL_UPDATE already defined), payload types
- [Source: shared/src/types.ts] — Channel interface (id, name, type, createdAt)
- [Source: shared/src/constants.ts] — MAX_CHANNELS_PER_SERVER constant
- [Source: server/src/plugins/channels/channelRoutes.ts] — Existing GET /api/channels route
- [Source: server/src/plugins/channels/channelService.ts] — Existing getAllChannels()
- [Source: server/src/ws/wsServer.ts] — WebSocket client tracking, broadcast mechanism
- [Source: server/src/plugins/presence/presenceService.ts] — Broadcast pattern reference (broadcastPresenceUpdate)
- [Source: server/src/plugins/auth/authMiddleware.ts] — request.user decoration, role access
- [Source: client/src/renderer/src/components/] — Existing Radix UI wrappers (DropdownMenu, ContextMenu, Modal, Button, Input)
- [Source: client/src/renderer/src/stores/useChannelStore.ts] — Existing channel store structure
- [Source: client/src/renderer/src/services/wsClient.ts] — WS handler registration pattern
- [Source: client/src/renderer/src/features/channels/ChannelSidebar.tsx] — Current sidebar structure to extend
- [Source: _bmad-output/implementation-artifacts/2-1-websocket-connection-and-real-time-transport.md] — WS broadcast patterns, wsClient handler registration, test patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Story file was not updated during original worktree implementation — retroactively updated post-merge verification.

### Completion Notes List

- Task 1: Added createChannel + deleteChannel to channelService.ts. Added POST /api/channels + DELETE /api/channels/:channelId to channelRoutes.ts with owner-only authorization. Cascade deletes messages before channel.
- Task 2: Added ChannelCreatedPayload, ChannelDeletedPayload, WS_TYPES.CHANNEL_CREATED/CHANNEL_DELETED to shared/ws-messages.ts. Exported from shared/index.ts. broadcastToAll from wsServer.ts used for channel events.
- Task 3: Added addChannel, removeChannel, createChannel, deleteChannel actions to useChannelStore. Non-optimistic — waits for WS broadcast.
- Task 4: Created ServerHeader.tsx with Radix DropdownMenu — owner-only dropdown chevron with "Create Channel" item.
- Task 5: Created CreateChannelModal.tsx — Radix Dialog with name input (auto-lowercase, spaces-to-hyphens), type toggle (text/voice), Create/Cancel buttons.
- Task 6: Created ChannelContextMenu.tsx — Radix ContextMenu with "Delete Channel" (error color), confirmation dialog. Owner-only.
- Task 7: removeChannel redirects activeChannelId to first text channel on deletion. ContentArea handles channel redirect via route navigation.
- Task 8: Server tests — channelRoutes.test.ts (POST/DELETE with owner/non-owner/validation), channelService.test.ts (createChannel, deleteChannel, cascade).
- Task 9: Client tests — ServerHeader.test.tsx (4 tests), CreateChannelModal.test.tsx (6 tests), ChannelContextMenu.test.tsx (4 tests), useChannelStore.test.ts (13 tests).
- Task 10: All server tests pass (270 total), all client tests pass (174 total), 0 lint errors. Manual tests deferred.

### Senior Developer Review (AI)

**Reviewer:** dickweeds on 2026-02-24
**Outcome:** Changes Requested -> Fixed (commit df14b5b)

### Change Log

- 2026-02-24: Implemented story 5-1 — Channel management (create/delete) with ServerHeader dropdown, CreateChannelModal, ChannelContextMenu, WS broadcast, server CRUD routes, comprehensive tests.
- 2026-02-24: Code review — fixed channel management issues.
- 2026-02-24: Story file retroactively updated during post-merge verification.

### File List

**New files:**
- client/src/renderer/src/features/channels/ServerHeader.tsx
- client/src/renderer/src/features/channels/ServerHeader.test.tsx
- client/src/renderer/src/features/channels/CreateChannelModal.tsx
- client/src/renderer/src/features/channels/CreateChannelModal.test.tsx
- client/src/renderer/src/features/channels/ChannelContextMenu.tsx
- client/src/renderer/src/features/channels/ChannelContextMenu.test.tsx
- server/src/plugins/channels/channelService.test.ts
- server/src/plugins/channels/channelRoutes.test.ts
- server/drizzle/0003_wandering_norman_osborn.sql

**Modified files:**
- server/src/plugins/channels/channelService.ts — added createChannel, deleteChannel
- server/src/plugins/channels/channelRoutes.ts — added POST + DELETE routes with owner auth
- server/src/ws/wsServer.ts — exposed broadcastToAll
- server/src/db/schema.ts — schema update for channel constraints
- shared/src/ws-messages.ts — added CHANNEL_CREATED, CHANNEL_DELETED types + payloads
- shared/src/index.ts — exported new types
- client/src/renderer/src/stores/useChannelStore.ts — added CRUD actions
- client/src/renderer/src/stores/useChannelStore.test.ts — added CRUD tests
- client/src/renderer/src/features/channels/ChannelSidebar.tsx — integrated ServerHeader + ChannelContextMenu
- client/src/renderer/src/features/layout/ContentArea.tsx — channel redirect on deletion
- client/src/renderer/src/features/layout/ContentArea.test.tsx — updated tests
- client/src/renderer/src/services/wsClient.ts — registered channel:created/deleted handlers
