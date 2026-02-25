# Story 1.6: Discord-Familiar App Shell & Navigation

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the app to present a Discord-familiar three-column layout with channel navigation,
so that I can immediately orient myself and navigate the platform.

## Acceptance Criteria

1. **Given** I am logged in **When** the main interface loads **Then** I see a three-column layout: channel sidebar (240px), content area (flexible), member list (240px) **And** the layout uses the warm earthy color palette from the UX spec
2. **Given** the channel sidebar is visible **When** I look at the sidebar **Then** I see the server name header at the top **And** text channels listed with # prefix **And** voice channels listed with a speaker icon **And** my user panel at the bottom showing avatar, username, and settings gear
3. **Given** the member list is visible **When** I look at the right column **Then** online members are grouped under "ONLINE — {count}" **And** offline members are grouped under "OFFLINE — {count}" with dimmed opacity
4. **Given** I click a text channel in the sidebar **When** the channel is selected **Then** the content area updates to show that channel **And** the channel item displays the active/selected state
5. **Given** the window is narrower than 1000px **When** the layout adapts **Then** the member list auto-collapses **And** a toggle button appears to show/hide the member list
6. **Given** the Electron window configuration **When** the app launches **Then** the minimum window size is enforced at 960x540
7. **Given** the app layout **When** I inspect the HTML structure **Then** the sidebar uses semantic `<nav>`, content uses `<main>`, member list uses `<aside>` **And** all interactive elements have visible focus rings for keyboard navigation

## Tasks / Subtasks

- [x] Task 1: Install lucide-react icon library (AC: 2)
  - [x] 1.1 Install `lucide-react` in client workspace: `npm install lucide-react -w client`
  - [x] 1.2 Verify icons render in Electron renderer (import `Hash`, `Volume2`, `Settings`, `ChevronDown`, `Users`, `UserCircle`)

- [x] Task 2: Create GET /api/channels endpoint (AC: 1, 2, 4)
  - [x] 2.1 Create `server/src/plugins/channels/channelRoutes.ts` — Fastify plugin with `GET /api/channels` route
  - [x] 2.2 Create `server/src/plugins/channels/channelService.ts` — `getAllChannels()` function querying channels table via Drizzle
  - [x] 2.3 Response format: `{ data: Channel[], count: number }` with Channel mapped to camelCase (`id`, `name`, `type`, `createdAt`)
  - [x] 2.4 Register channels plugin in `server/src/app.ts` with prefix `/api/channels`
  - [x] 2.5 Route requires auth middleware (authenticated users only)
  - [x] 2.6 Create `server/src/plugins/channels/channelRoutes.test.ts` — test 200 response with seeded channels, test 401 without auth

- [x] Task 3: Create GET /api/users endpoint for member list (AC: 3)
  - [x] 3.1 Create `server/src/plugins/users/userRoutes.ts` — Fastify plugin with `GET /api/users` route
  - [x] 3.2 Create `server/src/plugins/users/userService.ts` — `getAllUsers()` function querying users table, selecting ONLY safe fields: `id`, `username`, `role`, `createdAt` (NEVER password_hash, public_key, or encrypted_group_key)
  - [x] 3.3 Response format: `{ data: UserPublic[], count: number }` — add `UserPublic` type to `shared/src/types.ts` with `{ id, username, role, createdAt }`
  - [x] 3.4 Register users plugin in `server/src/app.ts` with prefix `/api/users`
  - [x] 3.5 Route requires auth middleware
  - [x] 3.6 Create `server/src/plugins/users/userRoutes.test.ts` — test response excludes sensitive fields, test 401 without auth

- [x] Task 4: Create Zustand stores for channels and UI state (AC: 1, 2, 3, 4, 5)
  - [x] 4.1 Create `client/src/renderer/src/stores/useChannelStore.ts` following useAuthStore pattern:
    - State: `{ channels: Channel[], activeChannelId: string | null, isLoading: boolean, error: string | null }`
    - Actions: `fetchChannels()`, `setActiveChannel(channelId: string)`, `clearError()`
    - `fetchChannels()` calls `GET /api/channels` via apiClient, sorts by type (text first) then name
  - [x] 4.2 Create `client/src/renderer/src/stores/useMemberStore.ts`:
    - State: `{ members: UserPublic[], isLoading: boolean, error: string | null }`
    - Actions: `fetchMembers()`, `clearError()`
    - `fetchMembers()` calls `GET /api/users` via apiClient
  - [x] 4.3 Create `client/src/renderer/src/stores/useUIStore.ts`:
    - State: `{ isMemberListVisible: boolean }`
    - Actions: `toggleMemberList()`, `setMemberListVisible(visible: boolean)`
    - Initialize `isMemberListVisible: true`

