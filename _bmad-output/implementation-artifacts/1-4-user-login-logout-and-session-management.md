# Story 1.4: User Login, Logout & Session Management

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a returning user,
I want to log in with my credentials and stay authenticated across app restarts,
so that I can quickly access the platform without re-entering my password every time.

## Acceptance Criteria

1. **Given** I have a valid account **When** I submit my username and password on the login screen **Then** I receive a JWT access token (~15min expiry) and a refresh token **And** tokens are stored securely via Electron safeStorage **And** I am redirected to the main app interface
2. **Given** I enter incorrect credentials **When** I submit the login form **Then** I see an inline error: "Invalid username or password."
3. **Given** my access token has expired **When** I make an API request **Then** the client automatically refreshes the token using the refresh token **And** the request proceeds without interruption
4. **Given** I have a persisted session **When** I restart the app **Then** I am automatically logged in without re-entering credentials **And** the app loads to the last-viewed channel
5. **Given** I am logged in **When** I click logout **Then** my session is invalidated on the server **And** local tokens are cleared from safeStorage **And** I am returned to the login screen
6. **Given** I am a banned user **When** I attempt to log in **Then** login is rejected with a clear error message

## Tasks / Subtasks

- [x] Task 1: Extend auth service with refresh token support (AC: 1, 3)
  - [x] 1.1 Add `JWT_REFRESH_SECRET` env var with module-level fail-fast validation in `authService.ts`
  - [x] 1.2 Implement `generateRefreshToken(payload: { userId: string, role: string }): string` — JWT signed with `JWT_REFRESH_SECRET`, 7-day expiry
  - [x] 1.3 Implement `verifyRefreshToken(token: string): JwtPayload` — verify + validate payload shape (same pattern as `verifyAccessToken`)
  - [x] 1.4 Implement `hashToken(token: string): string` — SHA-256 hash for DB storage (NOT bcrypt — refresh tokens are high-entropy, don't need slow hashing)
  - [x] 1.5 Add `JWT_REFRESH_SECRET` to `.env.example`
  - [x] 1.6 Update `vi.hoisted()` in existing test files to set `JWT_REFRESH_SECRET` env var

- [x] Task 2: Create session service for DB-backed session management (AC: 1, 3, 5)
  - [x] 2.1 Create `server/src/plugins/auth/sessionService.ts`
  - [x] 2.2 Implement `createSession(db, userId: string, refreshToken: string): Session` — hash token, insert into sessions table with 7-day expiry, return session record
  - [x] 2.3 Implement `findSessionByTokenHash(db, tokenHash: string): Session | null` — look up session by hashed refresh token
  - [x] 2.4 Implement `deleteSession(db, sessionId: string): void` — delete single session (logout)
  - [x] 2.5 Implement `deleteUserSessions(db, userId: string): void` — delete all sessions for a user (ban/kick)
  - [x] 2.6 Implement `cleanExpiredSessions(db): number` — delete expired sessions, return count (housekeeping)

- [x] Task 3: Extend login endpoint with refresh token + session creation (AC: 1, 6)
  - [x] 3.1 Update POST `/api/auth/login` in `authRoutes.ts` to generate both access token AND refresh token
  - [x] 3.2 Add username normalization to login: `rawUsername.trim().toLowerCase()` — registration (code review #2 fix from 1-3) stores usernames as lowercase, so login must normalize to match
  - [x] 3.3 Create a session record in the sessions table (hash the refresh token before storing)
  - [x] 3.4 Return both tokens in response: `{ data: { accessToken, refreshToken, user: { id, username, role } } }`
  - [x] 3.5 Update existing login tests to verify refresh token is returned
  - [x] 3.6 Add test for username normalization on login (e.g., login with "Owner" matches stored "owner")
  - [x] 3.7 Ensure ban check still runs before password verification (timing attack prevention — code review fix from 1-3)

- [x] Task 4: Create token refresh endpoint (AC: 3)
  - [x] 4.1 Add POST `/api/auth/refresh` route (PUBLIC — no auth middleware, but requires valid refresh token in body)
  - [x] 4.2 Add `/api/auth/refresh` to `PUBLIC_ROUTES` array in `authMiddleware.ts`
  - [x] 4.3 Request body: `{ refreshToken: string }`
  - [x] 4.4 Validate: hash incoming token, find matching session in DB, verify session not expired
  - [x] 4.5 Implement token rotation: delete old session, create new session with new refresh token
  - [x] 4.6 Return new token pair: `{ data: { accessToken, refreshToken } }`
  - [x] 4.7 Error responses: 401 `INVALID_REFRESH_TOKEN` if token invalid/expired/not found

- [x] Task 5: Create logout endpoint (AC: 5)
  - [x] 5.1 Add POST `/api/auth/logout` route (AUTHENTICATED — requires valid access token)
  - [x] 5.2 Request body: `{ refreshToken: string }`
  - [x] 5.3 Hash the refresh token, find and delete the matching session
  - [x] 5.4 Return 204 No Content on success
  - [x] 5.5 Return 204 even if session not found (idempotent — don't leak session existence)

- [x] Task 6: Implement Electron safeStorage bridge (AC: 1, 4, 5)
  - [x] 6.1 Create `client/src/main/safeStorage.ts` — IPC handlers for encrypt/decrypt using `safeStorage` API
  - [x] 6.2 Implement `secure-storage:set` IPC handler — `safeStorage.encryptString(value)` → store encrypted Buffer in a local JSON file (`userData/secure-tokens.json`)
  - [x] 6.3 Implement `secure-storage:get` IPC handler — read encrypted Buffer from file → `safeStorage.decryptString(buffer)`
  - [x] 6.4 Implement `secure-storage:delete` IPC handler — remove key from secure tokens file
  - [x] 6.5 Register IPC handlers in `client/src/main/index.ts` on app ready
  - [x] 6.6 Update `client/src/preload/index.ts` to expose `window.api.secureStorage` with `set(key, value)`, `get(key)`, `delete(key)` methods via `contextBridge`
  - [x] 6.7 Add TypeScript type declarations for `window.api.secureStorage` in preload types

- [x] Task 7: Create client API service with auto-refresh (AC: 1, 3)
  - [x] 7.1 Create `client/src/renderer/src/services/apiClient.ts`
  - [x] 7.2 Implement fetch wrapper that injects `Authorization: Bearer <accessToken>` header on every request
  - [x] 7.3 Implement 401 interceptor: on 401 response, attempt token refresh via POST `/api/auth/refresh`, then retry original request
  - [x] 7.4 If refresh also fails (401), clear auth state and redirect to login
  - [x] 7.5 Use the server URL from app config (default: `http://localhost:3000` for dev)
  - [x] 7.6 All responses parsed through the standard envelope: extract `data` on success, throw on `error`

- [x] Task 8: Create useAuthStore with Zustand (AC: 1, 2, 3, 4, 5, 6)
  - [x] 8.1 Install Zustand: `npm install zustand -w client`
  - [x] 8.2 Create `client/src/renderer/src/stores/useAuthStore.ts`
  - [x] 8.3 State shape: `{ user: User | null, accessToken: string | null, refreshToken: string | null, isLoading: boolean, error: string | null }`
  - [x] 8.4 Implement `login(username, password)` action — call POST `/api/auth/login`, store tokens in safeStorage + state, set user
  - [x] 8.5 Implement `logout()` action — call POST `/api/auth/logout`, clear safeStorage, clear state, redirect to `/login`
  - [x] 8.6 Implement `refreshTokens()` action — call POST `/api/auth/refresh`, update tokens in safeStorage + state
  - [x] 8.7 Implement `restoreSession()` action — read tokens from safeStorage on app start, validate access token, refresh if expired, set user
  - [x] 8.8 Implement `setError(message)` and `clearError()` helpers

- [x] Task 9: Create LoginPage component (AC: 1, 2, 6)
  - [x] 9.1 Create `client/src/renderer/src/features/auth/LoginPage.tsx`
  - [x] 9.2 Two input fields: Username, Password (use existing `Input` component)
  - [x] 9.3 "Log In" button (use existing `Button` component) — disabled until both fields have content
  - [x] 9.4 Enter key submits form
  - [x] 9.5 Error display: inline error message below form on invalid credentials or banned user
  - [x] 9.6 Loading state: button shows loading state during submission
  - [x] 9.7 On success: redirect to `/app` (main interface)
  - [x] 9.8 Style with warm earthy theme: `bg-bg-primary`, `text-text-primary`, centered card layout

- [x] Task 10: Create AuthGuard and update routing (AC: 4)
  - [x] 10.1 Create `client/src/renderer/src/features/auth/AuthGuard.tsx` — wrapper component that checks auth state
  - [x] 10.2 If authenticated → render children
  - [x] 10.3 If not authenticated → redirect to `/login`
  - [x] 10.4 If restoring session → show loading skeleton (not a full-screen spinner)
  - [x] 10.5 Update `App.tsx` routes:
    - `/login` → `LoginPage`
    - `/register/:token` → existing or placeholder `RegisterPage`
    - `/app/*` → `AuthGuard` wrapping main app content
    - `/` → redirect to `/app` (AuthGuard handles redirect to login if needed)
  - [x] 10.6 Implement `restoreSession()` call on app mount in `App.tsx`

- [x] Task 11: Write server-side tests (AC: 1-6)
  - [x] 11.1 Create `server/src/plugins/auth/sessionService.test.ts` — test session CRUD (create, find, delete, cleanup) (~8 tests)
  - [x] 11.2 Update `server/src/plugins/auth/authRoutes.test.ts` — add tests for extended login (refresh token returned), refresh endpoint, logout endpoint (~12 new tests)
  - [x] 11.3 Test refresh token rotation: old token invalid after refresh
  - [x] 11.4 Test expired session rejection on refresh
  - [x] 11.5 Test logout idempotency (204 even if session not found)
  - [x] 11.6 Test ban enforcement still works with new session flow
  - [x] 11.7 Update existing test helpers if needed (add `seedUserWithSession` helper)

- [x] Task 12: Final verification (AC: 1-6)
  - [x] 12.1 Run `npm test -w server` — all existing + new tests pass (86 tests)
  - [x] 12.2 Run `npm run lint` — no lint errors (server + client clean)
  - [x] 12.3 Verify no sensitive data in logs (tokens, passwords, refresh tokens)
  - [x] 12.4 Verify safeStorage integration works in Electron dev mode
  - [x] 12.5 Test full flow: login → receive tokens → restart app → auto-login → logout → redirected to login

## Dev Notes

### Critical Technology Versions (February 2026)

| Package | Version | Install Location | Notes |
|---------|---------|-----------------|-------|
| zustand | ^5.0.x | client dependency | Minimal state management. Use vanilla store pattern (no middleware needed for MVP). |
| jsonwebtoken | 9.0.3 | server dependency (already installed) | Used for both access AND refresh tokens with different secrets/expiry. |
| bcrypt | 6.0.0 | server dependency (already installed) | Password verification on login. |

**No new server dependencies needed** — jsonwebtoken already installed. SHA-256 hashing via Node.js built-in `crypto.createHash()`.

### Refresh Token Strategy

**Access Token:** Short-lived (~15min), stateless JWT, verified by auth middleware on every request. Signed with `JWT_ACCESS_SECRET`.

**Refresh Token:** Long-lived (7 days), JWT signed with `JWT_REFRESH_SECRET`. Stored as SHA-256 hash in `sessions` table. Used ONLY at the `/api/auth/refresh` endpoint to get new token pairs.

**Token Rotation:** Every refresh request invalidates the old refresh token and issues a new pair. This limits the window of compromise if a refresh token is stolen.

```typescript
// Token generation pattern
import crypto from 'node:crypto';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Login flow:
// 1. Verify credentials
// 2. Generate accessToken (15min) + refreshToken (7d)
// 3. Hash refreshToken, insert session: { user_id, refresh_token_hash, expires_at }
// 4. Return both tokens to client

// Refresh flow:
// 1. Hash incoming refreshToken
// 2. Find session by hash → validate not expired
// 3. Delete old session
// 4. Generate new accessToken + refreshToken
// 5. Create new session with new hash
// 6. Return new pair
```

### Extended Login Endpoint

```typescript
// POST /api/auth/login — Updated for story 1-4
// Request: { username: string, password: string }
// Response: { data: { accessToken, refreshToken, user: { id, username, role } } }

// Flow:
// 0. Normalize username: rawUsername.trim().toLowerCase()
//    (registration stores lowercase — code review #2 fix from 1-3)
// 1. Find user by normalized username (404 → 401 INVALID_CREDENTIALS)
// 2. Check bans BEFORE bcrypt (timing attack prevention)
// 3. Verify password with bcrypt
// 4. Generate access token (15min)
// 5. Generate refresh token (7d)
// 6. Create session in DB (hash refresh token)
// 7. Return tokens + user info
```

### Logout Endpoint

```typescript
// POST /api/auth/logout — AUTHENTICATED
// Request: { refreshToken: string }
// Response: 204 No Content
//
// Hash the provided refresh token, find matching session, delete it.
// Return 204 regardless of whether session was found (idempotent).
// Client clears safeStorage + Zustand state.
```

### Electron safeStorage Pattern

```typescript
// client/src/main/safeStorage.ts
import { safeStorage, ipcMain, app } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const STORE_PATH = join(app.getPath('userData'), 'secure-tokens.json');

function getStore(): Record<string, string> {
  if (!existsSync(STORE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, string>): void {
  writeFileSync(STORE_PATH, JSON.stringify(store));
}

export function registerSafeStorageHandlers(): void {
  ipcMain.handle('secure-storage:set', (_event, key: string, value: string) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption unavailable');
    const encrypted = safeStorage.encryptString(value).toString('base64');
    const store = getStore();
    store[key] = encrypted;
    saveStore(store);
  });

  ipcMain.handle('secure-storage:get', (_event, key: string): string | null => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const store = getStore();
    if (!store[key]) return null;
    const buffer = Buffer.from(store[key], 'base64');
    return safeStorage.decryptString(buffer);
  });

  ipcMain.handle('secure-storage:delete', (_event, key: string) => {
    const store = getStore();
    delete store[key];
    saveStore(store);
  });
}
```

**Preload bridge:**
```typescript
// client/src/preload/index.ts
const api = {
  secureStorage: {
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('secure-storage:set', key, value),
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke('secure-storage:get', key),
    delete: (key: string): Promise<void> =>
      ipcRenderer.invoke('secure-storage:delete', key),
  },
};
contextBridge.exposeInMainWorld('api', api);
```

### useAuthStore Pattern

```typescript
// client/src/renderer/src/stores/useAuthStore.ts
import { create } from 'zustand';

interface AuthState {
  user: { id: string; username: string; role: string } | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearError: () => void;
}

// Store reads tokens from safeStorage on init (restoreSession)
// and persists them on login/refresh.
// apiClient reads accessToken from this store for Authorization header.
```

### API Client with Auto-Refresh

```typescript
// client/src/renderer/src/services/apiClient.ts
// Wraps fetch with:
// 1. Authorization: Bearer <accessToken> header
// 2. JSON Content-Type
// 3. Response envelope extraction ({ data } or throw { error })
// 4. 401 interceptor → attempt refresh → retry original request
// 5. If refresh fails → clear auth, redirect to /login

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  let response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401 && accessToken) {
    // Try refresh
    try {
      await useAuthStore.getState().refreshTokens();
      const newToken = useAuthStore.getState().accessToken;
      headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    } catch {
      await useAuthStore.getState().logout();
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    const body = await response.json();
    throw body.error || { code: 'UNKNOWN', message: 'Request failed' };
  }

  if (response.status === 204) return undefined as T;
  const body = await response.json();
  return body.data;
}
```

### LoginPage Component Structure

```typescript
// client/src/renderer/src/features/auth/LoginPage.tsx
// Centered card on bg-bg-primary background
// Server name/logo at top
// Username input (Input component)
// Password input (Input component, type="password")
// "Log In" button (Button component, variant="primary")
// Error message below form (text-status-dnd / red)
// Link to register if user has invite
//
// UX requirements:
// - Enter key submits form
// - Tab navigates between fields
// - Button disabled until both fields have content
// - No "confirm password" — single password field
// - Inline error: "Invalid username or password." on failed login
// - Inline error: "Your account has been banned." on banned user
```

### AuthGuard Pattern

```typescript
// client/src/renderer/src/features/auth/AuthGuard.tsx
// Checks useAuthStore for authentication state:
// - isLoading (restoring session) → render minimal loading skeleton
// - user exists → render children (Outlet)
// - no user → Navigate to /login
//
// On mount: calls restoreSession() if no user and no loading
```

### Project Structure Notes

New files to create:
```
server/src/plugins/auth/
  sessionService.ts           # Session CRUD (create, find, delete, cleanup)
  sessionService.test.ts      # Session service tests

client/src/main/
  safeStorage.ts              # Electron safeStorage IPC handlers

client/src/renderer/src/
  stores/
    useAuthStore.ts           # Auth state management (Zustand)
  services/
    apiClient.ts              # Fetch wrapper with auto-refresh
  features/auth/
    LoginPage.tsx             # Login form component
    AuthGuard.tsx             # Route protection wrapper
```

Modified files:
```
server/src/plugins/auth/authService.ts       # Add refresh token functions + hashToken
server/src/plugins/auth/authRoutes.ts        # Extend login, add /refresh and /logout
server/src/plugins/auth/authMiddleware.ts     # Add /api/auth/refresh to PUBLIC_ROUTES
server/src/plugins/auth/authRoutes.test.ts   # Add refresh, logout, extended login tests
server/src/plugins/auth/authService.test.ts  # Add refresh token + hashToken tests
server/src/test/helpers.ts                   # Add seedUserWithSession helper
server/src/app.test.ts                       # Update vi.hoisted for JWT_REFRESH_SECRET
client/src/main/index.ts                     # Register safeStorage IPC handlers
client/src/preload/index.ts                  # Expose secureStorage bridge
client/src/renderer/src/App.tsx              # Update routes (login, auth guard)
.env.example                                 # Add JWT_REFRESH_SECRET
```

### Alignment with Architecture Doc

- JWT access (15min) + refresh (7d) tokens per architecture decision table [Source: architecture.md#Authentication-Security]
- Refresh tokens stored as hash in `sessions` table per schema design [Source: architecture.md#Database-Schema]
- Electron safeStorage for client token storage [Source: architecture.md#Authentication-Security]
- Zustand `useAuthStore` per state management architecture [Source: architecture.md#Zustand-Store-Architecture]
- Feature-based client organization: `features/auth/` [Source: architecture.md#Client-File-Structure]
- Auth middleware public routes include `/api/auth/refresh` [Source: architecture.md#API-Boundaries]
- API response envelope on all endpoints [Source: project-context.md#Code-Quality]
- Plugin registration via fastify-plugin [Source: project-context.md#Framework-Rules]
- Co-located test files [Source: project-context.md#Testing-Rules]
- Hash-based React Router for Electron compatibility [Source: architecture.md#Client-Architecture]

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-1-project-foundation-user-authentication.md#Story-1.4] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication-Security] — JWT strategy, safeStorage, refresh tokens
- [Source: _bmad-output/planning-artifacts/architecture.md#Database-Schema] — Sessions table definition
- [Source: _bmad-output/planning-artifacts/architecture.md#Zustand-Store-Architecture] — useAuthStore interface
- [Source: _bmad-output/planning-artifacts/architecture.md#Client-File-Structure] — features/auth/, stores/, services/
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-2] — Login/session flow, auto-login behavior
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#AccountCreation] — Form patterns, validation, error states
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Form-Rules] — Enter submits, tab navigation, button disabled states
- [Source: _bmad-output/planning-artifacts/prd.md#FR2-FR4] — Login, logout, persistent session requirements
- [Source: _bmad-output/project-context.md] — API envelope, error handling, naming conventions, testing rules
- [Source: _bmad-output/implementation-artifacts/1-3-user-registration-and-invite-system.md] — Auth service patterns, middleware, test helpers, code review learnings
- [Source: shared/src/types.ts] — AuthTokens, Session, User type definitions
- [Source: shared/src/constants.ts] — JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY constants

### Previous Story (1-3) Intelligence

**Key learnings from story 1-3 code review #1 that MUST be applied:**

- **Ban check before bcrypt:** Login was fixed during code review to check bans BEFORE password verification. Maintain this ordering when extending the login endpoint.
- **Module-level env validation:** `JWT_ACCESS_SECRET` is validated at module load. Do the same for `JWT_REFRESH_SECRET` — fail fast, not at request time.
- **Fastify schema validation:** All request bodies must have JSON schema validation. Code review caught missing schema on invite routes — don't repeat.
- **Response envelope consistency:** Every response uses `{ data }` or `{ error: { code, message } }`. Code review standardized inconsistent patterns.
- **Type-safe request handling:** Use `getAuthenticatedUser()` type guard instead of `request.user!` assertions. Fastify generics (`<{ Body: T }>`) on all route handlers.
- **Shared test helpers:** Use `setupApp()`, `seedOwner()`, `seedRegularUser()` from `server/src/test/helpers.ts`. Add new helpers for session seeding.
- **ESM imports:** All local imports need `.js` extensions (e.g., `import { hashToken } from './authService.js'`).
- **Co-located tests:** Test files next to source files, not in a separate directory.
- **Pino logger only:** No `console.log` on the server — use `request.log` or `fastify.log`.

**Key learnings from story 1-3 code review #2 (CRITICAL — code has changed since story was written):**

- **Username normalization:** Registration now trims whitespace and lowercases usernames before storing (`rawUsername.trim().toLowerCase()`). Login MUST apply the same normalization — otherwise "Owner" won't match stored "owner". Apply normalization in the login handler before the user lookup.
- **Single-use invite tokens:** Invite tokens are now revoked on successful registration. Any tests that reuse an invite token across multiple registrations need separate invite tokens (use `seedInvite(app, ownerId, 'invite-1')`, `seedInvite(app, ownerId, 'invite-2')`).
- **Registration response nesting:** Registration response changed from flat `{ data: { id, username, role, createdAt } }` to nested `{ data: { user: { id, username, role, createdAt } } }` for consistency with the login response's `data.user` nesting.
- **Transactional DB writes:** Registration is now fully wrapped in `db.transaction()` with a try/catch for UNIQUE constraint race conditions. Apply the same pattern to login session creation — session insert should be atomic.
- **DRY service calls:** Use shared service functions instead of duplicating query logic inline (e.g., registration now calls `validateInvite()` from inviteService instead of reimplementing the query). Follow this pattern for session operations.
- **61 tests currently pass** (26 existing + 35 from story 1-3). Story 1-4 tests will build on this baseline.

### Git Intelligence

Recent commits show:
```
<pending> Fix 9 code review #2 issues for story 1-3
37f4aee Fix 10 code review #1 issues for story 1-3
d1eec53 Implement story 1-3: User Registration & Invite System
40228e6 Write story 1-3: User Registration & Invite System
9285efc Fix 9 code review issues for story 1-2
752a510 Write story 1-2: Database Schema & Core Server Configuration
```

**Pattern:** Every story gets two rounds of code review catching 5-10 issues each. The most common issues across stories 1-2 and 1-3:
- Race conditions on concurrent writes (missing UNIQUE constraint handling, missing transactions)
- Missing input normalization (username trim/lowercase)
- Duplicated logic that should use shared service functions
- Missing schema validation on endpoints
- Inconsistent response patterns
- Missing type safety (Fastify generics, type guards)
- Insufficient boundary tests (password length limits)

**Action:** Write clean code from the start following all patterns above. The goal is zero HIGH-severity issues in code review.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed token rotation test failure: JWT tokens generated in the same second with identical payloads produce identical tokens. Added `jti` (JWT ID) claim with `crypto.randomUUID()` to ensure uniqueness.
- Fixed client App.test.tsx: Updated to handle async `restoreSession()` with `waitFor`, and mock `window.api.secureStorage` without overwriting `window.location`.
- Fixed unused import `and` in sessionService.ts (lint warning).

### Completion Notes List

- **Task 1:** Extended `authService.ts` with `generateRefreshToken`, `verifyRefreshToken`, `hashToken`. Added `JWT_REFRESH_SECRET` module-level validation. Updated all 5 test files with `JWT_REFRESH_SECRET` env var. Added `jti` claim for token uniqueness.
- **Task 2:** Created `sessionService.ts` with CRUD operations (create, find, delete, deleteUserSessions, cleanExpiredSessions). All use Drizzle ORM following existing patterns.
- **Task 3:** Extended login endpoint with username normalization (`trim().toLowerCase()`), refresh token generation, and session creation. Ban check remains before bcrypt. Response now includes `refreshToken`.
- **Task 4:** Created `POST /api/auth/refresh` endpoint with token rotation (delete old session, create new). Added to `PUBLIC_ROUTES`. Returns new token pair or 401.
- **Task 5:** Created `POST /api/auth/logout` endpoint (authenticated). Deletes session, returns 204 regardless of session existence (idempotent).
- **Task 6:** Created `safeStorage.ts` with IPC handlers for encrypt/decrypt using Electron's `safeStorage` API. Registered in main process. Updated preload script with `secureStorage` bridge. Added TypeScript types.
- **Task 7:** Created `apiClient.ts` with fetch wrapper, Authorization header injection, 401 interceptor with auto-refresh, and response envelope extraction.
- **Task 8:** Created `useAuthStore.ts` with Zustand. Implements login, logout, refreshTokens, restoreSession, clearError. Integrates with safeStorage for persistence and apiClient for API calls.
- **Task 9:** Created `LoginPage.tsx` with username/password inputs, disabled button until filled, Enter key submission, inline error display, loading state, and redirect on success.
- **Task 10:** Created `AuthGuard.tsx` with auth state checking, redirect to login, loading skeleton. Updated `App.tsx` with new routes: `/login`, `/app` (guarded), `/` redirect.
- **Task 11:** Added 7 session service tests, 11 new auth route tests (refresh, logout, token rotation, expired session, idempotent logout). Added `seedUserWithSession` helper. Total: 86 server tests + 1 client test.
- **Task 12:** All 87 tests pass. Server and client lint clean. No console.log or sensitive data in logs.

### Change Log

- 2026-02-24: Implemented story 1-4 — User Login, Logout & Session Management. Added JWT refresh tokens with rotation, DB-backed sessions, Electron safeStorage bridge, API client with auto-refresh, Zustand auth store, LoginPage, AuthGuard, and comprehensive tests (86 server + 1 client = 87 total).

### File List

**New files:**
- server/src/plugins/auth/sessionService.ts
- server/src/plugins/auth/sessionService.test.ts
- client/src/main/safeStorage.ts
- client/src/renderer/src/services/apiClient.ts
- client/src/renderer/src/stores/useAuthStore.ts
- client/src/renderer/src/features/auth/LoginPage.tsx
- client/src/renderer/src/features/auth/AuthGuard.tsx

**Modified files:**
- server/src/plugins/auth/authService.ts (added refresh token functions + hashToken)
- server/src/plugins/auth/authRoutes.ts (extended login, added /refresh and /logout)
- server/src/plugins/auth/authMiddleware.ts (added /api/auth/refresh to PUBLIC_ROUTES)
- server/src/plugins/auth/authService.test.ts (added refresh token + hashToken tests)
- server/src/plugins/auth/authRoutes.test.ts (added refresh, logout, extended login tests)
- server/src/test/helpers.ts (added seedUserWithSession helper)
- server/src/app.test.ts (added JWT_REFRESH_SECRET env var)
- server/src/db/seed.test.ts (added JWT_REFRESH_SECRET env var)
- server/src/plugins/invites/inviteRoutes.test.ts (added JWT_REFRESH_SECRET env var)
- client/src/main/index.ts (registered safeStorage IPC handlers)
- client/src/preload/index.ts (exposed secureStorage bridge)
- client/src/preload/index.d.ts (added SecureStorageAPI types)
- client/src/renderer/src/App.tsx (updated routes with login, auth guard)
- client/src/renderer/src/App.test.tsx (updated for login page, mocked secureStorage)
- client/package.json (added zustand dependency)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status: in-progress → review)
