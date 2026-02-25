---
title: 'Wire Up Invite People Button'
slug: 'wire-up-invite-people-button'
created: '2026-02-25'
status: 'done'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18+', 'TypeScript 5.x strict', 'Zustand v5.0.x', 'Radix UI Dialog', 'Tailwind CSS', 'Vitest', 'React Testing Library']
files_to_modify: ['shared/src/types.ts', 'client/src/renderer/src/stores/useInviteStore.ts (new)', 'client/src/renderer/src/features/channels/InviteModal.tsx (new)', 'client/src/renderer/src/features/channels/ServerHeader.tsx']
code_patterns: ['Zustand create<State>() with isLoading/error/data pattern', 'apiRequest<T> generic for typed REST calls', 'Modal component: open/onOpenChange/title/children props via Radix Dialog', 'DropdownMenuItem onSelect handler → useState toggle → Modal render', 'Co-located tests: Component.test.tsx alongside Component.tsx', 'Button component: variant=primary|secondary|ghost, size=sm|md|lg']
test_patterns: ['Vitest + React Testing Library', 'Co-located: SourceFile.test.ts(x)', 'Mock apiRequest for store tests', 'render() + screen queries + userEvent for component tests']
---

# Tech-Spec: Wire Up Invite People Button

**Created:** 2026-02-25

## Overview

### Problem Statement

The "Invite People" button in the ServerHeader dropdown is a disabled placeholder. The backend invite system (Epic 1) is fully built — API endpoints, service layer, and DB schema all exist — but the frontend has zero invite infrastructure. No modal, no store, no API calls.

### Solution

Create a full invite management modal wired to the existing backend. The modal lets the server owner generate invite links, view active invites, copy links to clipboard, and revoke invites. Follow the established CreateChannelModal pattern for wiring and the project's Zustand store conventions for state management. Align the stale shared `Invite` type to match the actual backend schema.

### Scope

**In Scope:**
- Create `useInviteStore` Zustand store with generate, list, and revoke actions
- Create `InviteModal` component with generate + list + copy + revoke UI
- Wire the disabled "Invite People" dropdown item in `ServerHeader.tsx` to open the modal
- Align `shared/src/types.ts` `Invite` interface to match actual backend response
- Unit tests for store, component tests for modal

**Out of Scope:**
- Backend changes (endpoints already exist and work)
- Invite link deep linking / custom protocol handling
- Invite expiration or max-uses (not in current DB schema)
- Non-owner invite access (backend already enforces owner-only)

## Context for Development

### Codebase Patterns

- **Modal wiring:** `useState(false)` in parent → `DropdownMenuItem onSelect={() => setState(true)}` → Modal takes `open`/`onOpenChange` props (see `CreateChannelModal` pattern in `ServerHeader.tsx`)
- **Store pattern:** `create<State>((set) => ({...}))` with `isLoading: boolean`, `error: string | null`, data fields. Async actions use `set({ isLoading: true })` → `try/await apiRequest` → `set({ data, isLoading: false })` → `catch` sets error
- **API client:** `apiRequest<T>(path, options?)` — generic typed REST calls, auto-attaches auth headers, unwraps `{ data }` envelope, throws on error with `apiError.message`. Returns `undefined` for 204s
- **Component primitives:** `Modal` (Radix Dialog wrapper: `open`/`onOpenChange`/`title`/`children`), `Button` (`variant`: primary/secondary/ghost, `size`: sm/md/lg), all exported from `components/index.ts`
- **File organization:** Feature-based in `features/{domain}/`, stores in `stores/use{Domain}Store.ts`, shared types in `shared/src/types.ts`
- **Co-located tests:** `Component.test.tsx` alongside `Component.tsx`

### Files to Modify/Create

| File | Action | Purpose |
| ---- | ------ | ------- |
| `shared/src/types.ts` | **Modify** | Fix stale `Invite` interface to match backend response: `{ id, token, createdBy, revoked, createdAt }` |
| `client/src/renderer/src/stores/useInviteStore.ts` | **Create** | Zustand store: `fetchInvites()`, `generateInvite()`, `revokeInvite(id)` actions calling `/api/invites` |
| `client/src/renderer/src/features/channels/InviteModal.tsx` | **Create** | Modal UI: generate button, invite list with copy/revoke per row, error/loading states |
| `client/src/renderer/src/features/channels/ServerHeader.tsx` | **Modify** | Remove `disabled` from "Invite People" item, add `onSelect` handler + `useState` + `InviteModal` render |

### Files to Reference (read-only)