- [x] Task 5: Create AppLayout three-column container (AC: 1, 5, 7)
  - [x] 5.1 Create `client/src/renderer/src/features/layout/AppLayout.tsx`
  - [x] 5.2 Structure: `<div class="flex h-screen">` containing `<nav>` (sidebar 240px) + `<main>` (flex-1) + `<aside>` (member list 240px)
  - [x] 5.3 Sidebar: `w-[240px] flex-shrink-0 bg-bg-secondary` — fixed width, never collapses
  - [x] 5.4 Content area: `flex-1 bg-bg-primary` — fills remaining space
  - [x] 5.5 Member list: `w-[240px] flex-shrink-0 bg-bg-secondary` — conditionally rendered based on `useUIStore.isMemberListVisible`
  - [x] 5.6 Add window resize listener: if window width < 1000px, auto-collapse member list via `useUIStore.setMemberListVisible(false)`; if >= 1000px and was auto-collapsed, restore visibility
  - [x] 5.7 On mount: call `useChannelStore.fetchChannels()` and `useMemberStore.fetchMembers()`
  - [x] 5.8 Overflow hidden on root container to prevent body scroll

- [x] Task 6: Create ChannelSidebar component (AC: 2)
  - [x] 6.1 Create `client/src/renderer/src/features/channels/ChannelSidebar.tsx`
  - [x] 6.2 Top section: ServerHeader with server name (hardcoded "discord_clone" or fetched from config) and chevron-down icon
  - [x] 6.3 Middle section: Scrollable channel list using `<ScrollArea>` Radix component
  - [x] 6.4 Group channels by type: "TEXT CHANNELS" header with text channels below, "VOICE CHANNELS" header with voice channels below
  - [x] 6.5 Category headers: `text-text-muted text-xs font-semibold uppercase tracking-wide px-2 py-1.5`
  - [x] 6.6 Bottom section: UserPanel (fixed, not scrollable) — positioned with `mt-auto` or absolute bottom
  - [x] 6.7 Full height flex column: header + scrollable channels + fixed user panel

- [x] Task 7: Create ChannelItem component (AC: 2, 4)
  - [x] 7.1 Create `client/src/renderer/src/features/channels/ChannelItem.tsx`
  - [x] 7.2 Props: `channel: Channel`, `isActive: boolean`, `onClick: () => void`
  - [x] 7.3 Text channel: `<Hash size={18} />` icon (lucide-react) + channel name
  - [x] 7.4 Voice channel: `<Volume2 size={18} />` icon (lucide-react) + channel name
  - [x] 7.5 Layout: `h-8 px-2 mx-2 rounded-md flex items-center gap-1.5 cursor-pointer`
  - [x] 7.6 Default state: `text-text-secondary hover:bg-bg-hover hover:text-text-primary`
  - [x] 7.7 Active state: `bg-bg-active text-text-primary` — applied when `isActive` is true
  - [x] 7.8 Transition: `transition-colors duration-150`
  - [x] 7.9 Click handler: calls `useChannelStore.setActiveChannel(channel.id)` and navigates to channel route
  - [x] 7.10 Render as `<button>` element for keyboard accessibility

- [x] Task 8: Create UserPanel component (AC: 2)
  - [x] 8.1 Create `client/src/renderer/src/features/layout/UserPanel.tsx`
  - [x] 8.2 Read current user from `useAuthStore.user`
  - [x] 8.3 Layout: `h-[52px] px-2 flex items-center bg-bg-tertiary border-t border-border-default`
  - [x] 8.4 Avatar: 32px circle with user initial, colored background (derive color from username hash), `rounded-full`
  - [x] 8.5 Green status dot: 10px circle, positioned bottom-right of avatar using `absolute` positioning
  - [x] 8.6 Username text: `text-sm font-medium text-text-primary truncate` — truncate if too long
  - [x] 8.7 Settings gear: `<Settings size={18} />` icon button on the right, `ml-auto`, `text-text-secondary hover:text-text-primary`
  - [x] 8.8 Settings button: `<button>` with `aria-label="User settings"` — click handler is a no-op placeholder for now

