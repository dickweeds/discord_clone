# Story 1.4: User Login, Logout & Session Management

Status: ready-for-dev

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

- [ ] Task 1: Extend auth service with refresh token support (AC: 1, 3)
  - [ ] 1.1 Add `JWT_REFRESH_SECRET` env var with module-level fail-fast validation in `authService.ts`
  - [ ] 1.2 Implement `generateRefreshToken(payload: { userId: string, role: string }): string` — JWT signed with `JWT_REFRESH_SECRET`, 7-day expiry
  - [ ] 1.3 Implement `verifyRefreshToken(token: string): JwtPayload` — verify + validate payload shape (same pattern as `verifyAccessToken`)
  - [ ] 1.4 Implement `hashToken(token: string): string` — SHA-256 hash for DB storage (NOT bcrypt — refresh tokens are high-entropy, don't need slow hashing)
  - [ ] 1.5 Add `JWT_REFRESH_SECRET` to `.env.example`
  - [ ] 1.6 Update `vi.hoisted()` in existing test files to set `JWT_REFRESH_SECRET` env var

- [ ] Task 2: Create session service for DB-backed session management (AC: 1, 3, 5)
  - [ ] 2.1 Create `server/src/plugins/auth/sessionService.ts`
  - [ ] 2.2 Implement `createSession(db, userId: string, refreshToken: string): Session` — hash token, insert into sessions table with 7-day expiry, return session record
  - [ ] 2.3 Implement `findSessionByTokenHash(db, tokenHash: string): Session | null` — look up session by hashed refresh token
  - [ ] 2.4 Implement `deleteSession(db, sessionId: string): void` — delete single session (logout)
  - [ ] 2.5 Implement `deleteUserSessions(db, userId: string): void` — delete all sessions for a user (ban/kick)
  - [ ] 2.6 Implement `cleanExpiredSessions(db): number` — delete expired sessions, return count (housekeeping)

- [ ] Task 3: Extend login endpoint with refresh token + session creation (AC: 1, 6)
  - [ ] 3.1 Update POST `/api/auth/login` in `authRoutes.ts` to generate both access token AND refresh token
  - [ ] 3.2 Add username normalization to login: `rawUsername.trim().toLowerCase()` — registration (code review #2 fix from 1-3) stores usernames as lowercase, so login must normalize to match
  - [ ] 3.3 Create a session record in the sessions table (hash the refresh token before storing)
  - [ ] 3.4 Return both tokens in response: `{ data: { accessToken, refreshToken, user: { id, username, role } } }`
  - [ ] 3.5 Update existing login tests to verify refresh token is returned
  - [ ] 3.6 Add test for username normalization on login (e.g., login with "Owner" matches stored "owner")
  - [ ] 3.7 Ensure ban check still runs before password verification (timing attack prevention — code review fix from 1-3)

- [ ] Task 4: Create token refresh endpoint (AC: 3)
  - [ ] 4.1 Add POST `/api/auth/refresh` route (PUBLIC — no auth middleware, but requires valid refresh token in body)
  - [ ] 4.2 Add `/api/auth/refresh` to `PUBLIC_ROUTES` array in `authMiddleware.ts`
  - [ ] 4.3 Request body: `{ refreshToken: string }`
  - [ ] 4.4 Validate: hash incoming token, find matching session in DB, verify session not expired
  - [ ] 4.5 Implement token rotation: delete old session, create new session with new refresh token
  - [ ] 4.6 Return new token pair: `{ data: { accessToken, refreshToken } }`
  - [ ] 4.7 Error responses: 401 `INVALID_REFRESH_TOKEN` if token invalid/expired/not found

- [ ] Task 5: Create logout endpoint (AC: 5)
  - [ ] 5.1 Add POST `/api/auth/logout` route (AUTHENTICATED — requires valid access token)
  - [ ] 5.2 Request body: `{ refreshToken: string }`
  - [ ] 5.3 Hash the refresh token, find and delete the matching session
  - [ ] 5.4 Return 204 No Content on success
  - [ ] 5.5 Return 204 even if session not found (idempotent — don't leak session existence)

- [ ] Task 6: Implement Electron safeStorage bridge (AC: 1, 4, 5)
  - [ ] 6.1 Create `client/src/main/safeStorage.ts` — IPC handlers for encrypt/decrypt using `safeStorage` API
  - [ ] 6.2 Implement `secure-storage:set` IPC handler — `safeStorage.encryptString(value)` → store encrypted Buffer in a local JSON file (`userData/secure-tokens.json`)
  - [ ] 6.3 Implement `secure-storage:get` IPC handler — read encrypted Buffer from file → `safeStorage.decryptString(buffer)`
  - [ ] 6.4 Implement `secure-storage:delete` IPC handler — remove key from secure tokens file
  - [ ] 6.5 Register IPC handlers in `client/src/main/index.ts` on app ready
  - [ ] 6.6 Update `client/src/preload/index.ts` to expose `window.api.secureStorage` with `set(key, value)`, `get(key)`, `delete(key)` methods via `contextBridge`
  - [ ] 6.7 Add TypeScript type declarations for `window.api.secureStorage` in preload types

- [ ] Task 7: Create client API service with auto-refresh (AC: 1, 3)
  - [ ] 7.1 Create `client/src/renderer/src/services/apiClient.ts`
  - [ ] 7.2 Implement fetch wrapper that injects `Authorization: Bearer <accessToken>` header on every request
  - [ ] 7.3 Implement 401 interceptor: on 401 response, attempt token refresh via POST `/api/auth/refresh`, then retry original request
  - [ ] 7.4 If refresh also fails (401), clear auth state and redirect to login
  - [ ] 7.5 Use the server URL from app config (default: `http://localhost:3000` for dev)
  - [ ] 7.6 All responses parsed through the standard envelope: extract `data` on success, throw on `error`

- [ ] Task 8: Create useAuthStore with Zustand (AC: 1, 2, 3, 4, 5, 6)
  - [ ] 8.1 Install Zustand: `npm install zustand -w client`
  - [ ] 8.2 Create `client/src/renderer/src/stores/useAuthStore.ts`
  - [ ] 8.3 State shape: `{ user: User | null, accessToken: string | null, refreshToken: string | null, isLoading: boolean, error: string | null }`
  - [ ] 8.4 Implement `login(username, password)` action — call POST `/api/auth/login`, store tokens in safeStorage + state, set user
  - [ ] 8.5 Implement `logout()` action — call POST `/api/auth/logout`, clear safeStorage, clear state, redirect to `/login`
  - [ ] 8.6 Implement `refreshTokens()` action — call POST `/api/auth/refresh`, update tokens in safeStorage + state
  - [ ] 8.7 Implement `restoreSession()` action — read tokens from safeStorage on app start, validate access token, refresh if expired, set user
  - [ ] 8.8 Implement `setError(message)` and `clearError()` helpers

- [ ] Task 9: Create LoginPage component (AC: 1, 2, 6)
  - [ ] 9.1 Create `client/src/renderer/src/features/auth/LoginPage.tsx`
  - [ ] 9.2 Two input fields: Username, Password (use existing `Input` component)
  - [ ] 9.3 "Log In" button (use existing `Button` component) — disabled until both fields have content
  - [ ] 9.4 Enter key submits form
  - [ ] 9.5 Error display: inline error message below form on invalid credentials or banned user
  - [ ] 9.6 Loading state: button shows loading state during submission
  - [ ] 9.7 On success: redirect to `/app` (main interface)
  - [ ] 9.8 Style with warm earthy theme: `bg-bg-primary`, `text-text-primary`, centered card layout

- [ ] Task 10: Create AuthGuard and update routing (AC: 4)
  - [ ] 10.1 Create `client/src/renderer/src/features/auth/AuthGuard.tsx` — wrapper component that checks auth state
  - [ ] 10.2 If authenticated → render children
  - [ ] 10.3 If not authenticated → redirect to `/login`
  - [ ] 10.4 If restoring session → show loading skeleton (not a full-screen spinner)
  - [ ] 10.5 Update `App.tsx` routes:
    - `/login` → `LoginPage`
    - `/register/:token` → existing or placeholder `RegisterPage`
    - `/app/*` → `AuthGuard` wrapping main app content
    - `/` → redirect to `/app` (AuthGuard handles redirect to login if needed)
  - [ ] 10.6 Implement `restoreSession()` call on app mount in `App.tsx`

- [ ] Task 11: Write server-side tests (AC: 1-6)
  - [ ] 11.1 Create `server/src/plugins/auth/sessionService.test.ts` — test session CRUD (create, find, delete, cleanup) (~8 tests)
  - [ ] 11.2 Update `server/src/plugins/auth/authRoutes.test.ts` — add tests for extended login (refresh token returned), refresh endpoint, logout endpoint (~12 new tests)
  - [ ] 11.3 Test refresh token rotation: old token invalid after refresh
  - [ ] 11.4 Test expired session rejection on refresh
  - [ ] 11.5 Test logout idempotency (204 even if session not found)
  - [ ] 11.6 Test ban enforcement still works with new session flow
  - [ ] 11.7 Update existing test helpers if needed (add `seedUserWithSession` helper)

- [ ] Task 12: Final verification (AC: 1-6)
  - [ ] 12.1 Run `npm test -w server` — all existing + new tests pass
  - [ ] 12.2 Run `npm run lint` — no lint errors
  - [ ] 12.3 Verify no sensitive data in logs (tokens, passwords, refresh tokens)
  - [ ] 12.4 Verify safeStorage integration works in Electron dev mode
  - [ ] 12.5 Test full flow: login → receive tokens → restart app → auto-login → logout → redirected to login

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