| File | Purpose |
| ---- | ------- |
| `client/src/renderer/src/features/channels/CreateChannelModal.tsx` | Reference pattern for modal wiring, form state, error handling |
| `client/src/renderer/src/stores/useChannelStore.ts` | Reference pattern for Zustand store with async actions |
| `client/src/renderer/src/services/apiClient.ts` | `apiRequest<T>` — generic REST client, unwraps `{ data }`, throws `Error(message)` on failure |
| `client/src/renderer/src/components/Modal.tsx` | Radix Dialog wrapper: `open`/`onOpenChange`/`title`/`children` |
| `client/src/renderer/src/components/Button.tsx` | `variant`/`size` props, extends `ButtonHTMLAttributes` |
| `server/src/plugins/invites/inviteRoutes.ts` | Backend API contract: POST/GET/DELETE `/api/invites` |
| `server/src/db/schema.ts` | DB truth: `invites` table = `id, token, created_by, revoked, created_at` |

### Technical Decisions

- Follow `CreateChannelModal` pattern exactly for consistency
- Clipboard API via `navigator.clipboard.writeText()` with visual "Copied!" feedback that resets after 2s
- Modal fetches invite list on open via `useEffect` calling `fetchInvites()`
- Generate button creates a new invite, refreshes list, and auto-copies the link
- Revoke button marks invite revoked and removes from displayed list
- Backend GET `/api/invites` returns all invites (including revoked) — filter client-side to show only active ones
- Invite link format: `{window.location.origin}/invite/{token}` (display only — deep linking is out of scope)

## Implementation Plan

### Tasks

- [x] Task 1: Fix shared `Invite` type
  - File: `shared/src/types.ts`
  - Action: Replace the stale `Invite` interface (lines 42-51) with one matching the backend GET `/api/invites` response shape:
    ```typescript
    export interface Invite {
      id: string;
      token: string;
      createdBy: string;
      revoked: boolean;
      createdAt: string;
    }
    ```
  - Notes: Backend returns camelCase in API response (see `inviteRoutes.ts` line 72-78). The `revoked` field is needed for client-side filtering of active invites.