- [x] Task 9: Create ContentArea placeholder (AC: 1, 4, 5)
  - [x] 9.1 Create `client/src/renderer/src/features/layout/ContentArea.tsx`
  - [x] 9.2 Top header bar: `h-12 px-4 flex items-center border-b border-border-default bg-bg-primary shadow-sm`
  - [x] 9.3 Header shows: `<Hash size={20} />` + active channel name (`text-text-primary font-semibold`)
  - [x] 9.4 Header right side: member list toggle button — `<Users size={20} />` icon button, toggles `useUIStore.toggleMemberList()`
  - [x] 9.5 Toggle button visual state: `text-text-primary` when member list visible, `text-text-muted` when hidden
  - [x] 9.6 Content body: centered welcome message — "Welcome to #{channelName}" as `text-2xl font-bold text-text-primary` + "This is the start of the #{channelName} channel." as `text-text-secondary mt-2`
  - [x] 9.7 If no channel selected: show "Select a channel" placeholder
  - [x] 9.8 Flex column layout: header (fixed) + body (flex-1, overflow-y-auto)

- [x] Task 10: Create MemberList and MemberItem components (AC: 3)
  - [x] 10.1 Create `client/src/renderer/src/features/members/MemberList.tsx`
  - [x] 10.2 Read members from `useMemberStore.members` and current user from `useAuthStore.user`
  - [x] 10.3 Determine online/offline: current logged-in user is "online", all others are "offline" (real presence requires WebSocket — Epic 2)
  - [x] 10.4 Group header "ONLINE — {count}": `text-text-muted text-xs font-semibold uppercase tracking-wide px-4 py-1.5`
  - [x] 10.5 Group header "OFFLINE — {count}": same styling
  - [x] 10.6 Wrap list in `<ScrollArea>` for scrollability
  - [x] 10.7 Show loading skeleton while `useMemberStore.isLoading` is true
  - [x] 10.8 Create `client/src/renderer/src/features/members/MemberItem.tsx`
  - [x] 10.9 Props: `member: UserPublic`, `isOnline: boolean`
  - [x] 10.10 Layout: `h-[42px] px-4 flex items-center gap-2 rounded-md hover:bg-bg-hover mx-2 cursor-default`
  - [x] 10.11 Avatar: 32px circle with user initial, `bg-bg-active rounded-full flex items-center justify-center text-sm font-medium`
  - [x] 10.12 Status dot: 10px circle, absolute bottom-right of avatar — `bg-status-online` or `bg-status-offline`
  - [x] 10.13 Username: `text-sm` — `text-text-primary` if online, `text-text-muted opacity-60` if offline
  - [x] 10.14 Role badge for owner: small "OWNER" text badge next to name, `text-xs text-accent-primary`

- [x] Task 11: Update App.tsx routing and AuthGuard integration (AC: 1, 4)
  - [x] 11.1 Update `client/src/renderer/src/App.tsx` — replace the current `/app` catch-all with nested routes
  - [x] 11.2 Route structure: `/app` → `AppLayout` (parent), `/app/channels/:channelId` → channel view
  - [x] 11.3 Default redirect: when navigating to `/app`, auto-redirect to first text channel (from useChannelStore)
  - [x] 11.4 Keep `AuthGuard` wrapping the `/app` routes
  - [x] 11.5 Use React Router `<Outlet />` in AppLayout for nested route content (content area renders the selected channel view)
  - [x] 11.6 Update channel selection: clicking a channel navigates via `useNavigate()` to `/app/channels/:channelId`
  - [x] 11.7 On route load: sync `channelId` param to `useChannelStore.activeChannelId`

- [x] Task 12: Implement responsive member list collapse (AC: 5)
  - [x] 12.1 In `AppLayout.tsx`: add `useEffect` with `window.addEventListener('resize', handleResize)`
  - [x] 12.2 `handleResize`: if `window.innerWidth < 1000`, call `useUIStore.setMemberListVisible(false)`
  - [x] 12.3 Track `wasAutoCollapsed` ref to distinguish user toggle from auto-collapse — don't force-show member list on resize up if user manually closed it
  - [x] 12.4 Member list render: `{isMemberListVisible && <aside>...</aside>}` — conditional render, not CSS hidden
  - [x] 12.5 Toggle button in ContentArea header: always visible, calls `useUIStore.toggleMemberList()`
  - [x] 12.6 Clean up resize listener on unmount

