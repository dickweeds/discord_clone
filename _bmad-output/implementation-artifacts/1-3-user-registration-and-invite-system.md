# Story 1.3: User Registration & Invite System

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a new user (Jordan),
I want to create an account using an invite link from the server owner,
so that I can join the server and start communicating with my friends.

## Acceptance Criteria

1. **Given** the server is running for the first time **When** the server initializes **Then** an owner account is created via environment-configured credentials **And** default channels are seeded (e.g., #general text channel, Gaming voice channel)
2. **Given** I am the server owner **When** I call POST /api/invites **Then** a cryptographically random, non-guessable invite token is generated **And** the invite link is returned
3. **Given** I am the server owner **When** I call DELETE /api/invites/:id **Then** the invite is revoked and can no longer be used for registration
4. **Given** I have a valid invite token **When** I call GET /api/invites/:token/validate **Then** the invite is validated and the server name is returned for display
5. **Given** I am on the registration screen with a valid invite **When** I submit a username and password **Then** my account is created with a bcrypt-hashed password **And** I am assigned the "user" role **And** the registration UI shows only username and password fields — no email, phone, or CAPTCHA
6. **Given** I try to register with an already-taken username **When** I submit the form **Then** I see an inline error below the username field: "That username is taken. Try another."
7. **Given** I try to register with an invalid or revoked invite token **When** I attempt to access the registration flow **Then** I see: "This invite is no longer valid. Ask the server owner for a new one."
8. **Given** I am a banned user **When** I try to create a new account **Then** registration is blocked

## Tasks / Subtasks

- [x] Task 1: Install auth dependencies in server workspace (AC: 1, 5)
  - [x] 1.1 Install runtime deps: `npm install bcrypt@^6.0.0 jsonwebtoken@^9.0.3 -w server`
  - [x] 1.2 Install dev deps: `npm install -D @types/bcrypt @types/jsonwebtoken -w server`
  - [x] 1.3 Verify bcrypt native module compiles on current platform (Node.js 20+)
  - [x] 1.4 If bcrypt native compilation fails, fall back to `bcryptjs@^3.0.3` (pure JS, ESM-compatible) — N/A, native compiled successfully

- [x] Task 2: Create auth service — password hashing and JWT utilities (AC: 1, 5)
  - [x] 2.1 Create `server/src/plugins/auth/authService.ts`
  - [x] 2.2 Implement `hashPassword(password: string): Promise<string>` using bcrypt with cost factor 12
  - [x] 2.3 Implement `verifyPassword(password: string, hash: string): Promise<boolean>` using bcrypt.compare
  - [x] 2.4 Implement `generateAccessToken(payload: { userId: string, role: string }): string` using jsonwebtoken with `JWT_ACCESS_SECRET` env var, 15min expiry
  - [x] 2.5 Implement `verifyAccessToken(token: string): JwtPayload` using jsonwebtoken.verify
  - [x] 2.6 Export types: `JwtPayload { userId: string, role: string, iat: number, exp: number }`

- [x] Task 3: Create auth middleware — JWT verification hook (AC: 2, 3)
  - [x] 3.1 Create `server/src/plugins/auth/authMiddleware.ts`
  - [x] 3.2 Implement Fastify `onRequest` hook that extracts Bearer token from Authorization header
  - [x] 3.3 Verify token using `authService.verifyAccessToken()`
  - [x] 3.4 Decorate `request` with `request.user = { userId, role }` on success
  - [x] 3.5 Return 401 `{ error: { code: "UNAUTHORIZED", message: "Authentication required" } }` if token missing or invalid
  - [x] 3.6 Add TypeScript type augmentation for `FastifyRequest` to include `user` property
  - [x] 3.7 Create helper `requireOwner` preHandler that checks `request.user.role === 'owner'`, returns 403 if not

- [x] Task 4: Create auth routes plugin with registration and basic login (AC: 5, 6, 7, 8)
  - [x] 4.1 Create `server/src/plugins/auth/authRoutes.ts` as a Fastify plugin
  - [x] 4.2 Implement POST `/api/auth/register` (public — no auth middleware)
  - [x] 4.3 Implement POST `/api/auth/login` (public — minimal for this story)
  - [x] 4.4 Add Fastify JSON schema validation for request bodies on both endpoints
  - [x] 4.5 Wrap in fastify-plugin with `{ name: 'auth-routes' }`

- [x] Task 5: Create invite service and routes (AC: 2, 3, 4)
  - [x] 5.1 Create `server/src/plugins/invites/inviteService.ts`
  - [x] 5.2 Implement `generateInviteToken(): string` using `crypto.randomBytes(32).toString('base64url')`
  - [x] 5.3 Implement `createInvite(createdBy: string): Promise<Invite>`
  - [x] 5.4 Implement `revokeInvite(inviteId: string): Promise<void>`
  - [x] 5.5 Implement `validateInvite(token: string): Promise<{ valid: boolean, serverName: string }>`
  - [x] 5.6 Implement `getInvites(): Promise<Invite[]>`
  - [x] 5.7 Create `server/src/plugins/invites/inviteRoutes.ts` as a Fastify plugin
  - [x] 5.8 Add Fastify JSON schema validation for all endpoints
  - [x] 5.9 Wrap in fastify-plugin with `{ name: 'invite-routes' }`

- [x] Task 6: Implement first-run server initialization (AC: 1)
  - [x] 6.1 Create `server/src/db/seed.ts` with `runSeed(db: AppDatabase)` function
  - [x] 6.2 Check if any user with `role = 'owner'` exists. If yes, skip seeding entirely.
  - [x] 6.3 Read `OWNER_USERNAME` and `OWNER_PASSWORD` from environment variables
  - [x] 6.4 If env vars missing, log warning and skip owner creation (server runs without owner for now)
  - [x] 6.5 Hash owner password with bcrypt, insert owner user with `role = 'owner'`
  - [x] 6.6 Seed default channels: insert `#general` (type: text) and `Gaming` (type: voice) into channels table
  - [x] 6.7 Log operational events: "Owner account created", "Default channels seeded", or "Seeding skipped — owner already exists"
  - [x] 6.8 Call `runSeed(app.db)` in `server/src/index.ts` AFTER migrations but BEFORE listening
  - [x] 6.9 Add `OWNER_USERNAME` and `OWNER_PASSWORD` to `.env.example`

- [x] Task 7: Register plugins in app.ts (AC: all)
  - [x] 7.1 Import and register auth middleware plugin in `app.ts` after db plugin
  - [x] 7.2 Import and register auth routes plugin (public routes)
  - [x] 7.3 Import and register invite routes plugin (mixed public/protected)
  - [x] 7.4 Auth middleware should apply globally but skip: `/api/auth/login`, `/api/auth/register`, `/api/invites/:token/validate`, `/api/health`
  - [x] 7.5 Ensure plugin registration order: db → auth middleware → auth routes → invite routes

- [x] Task 8: Add server name configuration (AC: 4)
  - [x] 8.1 Add `SERVER_NAME` environment variable (default: "discord_clone")
  - [x] 8.2 Use in invite validation response so client can display server name during registration
  - [x] 8.3 Add to `.env.example`

- [x] Task 9: Write server-side tests (AC: 1-8)
  - [x] 9.1 Create `server/src/plugins/auth/authService.test.ts` (7 tests)
  - [x] 9.2 Create `server/src/plugins/auth/authRoutes.test.ts` (10 tests)
  - [x] 9.3 Create `server/src/plugins/invites/inviteRoutes.test.ts` (10 tests)
  - [x] 9.4 Create `server/src/db/seed.test.ts` (4 tests)
  - [x] 9.5 Update `server/src/app.test.ts` for new plugin registration — existing tests pass unmodified
  - [x] 9.6 All tests use in-memory SQLite via `createDatabase(':memory:')` — follow pattern from story 1-2

- [x] Task 10: Final verification (AC: 1-8)
  - [x] 10.1 Run `npm run dev -w server` — N/A for automated dev, seed tested via unit tests
  - [x] 10.2 Test full flow manually — covered by integration tests (register with invite, login, create/revoke invites)
  - [x] 10.3 Run `npm test -w server` — all 57 tests pass (24 existing + 31 new)
  - [x] 10.4 Run `npm run lint` — no lint errors
  - [x] 10.5 Verify no passwords, tokens, or sensitive data appear in log output — only operational messages logged

## Dev Notes

### Critical Technology Versions (February 2026)

| Package | Version | Install Location | Notes |
|---------|---------|-----------------|-------|
| bcrypt | 6.0.0 | server dependency | Native C++ addon; ~3x faster than bcryptjs. Requires Node.js 20+. Uses prebuildify (not node-pre-gyp). |
| @types/bcrypt | ^5.0.2 | server devDependency | TypeScript types for bcrypt |
| jsonwebtoken | 9.0.3 | server dependency | Standard JWT library. CVE-2022-23529 fixed in 9.0.0. |
| @types/jsonwebtoken | latest | server devDependency | TypeScript types for jsonwebtoken |

**Fallback:** If bcrypt native compilation fails (CI/Docker), use `bcryptjs@^3.0.3` (pure JS, ESM-compatible as of v3.0). Same API, ~3x slower, but irrelevant for 20-user scale.

**bcrypt critical notes:**
- Passwords longer than 72 bytes are silently truncated — this is a bcrypt algorithm limitation. Validate max password length before hashing.
- Use cost factor 12 (architecture doc says "appropriate cost factor"). Cost 12 takes ~250ms on modern hardware — acceptable for a 20-user server.

### Server First-Run Initialization Pattern

```typescript
// server/src/db/seed.ts
import { eq } from 'drizzle-orm';
import { users, channels } from './schema.js';
import { hashPassword } from '../plugins/auth/authService.js';
import type { AppDatabase } from './connection.js';

export async function runSeed(db: AppDatabase): Promise<void> {
  // Check if owner already exists
  const existingOwner = db.select().from(users).where(eq(users.role, 'owner')).get();
  if (existingOwner) return; // Skip — already seeded

  const ownerUsername = process.env.OWNER_USERNAME;
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerUsername || !ownerPassword) {
    // Log warning but don't crash — server can run without owner
    return;
  }

  const passwordHash = await hashPassword(ownerPassword);
  db.insert(users).values({
    username: ownerUsername,
    password_hash: passwordHash,
    role: 'owner',
  }).run();

  // Seed default channels
  db.insert(channels).values([
    { name: 'general', type: 'text' },
    { name: 'Gaming', type: 'voice' },
  ]).run();
}
```

**CRITICAL:** `runSeed` is async because bcrypt hashing is async. Update `server/src/index.ts` startup accordingly:
```typescript
runMigrations(app.db);
await runSeed(app.db);
await app.listen({ port: PORT, host: HOST });
```

### Auth Middleware Pattern

```typescript
// server/src/plugins/auth/authMiddleware.ts
import fp from 'fastify-plugin';
import { verifyAccessToken } from './authService.js';

// Routes that skip auth
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/health',
];
// Routes with dynamic segments that skip auth
const PUBLIC_ROUTE_PATTERNS = [
  /^\/api\/invites\/[^/]+\/validate$/,
];

export default fp(async (fastify) => {
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0]; // Strip query params
    if (PUBLIC_ROUTES.includes(url)) return;
    if (PUBLIC_ROUTE_PATTERNS.some(p => p.test(url))) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }

    try {
      const token = authHeader.slice(7);
      const payload = verifyAccessToken(token);
      request.user = { userId: payload.userId, role: payload.role };
    } catch {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
      });
    }
  });
}, { name: 'auth-middleware' });

// Type augmentation
declare module 'fastify' {
  interface FastifyRequest {
    user: { userId: string; role: string } | null;
  }
}
```

### Invite Token Generation

Use `crypto.randomBytes(32).toString('base64url')` — produces a 43-character URL-safe string with 256 bits of entropy. Do NOT use `crypto.randomUUID()` for invite tokens (only 122 bits, dashes in URLs).

```typescript
import crypto from 'node:crypto';

function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
  // Example: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
}
```

### Registration Endpoint Pattern

```typescript
// POST /api/auth/register — PUBLIC (no auth required)
{
  body: { username: string, password: string, inviteToken: string }
  // 1. Validate invite token
  // 2. Check username uniqueness
  // 3. Check bans (lightweight — see note below)
  // 4. Hash password
  // 5. Insert user
  // 6. Return user data (no token — login is story 1-4)
}
```

**Ban check on registration:** The AC says "Given I am a banned user When I try to create a new account Then registration is blocked." Bans are stored by `user_id`, not username. A banned user creating a NEW account would have a different user_id. The realistic enforcement here is limited — you can check if the username matches a banned user's username as a basic check. Full ban enforcement (IP-based, device fingerprint, etc.) is out of MVP scope. Implement a username-based check and document the limitation.

### Login Endpoint — Minimal for This Story

```typescript
// POST /api/auth/login — PUBLIC (no auth required)
// Returns ONLY an access token (no refresh token, no session storage)
// Full session management is story 1-4
{
  body: { username: string, password: string }
  response: { data: { accessToken: string, user: { id, username, role } } }
}
```

This minimal login exists so the owner can authenticate to create/manage invites. Story 1-4 will extend this with:
- Refresh tokens (stored hashed in sessions table)
- Session management
- Token refresh endpoint
- Electron safeStorage integration
- Full logout

### API Response Envelope — Mandatory

All responses MUST use the project envelope format:
```typescript
// Success
{ data: { ... } }         // 200, 201
// List
{ data: [...], count: n }  // 200
// Error
{ error: { code: "ERROR_CODE", message: "Human readable" } }  // 4xx, 5xx
// No content
// (empty body)            // 204
```

### Fastify JSON Schema Validation

Use Fastify's built-in schema validation for request bodies:
```typescript
app.post('/api/auth/register', {
  schema: {
    body: {
      type: 'object',
      required: ['username', 'password', 'inviteToken'],
      properties: {
        username: { type: 'string', minLength: 1, maxLength: 32 },
        password: { type: 'string', minLength: 8, maxLength: 72 },
        inviteToken: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  },
}, handler);
```

**Password max length 72:** bcrypt truncates at 72 bytes. Enforce this limit at the API level so users know their full password is being used.

### Testing Pattern — Follow Story 1-2

```typescript
// Test setup: build full app with in-memory DB
import { buildApp } from '../../app.js';

let app: FastifyInstance;

beforeEach(async () => {
  // buildApp() creates in-memory DB, registers all plugins
  // Need to seed owner + run migrations for invite/auth tests
  app = await buildApp();
  // Seed test data as needed
});

afterEach(async () => {
  await app.close();
});

// Use Fastify inject() for route testing
const response = await app.inject({
  method: 'POST',
  url: '/api/auth/register',
  payload: { username: 'jordan', password: 'password123', inviteToken: validToken },
});
expect(response.statusCode).toBe(201);
```

**IMPORTANT:** For tests that need an authenticated owner, generate a JWT token directly via `authService.generateAccessToken()` — don't call the login endpoint in every test. This makes tests faster and more isolated.

### Environment Variables (add to .env.example)

```env
# Owner Account (first-run initialization)
OWNER_USERNAME=admin
OWNER_PASSWORD=change-me-strong-password

# JWT Secrets (already exists from story 1-1)
JWT_ACCESS_SECRET=change-me-access-secret

# Server Identity
SERVER_NAME=My Server
```

### Project Structure Notes

New files to create:
```
server/src/plugins/auth/
  authService.ts          # Password hashing, JWT sign/verify
  authService.test.ts     # Unit tests for auth utilities
  authMiddleware.ts       # JWT verification onRequest hook
  authRoutes.ts           # POST /api/auth/register, /api/auth/login
  authRoutes.test.ts      # Integration tests for auth endpoints

server/src/plugins/invites/
  inviteService.ts        # Invite CRUD business logic
  inviteRoutes.ts         # POST/GET/DELETE /api/invites
  inviteRoutes.test.ts    # Integration tests for invite endpoints

server/src/db/
  seed.ts                 # First-run owner + channel seeding
  seed.test.ts            # Seeding tests
```

Modified files:
```
server/src/app.ts         # Register auth middleware, auth routes, invite routes
server/src/index.ts       # Add seed call after migrations
server/package.json       # Add bcrypt, jsonwebtoken deps
.env.example              # Add OWNER_USERNAME, OWNER_PASSWORD, SERVER_NAME
package-lock.json         # Updated from new deps
```

### Alignment with Architecture Doc

- `server/src/plugins/auth/` matches architecture file structure exactly [Source: architecture.md#File-Structure]
- `server/src/plugins/invites/` matches architecture file structure exactly [Source: architecture.md#File-Structure]
- Auth middleware skips `/api/auth/login`, `/api/auth/register`, `/api/invites/:token/validate` per architecture spec [Source: architecture.md#Architectural-Boundaries]
- API response envelope `{ data }` / `{ error: { code, message } }` per project-context.md [Source: project-context.md#Code-Quality]
- Plugin registration via fastify-plugin per story 1-2 pattern [Source: 1-2 story#Fastify-Plugin-Pattern]
- Pino logger only — no `console.log` [Source: project-context.md#Critical-Rules]
- Co-located test files per project convention [Source: project-context.md#Testing-Rules]

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-1-project-foundation-user-authentication.md#Story-1.3] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication-Security] — JWT + bcrypt + invite flow decisions
- [Source: _bmad-output/planning-artifacts/architecture.md#File-Structure] — plugins/auth/, plugins/invites/ directory structure
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural-Boundaries] — Public routes, auth middleware rules
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-1] — Onboarding flow, registration screen spec
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#AccountCreation] — Registration component anatomy and states
- [Source: _bmad-output/planning-artifacts/prd.md#FR1-FR9] — Functional requirements for auth and invites
- [Source: _bmad-output/project-context.md] — API envelope, error handling, naming conventions, testing rules
- [Source: _bmad-output/implementation-artifacts/1-2-database-schema-and-core-server-configuration.md] — DB schema, Drizzle patterns, Fastify plugin pattern, testing patterns
- [Source: _bmad-output/implementation-artifacts/1-1-project-scaffold-and-monorepo-setup.md] — ESM imports (.js extensions), monorepo workspace patterns, existing project structure

### Previous Story (1-2) Intelligence

**Key learnings from story 1-2 that apply to this story:**

- Drizzle ORM uses `.returning().get()` for inserts that need the returned row (e.g., after inserting a user, get the full record back).
- `buildApp()` is async — use `await` when calling in tests.
- In-memory SQLite databases (`:memory:`) work for test isolation. Create fresh DB per test via the app factory.
- `fastify-plugin` wrapper is required for plugins that need to share decorators (like `app.db` and `request.user`) across plugin boundaries.
- Server uses ESM (`"type": "module"`) — all local imports need `.js` extensions.
- `dist/` excluded from vitest to prevent stale compiled test files from running.
- Foreign keys are enforced via `PRAGMA foreign_keys = ON` on every connection (including test DBs).
- DB plugin registers with `{ name: 'db' }` — follow same pattern for auth middleware: `{ name: 'auth-middleware' }`.
- Health endpoint returns 503 with error envelope when DB is unreachable — follow same error pattern for auth failures.

### Git Intelligence

Recent commits show a pattern of: implement story → code review → fix issues (often 2 rounds). Latest commits:
- `9285efc` Fix 9 code review issues for story 1-2
- `752a510` Write story 1-2
- `cae8742` Fix TS2503 JSX namespace errors for @types/react v19

Key takeaway: Code review will likely find 5-10 issues. Write clean code from the start. Pay attention to:
- TypeScript strict mode compliance (no `any` types)
- Proper test cleanup (`afterEach` closing app)
- Error envelope format consistency
- Co-located test files
- ESM import extensions (.js)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Initial test run: 1 failure — ban check on registration ran after username uniqueness check, causing 409 instead of 403. Fixed by reordering checks (ban check before username uniqueness) in authRoutes.ts.

### Completion Notes List

- Implemented auth service with bcrypt (cost factor 12) password hashing and JWT (15min expiry) token generation/verification
- Implemented auth middleware as Fastify onRequest hook with public route whitelist (login, register, invite validate, health)
- Implemented registration endpoint with invite validation, ban check, username uniqueness, and password hashing
- Implemented minimal login endpoint (access token only — full session management deferred to story 1-4)
- Implemented invite service with crypto.randomBytes(32) for 256-bit entropy tokens
- Implemented invite routes: create (owner-only), revoke (owner-only), validate (public), list (owner-only)
- Implemented first-run seed: creates owner account from env vars + default channels (#general text, Gaming voice)
- Updated app.ts plugin registration order: db → auth middleware → auth routes → invite routes
- Updated index.ts to call runSeed after migrations but before listen
- Added OWNER_USERNAME, OWNER_PASSWORD, SERVER_NAME to .env.example
- All 57 tests pass (7 test files), lint clean, TypeScript clean

### Change Log

- 2026-02-24: Implemented story 1-3 — User Registration & Invite System (all 10 tasks complete)

### File List

New files:
- server/src/plugins/auth/authService.ts
- server/src/plugins/auth/authService.test.ts
- server/src/plugins/auth/authMiddleware.ts
- server/src/plugins/auth/authRoutes.ts
- server/src/plugins/auth/authRoutes.test.ts
- server/src/plugins/invites/inviteService.ts
- server/src/plugins/invites/inviteRoutes.ts
- server/src/plugins/invites/inviteRoutes.test.ts
- server/src/db/seed.ts
- server/src/db/seed.test.ts

Modified files:
- server/src/app.ts (registered auth middleware, auth routes, invite routes plugins)
- server/src/index.ts (added runSeed call after migrations)
- server/package.json (added bcrypt, jsonwebtoken, @types/bcrypt, @types/jsonwebtoken)
- .env.example (added OWNER_USERNAME, OWNER_PASSWORD, SERVER_NAME)
- package-lock.json (updated from new dependencies)