- [x] Task 2: Create `useInviteStore` Zustand store
  - File: `client/src/renderer/src/stores/useInviteStore.ts` **(new)**
  - Action: Create a Zustand store following `useChannelStore` pattern with:
    - State: `invites: Invite[]`, `isLoading: boolean`, `error: string | null`
    - `fetchInvites()`: GET `/api/invites` → store result, filter to `revoked === false`
    - `generateInvite()`: POST `/api/invites` → returns new invite, prepends to list
    - `revokeInvite(id: string)`: DELETE `/api/invites/${id}` → removes from list on success
    - `clearError()`: resets error to null
  - Notes: Import `Invite` from `discord-clone-shared`. Import `apiRequest` from `../services/apiClient`. `apiRequest` already unwraps `{ data }` and throws with error message. For list endpoint, `apiRequest` returns the array directly (apiClient unwraps `data` from `{ data: [...], count }`? — **verify**: actually `apiRequest` returns `body.data` which for the list endpoint is the array, `count` is lost — that's fine, we just need the array).

- [x] Task 3: Create `InviteModal` component
  - File: `client/src/renderer/src/features/channels/InviteModal.tsx` **(new)**
  - Action: Create modal component with props `{ open: boolean, onOpenChange: (open: boolean) => void }` following `CreateChannelModal` pattern:
    - On open (`useEffect` on `open`): call `fetchInvites()` from store
    - **Generate section** (top): "Generate Invite Link" `Button` (variant=primary). On click: call `generateInvite()`, build link `${window.location.origin}/invite/${token}`, copy to clipboard via `navigator.clipboard.writeText()`, show "Copied!" feedback for 2s via local `useState`
    - **Invite list section** (below): Map over `invites` from store. Each row shows: truncated token, created date, "Copy" button (ghost, copies link), "Revoke" button (ghost, calls `revokeInvite(id)`)
    - **Loading state**: Show "Loading..." text while `isLoading` is true
    - **Error state**: Show error message in `text-error` (same pattern as `CreateChannelModal` line 95)
    - **Empty state**: "No active invites. Generate one above."
  - Notes: Use `Modal`, `Button` from `../../components`. Use lucide-react icons: `Copy`, `Trash2`, `Link`. Width: `w-[480px]` to accommodate invite rows.

- [x] Task 4: Wire "Invite People" dropdown in `ServerHeader`
  - File: `client/src/renderer/src/features/channels/ServerHeader.tsx`
  - Action:
    1. Add `import { InviteModal } from './InviteModal';`
    2. Add `const [inviteModalOpen, setInviteModalOpen] = useState(false);` alongside existing `createModalOpen` state
    3. Replace `<DropdownMenuItem disabled>` (line 36) with `<DropdownMenuItem onSelect={() => setInviteModalOpen(true)}>`
    4. Add `<InviteModal open={inviteModalOpen} onOpenChange={setInviteModalOpen} />` alongside the existing `<CreateChannelModal />` render
  - Notes: Minimal change — follows the exact same pattern as the Create Channel item above it.

- [x] Task 5: Write store tests
  - File: `client/src/renderer/src/stores/useInviteStore.test.ts` **(new)**
  - Action: Test all store actions:
    - `fetchInvites`: mock `apiRequest` → verify `invites` populated with only non-revoked items, `isLoading` transitions, error handling
    - `generateInvite`: mock `apiRequest` → verify new invite prepended to list, returns invite object
    - `revokeInvite`: mock `apiRequest` → verify invite removed from list by id
    - `clearError`: verify error reset to null
  - Notes: Mock `../services/apiClient` module via `vi.mock`. Reset store between tests via `useInviteStore.setState`.

- [x] Task 6: Write component tests
  - File: `client/src/renderer/src/features/channels/InviteModal.test.tsx` **(new)**
  - Action: Test modal behavior:
    - Renders modal with title when `open={true}`
    - Calls `fetchInvites` on open
    - Displays invite list rows with token and date
    - "Generate" button calls `generateInvite` and triggers clipboard write
    - "Copy" button copies invite link to clipboard
    - "Revoke" button calls `revokeInvite(id)`
    - Shows empty state when no invites
    - Shows error message when store has error
  - Notes: Mock `useInviteStore` via `vi.mock`. Mock `navigator.clipboard.writeText`. Use `@testing-library/react` `render`, `screen`, `userEvent`.

### Acceptance Criteria

- [x] AC1: Given I am the server owner, when I click the server name dropdown and select "Invite People", then the Invite modal opens showing a list of active invites
- [x] AC2: Given the Invite modal is open, when I click "Generate Invite Link", then a new invite is created and the invite link is automatically copied to my clipboard with "Copied!" visual feedback
- [x] AC3: Given the Invite modal shows active invites, when I click "Copy" on an invite row, then that invite's link is copied to my clipboard with "Copied!" feedback
- [x] AC4: Given the Invite modal shows active invites, when I click "Revoke" on an invite row, then that invite is revoked and removed from the list
- [x] AC5: Given the Invite modal is open and there are no active invites, then an empty state message "No active invites. Generate one above." is displayed
- [x] AC6: Given a network error occurs during any invite operation, then an error message is displayed in the modal
- [x] AC7: Given I am NOT the server owner, then the "Invite People" dropdown item is not visible (existing behavior — ServerHeader only renders dropdown for owners)
- [x] AC8: Given the `Invite` type in `shared/src/types.ts`, then it matches the backend API response shape: `{ id, token, createdBy, revoked, createdAt }`

## Additional Context

### Dependencies

- **Backend endpoints** (existing, no changes): `POST /api/invites`, `GET /api/invites`, `DELETE /api/invites/:id` — all owner-only via `requireOwner` middleware
- **Component primitives** (existing): `Modal`, `Button` from `components/index.ts`
- **API client** (existing): `apiRequest<T>` from `services/apiClient.ts`
- **Shared package**: `discord-clone-shared` — the `Invite` type is imported from here by the new store

### Testing Strategy

- **Unit tests** (`useInviteStore.test.ts`): Mock `apiRequest`, verify all state transitions — fetch, generate, revoke, error, loading
- **Component tests** (`InviteModal.test.tsx`): Mock store, mock clipboard API, verify render states (loading, empty, populated, error), verify user interactions (generate, copy, revoke)
- **Manual verification**: Open dropdown → click Invite People → modal opens → generate link → verify clipboard → revoke → verify removal

### Notes

- The stale `Invite` type in shared currently has `serverId`, `creatorId`, `code`, `maxUses`, `uses`, `expiresAt` — none of these exist in the actual DB or API. No other client code imports this type (confirmed in scan), so changing it is safe.
- `apiRequest` returns `body.data` — for the list endpoint (`GET /api/invites`), the backend sends `{ data: [...], count }`, so `apiRequest` returns the array directly. The `count` field is not accessible but not needed.
- Clipboard API (`navigator.clipboard.writeText`) requires secure context (HTTPS or localhost) — this is satisfied in both dev (localhost) and Electron (custom protocol).