- [x] Task 13: Add loading skeletons (AC: 1, 2, 3)
  - [x] 13.1 ChannelSidebar loading state: while `useChannelStore.isLoading`, show 6 skeleton channel items (gray bars, `animate-pulse`, 32px height, matching channel item layout)
  - [x] 13.2 MemberList loading state: while `useMemberStore.isLoading`, show 8 skeleton member items (avatar circle + text bar, `animate-pulse`)
  - [x] 13.3 No full-screen spinners — per project rules, skeleton placeholders only

- [x] Task 14: Verify accessibility and semantic HTML (AC: 7)
  - [x] 14.1 Sidebar: wrap in `<nav aria-label="Channel navigation">`
  - [x] 14.2 Content area: wrap in `<main aria-label="Channel content">`
  - [x] 14.3 Member list: wrap in `<aside aria-label="Member list">`
  - [x] 14.4 All channel items: render as `<button>` with `aria-current="page"` when active
  - [x] 14.5 All icon-only buttons: add `aria-label` — "User settings", "Toggle member list", etc.
  - [x] 14.6 Focus ring: ensure Tailwind `focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0 focus-visible:outline-none` on all interactive elements
  - [x] 14.7 Tab order: sidebar channels → content header buttons → member list items (natural DOM order)
  - [x] 14.8 Category headers: use `role="heading" aria-level="2"` or `<h2>` elements

- [x] Task 15: Write client-side tests (AC: 1-7)
  - [x] 15.1 Create `client/src/renderer/src/stores/useChannelStore.test.ts` — test fetchChannels populates state, setActiveChannel updates activeChannelId, error handling
  - [x] 15.2 Create `client/src/renderer/src/stores/useMemberStore.test.ts` — test fetchMembers populates state, error handling
  - [x] 15.3 Create `client/src/renderer/src/stores/useUIStore.test.ts` — test toggleMemberList, setMemberListVisible
  - [x] 15.4 Create `client/src/renderer/src/features/channels/ChannelSidebar.test.tsx` — test renders server header, channel list, user panel; test channel click calls setActiveChannel
  - [x] 15.5 Create `client/src/renderer/src/features/channels/ChannelItem.test.tsx` — test renders # for text, speaker for voice, active state styling
  - [x] 15.6 Create `client/src/renderer/src/features/members/MemberList.test.tsx` — test online/offline grouping, loading skeleton
  - [x] 15.7 Create `client/src/renderer/src/features/layout/AppLayout.test.tsx` — test three-column structure, semantic HTML elements (nav, main, aside)

- [ ] Task 16: Final verification (AC: 1-7)
  - [x] 16.1 Run `npm test -w server` — all existing + new tests pass
  - [x] 16.2 Run `npm test -w client` — all existing + new tests pass
  - [x] 16.3 Run `npm run lint` — no lint errors across all workspaces
  - [ ] 16.4 Visual check: launch app, verify three-column layout renders with correct colors
  - [ ] 16.5 Visual check: click channels, verify active state and content area updates
  - [ ] 16.6 Visual check: resize window below 1000px, verify member list collapses and toggle works
  - [ ] 16.7 Keyboard check: tab through sidebar channels, verify focus rings visible
  - [ ] 16.8 Verify semantic HTML: `<nav>`, `<main>`, `<aside>` in DOM inspector

## Dev Notes

### Critical Architecture Patterns

**Component Organization (feature-based):**
```
client/src/renderer/src/
├── features/
│   ├── channels/          # ChannelSidebar, ChannelItem, ServerHeader
│   ├── members/           # MemberList, MemberItem
│   └── layout/            # AppLayout, ContentArea, UserPanel
├── stores/
│   ├── useChannelStore.ts # Channel list + active channel
│   ├── useMemberStore.ts  # Server members
│   └── useUIStore.ts      # UI state (member list visibility)
└── components/            # Shared primitives (Button, Input, ScrollArea — already exist)
```

**Zustand Store Pattern (follow useAuthStore exactly):**
```typescript
interface ChannelState {
  channels: Channel[]
  activeChannelId: string | null
  isLoading: boolean
  error: string | null
  fetchChannels: () => Promise<void>
  setActiveChannel: (channelId: string) => void
  clearError: () => void
}

export const useChannelStore = create<ChannelState>((set) => ({
  channels: [],
  activeChannelId: null,
  isLoading: false,
  error: null,
  fetchChannels: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<ApiList<Channel>>('/api/channels')
      set({ channels: response.data, isLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
  clearError: () => set({ error: null }),
}))
```

**Stores are independent — no cross-store imports.** Components read from multiple stores directly.

### Server-Side Endpoint Patterns

**Follow existing auth plugin structure exactly:**

```typescript
// server/src/plugins/channels/channelRoutes.ts
import type { FastifyInstance } from 'fastify'
import { getAllChannels } from './channelService.js'

export default async function channelRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { /* Channel schema */ } },
            count: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const channels = await getAllChannels(fastify.db)
    return reply.send({ data: channels, count: channels.length })
  })
}
```

**Register in app.ts:**
```typescript
import channelRoutes from './plugins/channels/channelRoutes.js'
import userRoutes from './plugins/users/userRoutes.js'

// Inside plugin registration (after auth plugin):
fastify.register(channelRoutes, { prefix: '/api/channels' })
fastify.register(userRoutes, { prefix: '/api/users' })
```

**Auth middleware:** All new routes require authentication. The existing `authenticate` preHandler hook is already registered globally for `/api/*` routes except the explicit exclusions (login, register, invite validate). New routes get auth automatically.

**Response envelope:** Always `{ data: T }` for success, `{ data: T[], count: N }` for lists, `{ error: { code, message } }` for errors.

### Color Theme Reference (Already Configured in globals.css)

| Token | Tailwind Class | Usage in This Story |
|-------|---------------|-------------------|
| `#221e1a` | `bg-bg-primary` | Content area background |
| `#2a2520` | `bg-bg-secondary` | Sidebar + member list background |
| `#1c1915` | `bg-bg-tertiary` | User panel background, input fields |
| `#362f28` | `bg-bg-hover` | Channel/member hover state |
| `#3d342b` | `bg-bg-active` | Active/selected channel, avatar backgrounds |
| `#f0e6d9` | `text-text-primary` | Primary text, active channel name |
| `#a89882` | `text-text-secondary` | Channel names (default), member names |
| `#6d5f4e` | `text-text-muted` | Category headers, timestamps, offline text |
| `#23a55a` | `bg-status-online` | Online status dot |
| `#80848e` | `bg-status-offline` | Offline status dot |

**Border:** Use `border-[#3d3630]` — check if `border-default` is defined in globals.css. If not, add `--color-border-default: #3d3630` to the `@theme` block.

### Layout Dimensions

| Region | Width | CSS |
|--------|-------|-----|
| Channel sidebar | 240px fixed | `w-[240px] flex-shrink-0` |
| Content area | Flexible | `flex-1 min-w-0` (`min-w-0` prevents flex overflow) |
| Member list | 240px fixed | `w-[240px] flex-shrink-0` |
| Content header | 48px height | `h-12` |
| User panel | 52px height | `h-[52px]` |
| Channel item | 32px height | `h-8` |
| Member item | 42px height | `h-[42px]` |

### Responsive Behavior

```typescript
// In AppLayout.tsx:
const MEMBER_LIST_BREAKPOINT = 1000

useEffect(() => {
  const wasAutoCollapsed = { current: false }

  const handleResize = () => {
    if (window.innerWidth < MEMBER_LIST_BREAKPOINT) {
      if (useUIStore.getState().isMemberListVisible) {
        wasAutoCollapsed.current = true
        useUIStore.getState().setMemberListVisible(false)
      }
    } else if (wasAutoCollapsed.current) {
      wasAutoCollapsed.current = false
      useUIStore.getState().setMemberListVisible(true)
    }
  }

  window.addEventListener('resize', handleResize)
  handleResize() // Check on mount
  return () => window.removeEventListener('resize', handleResize)
}, [])
```

### Avatar Color Generation

Derive consistent avatar background color from username:
```typescript
const AVATAR_COLORS = [
  '#c97b35', '#7b935e', '#5e8493', '#935e7b', '#93855e',
  '#5e7b93', '#8b6e4e', '#6e8b4e', '#4e6e8b', '#8b4e6e'
]

function getAvatarColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
```

### UserPublic Type (Add to shared/src/types.ts)

```typescript
/** Safe user representation for member lists — excludes sensitive fields */
export interface UserPublic {
  id: string
  username: string
  role: 'owner' | 'user'
  createdAt: string
}
```

**NEVER expose:** `passwordHash`, `publicKey`, `encryptedGroupKey` in the members endpoint.

### Routing Structure

```typescript
// App.tsx updated routes:
<Route path="/app" element={<AuthGuard><AppLayout /></AuthGuard>}>
  <Route index element={<Navigate to="channels" replace />} />
  <Route path="channels/:channelId" element={<ContentArea />} />
  <Route path="channels" element={<ChannelRedirect />} />
</Route>

// ChannelRedirect: reads first text channel from store, navigates to it
// This handles the initial load case where user lands on /app
```

### Presence Handling (Simplified for This Story)

WebSocket presence is not available until Epic 2. For now:
- Current logged-in user = "online"
- All other users = "offline"
- The MemberList UI is already built to support grouping — when WebSocket presence arrives in Epic 2, just update the data source

```typescript
// In MemberList.tsx:
const currentUser = useAuthStore((s) => s.user)
const members = useMemberStore((s) => s.members)

const onlineMembers = members.filter(m => m.id === currentUser?.id)
const offlineMembers = members.filter(m => m.id !== currentUser?.id)
```

### Existing Components to Reuse

| Component | Location | Usage |
|-----------|----------|-------|
| `ScrollArea` | `components/ScrollArea.tsx` | Channel list scrolling, member list scrolling |
| `DropdownMenu` | `components/DropdownMenu.tsx` | Server header menu (future) |
| `Tooltip` | `components/Tooltip.tsx` | Channel name tooltips for truncated names |
| `Button` | `components/Button.tsx` | Settings button, toggle button (use ghost variant) |

**DO NOT recreate** any of these. Import from `@renderer/components`.

### Electron Window Config (AC: 6 — Already Satisfied)

The Electron main process at `client/src/main/index.ts` already has `minWidth: 960, minHeight: 540`. No changes needed for this AC.

### Testing Patterns

**Store tests** (follow existing patterns):
```typescript
// useChannelStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelStore } from './useChannelStore'

// Mock apiClient
vi.mock('../services/apiClient', () => ({
  apiClient: {
    get: vi.fn()
  }
}))

beforeEach(() => {
  useChannelStore.setState({
    channels: [],
    activeChannelId: null,
    isLoading: false,
    error: null
  })
})
```

**Component tests** (React Testing Library):
```typescript
// ChannelSidebar.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChannelSidebar } from './ChannelSidebar'

// Mock stores
vi.mock('../../stores/useChannelStore')
vi.mock('../../stores/useAuthStore')
```

**Server route tests** (Fastify inject):
```typescript
// channelRoutes.test.ts
import { setupApp, seedOwner, seedUserWithSession } from '../../test/helpers.js'

describe('GET /api/channels', () => {
  it('returns channel list for authenticated user', async () => {
    const app = await setupApp()
    const { accessToken } = await seedUserWithSession(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/channels',
      headers: { authorization: `Bearer ${accessToken}` }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body.data).toBeInstanceOf(Array)
    expect(body.count).toBeGreaterThan(0)
    // Default seeded channels: #general (text), Gaming (voice)
    expect(body.data.some((c: any) => c.name === 'general' && c.type === 'text')).toBe(true)
  })
})
```

### Project Structure Notes

**New files to create:**
```
server/src/plugins/channels/
  channelRoutes.ts              # GET /api/channels endpoint
  channelService.ts             # Channel query logic
  channelRoutes.test.ts         # Route tests

server/src/plugins/users/
  userRoutes.ts                 # GET /api/users endpoint
  userService.ts                # User query logic (safe fields only)
  userRoutes.test.ts            # Route tests

client/src/renderer/src/features/channels/
  ChannelSidebar.tsx            # Full sidebar component
  ChannelSidebar.test.tsx       # Sidebar tests
  ChannelItem.tsx               # Individual channel item
  ChannelItem.test.tsx          # Channel item tests
  ServerHeader.tsx              # Server name header

client/src/renderer/src/features/members/
  MemberList.tsx                # Right column member list
  MemberList.test.tsx           # Member list tests
  MemberItem.tsx                # Individual member entry

client/src/renderer/src/features/layout/
  AppLayout.tsx                 # Three-column container
  AppLayout.test.tsx            # Layout tests
  ContentArea.tsx               # Center content area
  UserPanel.tsx                 # Bottom of sidebar user info

client/src/renderer/src/stores/
  useChannelStore.ts            # Channel state
  useChannelStore.test.ts       # Store tests
  useMemberStore.ts             # Member state
  useMemberStore.test.ts        # Store tests
  useUIStore.ts                 # UI state (member list visibility)
  useUIStore.test.ts            # Store tests
```

**Modified files:**
```
server/src/app.ts                           # Register channels + users plugins
shared/src/types.ts                         # Add UserPublic type
client/src/renderer/src/App.tsx             # Update routing for channel views
client/src/renderer/src/globals.css         # Add border-default if missing
```

### ESM Import Rules (From Previous Stories)

- All local imports MUST use `.js` extensions on the server: `import { getAllChannels } from './channelService.js'`
- Client-side imports do NOT use `.js` extensions (Vite handles resolution)
- Use `@renderer/` path alias for client imports: `import { Button } from '@renderer/components'`

### Deferred / Not In Scope

- **Real-time presence:** WebSocket presence tracking is Epic 2 (story 2-1). This story uses simplified online/offline (current user = online, others = offline).
- **Voice channel participants:** Voice joining/leaving is Epic 3. Voice channels display in the sidebar but clicking them is a no-op for now.
- **Message display:** Actual messages are Epic 2 (stories 2-2, 2-3). Content area shows a welcome placeholder.
- **Server settings dropdown:** The ServerHeader chevron is visual only — settings functionality comes in Epic 5.
- **Unread indicators:** Requires message tracking — deferred to Epic 2.
- **Channel creation/deletion:** Admin channel management is Epic 5 (story 5-1).
- **User context menu:** Right-click member for admin actions is Epic 5 (story 5-2).

### Previous Story (1-5) Intelligence

**Key patterns established across stories 1-2 through 1-5:**

- **ESM imports with .js extensions** on server-side (Fastify + tsx)
- **Fastify JSON schema validation** on all request/response bodies
- **Module-level env var validation** (fail-fast pattern)
- **Shared test helpers** in `server/src/test/helpers.ts`: `setupApp()`, `seedOwner()`, `seedRegularUser()`, `seedUserWithSession()`
- **Co-located tests** — test files next to source files
- **Pino logger only** — no `console.log` on server
- **Username normalization** — `trim().toLowerCase()`
- **Transactional DB writes** — wrap related writes in `db.transaction()`
- **safeStorage pattern** — `window.api.secureStorage.set/get/delete` (values are strings)
- **apiClient** — use `apiClient.get<T>()`, `apiClient.post<T>()` for all HTTP calls
- **vi.hoisted() env vars** — set env vars before module loads in test files
- **Response envelope** — always `{ data }` or `{ error: { code, message } }`

**Code review patterns (5-10 issues per story):** Most common are missing input validation, inconsistent response patterns, insufficient boundary tests. Write clean code following all patterns above to minimize review issues.

### Git Intelligence

Recent commits:
```
cc790a3 Fix 10 code review issues for story 1-4
db98ec0 Implement story 1-4: User Login, Logout & Session Management
72fd181 Fix 9 code review #2 issues for story 1-3
37f4aee Fix 10 code review issues for story 1-3
d1eec53 Implement story 1-3: User Registration & Invite System
```

**Pattern:** Each story → implement → code review → fixes. Aim for clean implementation to reduce review cycles.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-1-project-foundation-user-authentication.md#Story-1.6] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#Client-Architecture] — React component organization, Zustand store patterns, feature-based structure
- [Source: _bmad-output/planning-artifacts/architecture.md#Server-Architecture] — Fastify plugin structure, REST endpoint patterns
- [Source: _bmad-output/planning-artifacts/architecture.md#Database-Schema] — Channels table structure
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Three-Column-Layout] — 240px sidebars, flexible content, responsive breakpoints
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Warm-Earthy-Color-Palette] — Color tokens, bg-primary through bg-active
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Typography-and-Spacing] — Type scale, 4px spacing grid
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Channel-Sidebar] — Sidebar anatomy, channel item specs
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Member-List] — Member grouping, presence indicators
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#User-Panel] — Avatar, username, settings gear
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Responsive-Behavior] — Member list collapse at 1000px
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility] — Focus rings, ARIA labels, semantic HTML, keyboard navigation
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Loading-States] — Skeleton placeholders, no full-screen spinners
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Animations] — Transition durations, hover states, easing functions
- [Source: _bmad-output/project-context.md] — API envelope, naming conventions, testing rules, anti-patterns, Zustand patterns
- [Source: _bmad-output/implementation-artifacts/1-5-e2e-encryption-foundation.md] — Previous story patterns, ESM imports, test helpers, safeStorage bridge
- [Source: client/src/renderer/src/globals.css] — Tailwind theme configuration with all color tokens
- [Source: client/src/renderer/src/App.tsx] — Current routing structure
- [Source: client/src/renderer/src/stores/useAuthStore.ts] — Zustand store reference pattern
- [Source: client/src/renderer/src/services/apiClient.ts] — API client for HTTP calls
- [Source: client/src/renderer/src/components/] — Existing shared components (Button, Input, ScrollArea, etc.)
- [Source: shared/src/types.ts] — Channel, User type definitions
- [Source: server/src/db/schema.ts] — Database schema (channels, users tables)
- [Source: server/src/db/seed.ts] — Default channels (#general, Gaming) seeded on first startup

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References
- `npm install -w client lucide-react --no-audit --no-fund` (ran with elevated permissions)
- `npm test -w server` (107 tests passed)
- `npm test -w client` (22 tests passed)
- `npm run lint` (pass)

### Completion Notes List
- Implemented authenticated `GET /api/channels` and `GET /api/users` endpoints with list envelope responses and safe-field user projection.
- Added `UserPublic` to shared contract and exported it from shared package index.
- Built app shell UI with semantic `nav/main/aside`, three-column layout, responsive member-list collapse at 1000px, channel navigation, and focus-visible styles.
- Added channel/member/ui Zustand stores and hooked them to new API endpoints.
- Added skeleton loading states for channel/member lists and created content placeholder flow.
- Updated routing to nested `/app/channels/:channelId` with default channel redirect and route/store synchronization.
- Added server route tests and client store/component/layout tests for new behavior.
- Manual GUI validation items in Task 16.4-16.8 remain pending due non-interactive environment.

### File List
- server/src/app.ts
- server/src/plugins/channels/channelRoutes.ts
- server/src/plugins/channels/channelService.ts
- server/src/plugins/channels/channelRoutes.test.ts
- server/src/plugins/users/userRoutes.ts
- server/src/plugins/users/userService.ts
- server/src/plugins/users/userRoutes.test.ts
- shared/src/types.ts
- shared/src/index.ts
- client/package.json
- client/src/renderer/src/App.tsx
- client/src/renderer/src/globals.css
- client/src/renderer/src/stores/useChannelStore.ts
- client/src/renderer/src/stores/useMemberStore.ts
- client/src/renderer/src/stores/useUIStore.ts
- client/src/renderer/src/features/channels/ServerHeader.tsx
- client/src/renderer/src/features/channels/ChannelItem.tsx
- client/src/renderer/src/features/channels/ChannelSidebar.tsx
- client/src/renderer/src/features/members/MemberItem.tsx
- client/src/renderer/src/features/members/MemberList.tsx
- client/src/renderer/src/features/layout/AppLayout.tsx
- client/src/renderer/src/features/layout/ContentArea.tsx
- client/src/renderer/src/features/layout/ChannelRedirect.tsx
- client/src/renderer/src/stores/useChannelStore.test.ts
- client/src/renderer/src/stores/useMemberStore.test.ts
- client/src/renderer/src/stores/useUIStore.test.ts
- client/src/renderer/src/features/channels/ChannelItem.test.tsx
- client/src/renderer/src/features/channels/ChannelSidebar.test.tsx
- client/src/renderer/src/features/members/MemberList.test.tsx
- client/src/renderer/src/features/layout/AppLayout.test.tsx
