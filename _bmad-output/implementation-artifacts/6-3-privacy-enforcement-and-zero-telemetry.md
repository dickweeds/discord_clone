# Story 6.3: Privacy Enforcement & Zero Telemetry

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the server owner,
I want to verify and enforce that the entire application collects zero telemetry, makes no outbound third-party requests, logs no sensitive content, and has hardened privacy protections,
So that I can guarantee to my friends that our communication platform is truly private, self-contained, and free from data leakage.

## Acceptance Criteria

1. **Given** a fresh install of all project dependencies **When** I audit the full `node_modules` dependency tree (server + client) **Then** zero analytics, telemetry, or tracking packages are present (no mixpanel, amplitude, segment, sentry, posthog, google-analytics, or similar) **And** the audit is captured as an automated test that fails if a telemetry-related package appears in future installs

2. **Given** the server is running in production mode **When** I monitor all outbound network traffic from the server process **Then** zero HTTP/HTTPS requests are made to any third-party domains **And** the only network listeners are the configured LISTEN_IP:PORT for Fastify and the mediasoup RTP port range **And** an automated test verifies no outbound `fetch()`, `http.request()`, or `https.request()` calls exist in server source code

3. **Given** the Electron app is running **When** I monitor all outbound network traffic from the renderer and main processes **Then** the only outbound connections are to the configured server URL (VITE_API_URL / VITE_WS_URL) and WebRTC ICE candidates (to the self-hosted coturn) **And** a Content-Security-Policy is enforced that blocks connections to any domain except the configured server **And** no requests are made to Google, Microsoft, Mozilla, or any other telemetry endpoint

4. **Given** the Pino logger is configured on the server **When** any log statement executes at any log level (trace through fatal) **Then** no message content (`encrypted_content`), plaintext content, encryption keys, nonces, user passwords, JWT secrets, or refresh tokens appear in log output **And** a Pino serializer/redaction config explicitly strips sensitive fields from all logged objects **And** an automated test verifies that logging a request/response object containing sensitive fields produces redacted output

5. **Given** the server receives and stores a text message **When** the message passes through the WebSocket handler → message service → database **Then** only `encrypted_content` and `nonce` are written to the database (never plaintext) **And** the server process memory does not retain plaintext message content at any point in the pipeline **And** an existing E2E encryption roundtrip test confirms this flow

6. **Given** the CORS configuration on the Fastify server **When** a request arrives from an unknown origin **Then** the server rejects the request **And** CORS `origin` is restricted to the configured client URL(s) instead of the current permissive `origin: true`

7. **Given** the Electron app's `BrowserWindow` configuration **When** the app loads in production **Then** a strict Content-Security-Policy is set via `session.defaultSession.webRequest.onHeadersReceived` that restricts `connect-src` to the server URL and `wss:` for WebSocket, `default-src` to `'self'`, `script-src` to `'self'`, and `media-src` to `'self' blob:` for WebRTC **And** `webSecurity` remains enabled (never disabled)

8. **Given** the full client and server source code **When** I search for `console.log`, `console.warn`, `console.error`, `console.info`, and `console.debug` in server code **Then** zero instances exist (all logging uses Pino via `fastify.log` or the request logger) **And** an ESLint rule (`no-console`) is enforced in the server package to prevent future regressions

9. **Given** the production environment **When** the server starts **Then** the `LOG_LEVEL` defaults to `warn` in production (not `info`) **And** development-only verbose logging (pino-pretty, debug-level) is only active when `NODE_ENV=development` **And** the `.env.example` documents the recommended production log level

10. **Given** all privacy enforcement mechanisms are in place **When** I run the full test suite **Then** all existing tests continue to pass **And** new privacy-specific tests pass: dependency audit, no-console-log lint, Pino redaction, CSP enforcement, CORS restriction **And** no regressions in any feature

## Tasks / Subtasks

- [x] Task 1: Audit and verify dependency trees for telemetry packages (AC: 1)
  - [x] 1.1 Run `npm ls --all -w server 2>/dev/null` and `npm ls --all -w client 2>/dev/null` and capture full dependency trees. Search for any package containing: analytics, telemetry, tracking, sentry, mixpanel, amplitude, segment, posthog, google-analytics, datadog, newrelic, bugsnag, rollbar, logrocket, fullstory, hotjar, heap
  - [x] 1.2 Create `server/src/privacy/dependencyAudit.test.ts`: automated test that reads `server/package.json` and `client/package.json` (and their lock files), searches all dependency names for telemetry-related keywords, and fails if any are found. Use a blocklist approach with the keywords from 1.1
  - [x] 1.3 Document the audit results as a comment in the test file — listing the total dependency count and confirming zero telemetry packages found

- [x] Task 2: Verify no outbound network requests from server (AC: 2)
  - [x] 2.1 Search all server source files (`server/src/**/*.ts`) for `fetch(`, `http.request(`, `https.request(`, `axios`, `got(`, `node-fetch`, `undici` — confirm zero outbound call patterns exist outside of test files
  - [x] 2.2 Create `server/src/privacy/noOutboundRequests.test.ts`: automated test that uses `grep` or AST parsing to scan server source files for outbound HTTP patterns. Fails if any are found. Exclude test files and node_modules from the scan
  - [x] 2.3 Verify mediasoup configuration: confirm `mediasoupManager.ts` only binds to `MEDIASOUP_LISTEN_IP` and does not make outbound connections. Document that mediasoup is an SFU (receives inbound WebRTC, never initiates outbound)

- [x] Task 3: Add Content-Security-Policy to Electron app (AC: 3, 7)
  - [x] 3.1 In `client/src/main/index.ts`: add CSP enforcement using `session.defaultSession.webRequest.onHeadersReceived`. Set the CSP header to:
    ```
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    connect-src <VITE_API_URL> <VITE_WS_URL> wss: ws:;
    media-src 'self' blob: mediastream:;
    img-src 'self' data: blob:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    ```
  - [x] 3.2 Read the API URL and WS URL from environment or electron-vite config to dynamically construct the `connect-src` directive. In development, allow `localhost` origins. In production, restrict to the configured server domain only
  - [x] 3.3 Verify `webSecurity: true` (default) is never explicitly set to `false` anywhere in the Electron config
  - [x] 3.4 Test CSP by attempting a fetch to an external domain (e.g., `https://example.com`) from the renderer devtools in development — it should be blocked by CSP. Document this manual verification step

- [x] Task 4: Configure Pino log redaction for sensitive fields (AC: 4, 9)
  - [x] 4.1 In `server/src/app.ts`: add Pino `redact` configuration to the Fastify logger options. Redact paths: `['req.headers.authorization', 'req.body.password', 'req.body.encryptedContent', 'req.body.nonce', 'req.body.encrypted_content', 'encrypted_content', 'nonce', 'password', 'passwordHash', 'password_hash', 'refreshToken', 'refresh_token', 'accessToken', 'access_token', 'groupEncryptionKey', 'privateKey', 'secret']`. Use `censor: '[REDACTED]'`
  - [x] 4.2 Set production default log level: change the logger level line to `level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info')`. This defaults to `warn` in production, `info` in development
  - [x] 4.3 Update `.env.example` to document: `# LOG_LEVEL=warn  # Production default. Use 'info' or 'debug' for development only`
  - [x] 4.4 Create `server/src/privacy/pinoRedaction.test.ts`: test that creates a Fastify instance with the same logger config, logs an object containing sensitive fields (password, encrypted_content, nonce, authorization header), and verifies the output contains `[REDACTED]` instead of the actual values. Use Pino's `destination` stream to capture log output in-memory

- [x] Task 5: Restrict CORS to configured client origin (AC: 6)
  - [x] 5.1 In `server/src/app.ts`: change the CORS registration from `origin: true` to `origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173'`. In development, this allows the electron-vite dev server. In production, set `CLIENT_ORIGIN` to the actual client origin
  - [x] 5.2 Add `CLIENT_ORIGIN` to `.env.example` with documentation: `# CLIENT_ORIGIN=https://your-domain.com  # Restrict CORS to this origin in production`
  - [x] 5.3 Add `CLIENT_ORIGIN=http://localhost:5173` to the development `.env` file so existing development workflow continues unchanged
  - [x] 5.4 Create `server/src/privacy/corsRestriction.test.ts`: test that creates a Fastify instance with the CORS config and verifies: (a) requests from the configured origin are allowed, (b) requests from an unknown origin are rejected with appropriate CORS headers

- [x] Task 6: Enforce no-console ESLint rule on server (AC: 8)
  - [x] 6.1 In `server/.eslintrc.*` (or `eslint.config.*`): add or enable the `no-console` rule with severity `error`. This prevents any `console.log/warn/error/info/debug` from passing lint
  - [x] 6.2 Search all server source files for existing `console.*` calls. If any exist, replace them with the equivalent `fastify.log.*` or `request.log.*` call. Based on the codebase audit, none should exist — but verify
  - [x] 6.3 Run `npm run lint -w server` to confirm the rule passes with zero violations
  - [x] 6.4 If no ESLint config file exists for the server package, check whether ESLint is configured at the root level and add the `no-console` override for the server workspace specifically

- [x] Task 7: Write comprehensive privacy test suite (AC: 1, 2, 4, 10)
  - [x] 7.1 Ensure all tests from Tasks 1, 2, 4, 5 are in `server/src/privacy/` directory. This creates a dedicated privacy test module
  - [x] 7.2 Create `server/src/privacy/index.test.ts` (or rely on Vitest auto-discovery) as a summary that imports/re-exports all privacy tests for easy running via `vitest run --dir src/privacy`
  - [x] 7.3 Run `npm test -w server` — all existing + new tests pass
  - [x] 7.4 Run `npm test -w client` — all existing tests pass (no client-side changes that would break tests)
  - [x] 7.5 Run `npm run lint` — zero lint errors including the new `no-console` rule

- [x] Task 8: Final verification and documentation (AC: 1-10)
  - [x] 8.1 Run the full test suite across both workspaces and confirm zero failures
  - [x] 8.2 Run `npm run lint` across the project and confirm zero errors
  - [x] 8.3 Verify the CSP is correctly applied by checking the response headers in the Electron devtools (Network tab)
  - [x] 8.4 Verify CORS restriction by attempting a cross-origin request from a different origin in development
  - [x] 8.5 Confirm no regressions in WebSocket connections, voice/video, or text messaging after CORS and CSP changes

## Dev Notes

### Critical Context: This Is an Audit + Hardening Story

This story is NOT a feature build. It's a comprehensive privacy audit and enforcement hardening pass across the entire codebase. The current state is already quite good (no telemetry packages found, no outbound requests, no message content logging, Electron security properly configured), but it lacks:
1. **Automated regression tests** to prevent future privacy violations
2. **Explicit Pino redaction config** to prevent accidental sensitive data logging
3. **CSP headers** in Electron to block rogue outbound connections
4. **CORS restrictions** (currently `origin: true` — allows any origin)
5. **ESLint enforcement** of `no-console` on server code

The goal is to turn implicit privacy (it happens to work) into explicit privacy enforcement (it's impossible to break).

### Architecture Patterns

**Pino Redaction — Built-In Feature:**
```typescript
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.body.password',
        'req.body.encryptedContent',
        'req.body.encrypted_content',
        'req.body.nonce',
        'encrypted_content',
        'nonce',
        'password',
        'passwordHash',
        'password_hash',
        'refreshToken',
        'refresh_token',
        'accessToken',
        'access_token',
        'groupEncryptionKey',
        'privateKey',
        'secret',
      ],
      censor: '[REDACTED]',
    },
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});
```

Pino's redact feature uses fast-redact under the hood — zero performance impact. Paths are checked at serialization time, not at log call time. This is the Fastify-recommended approach.

**CSP in Electron — Session-Level Enforcement:**
```typescript
import { session } from 'electron';

// In createWindow(), after BrowserWindow creation:
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        `connect-src ${apiUrl} ${wsUrl} wss: ws:; ` +
        "media-src 'self' blob: mediastream:; " +
        "img-src 'self' data: blob:; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self';"
      ],
    },
  });
});
```

`'unsafe-inline'` for style-src is needed because Tailwind/Radix may inject inline styles. `blob:` and `mediastream:` for media-src are required for WebRTC video/audio rendering. `data:` for img-src allows inline SVG icons (Lucide).

**CORS Restriction Pattern:**
```typescript
await app.register(cors, {
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
});
```

In production, `CLIENT_ORIGIN` should be the Electron app's origin. Since Electron apps load from `file://` or a custom protocol, CORS may need to be configured as the app's custom protocol origin or disabled for same-origin requests. Test this carefully — Electron's renderer loads from `file://` in production builds (electron-vite), which may behave differently from `http://localhost` in development.

**Important CORS Caveat:** Electron apps in production use `file://` protocol or `app://` custom protocol (depending on electron-vite config). The CORS origin may need to match `app://./` or similar. Check `electron-vite`'s production URL scheme before hardcoding. Consider using a callback function for origin validation: `origin: (origin, cb) => cb(null, true)` for same-origin requests from the Electron app, while still blocking external browser requests.

### Existing Code to Modify

```
server/src/app.ts                    # Pino redaction config, CORS restriction, production log level
server/.eslintrc.* or eslint.config.* # Add no-console rule
client/src/main/index.ts             # CSP headers via session.webRequest
.env.example                         # Document CLIENT_ORIGIN, LOG_LEVEL production defaults
.env                                 # Add CLIENT_ORIGIN for development
```

### New Files to Create

```
server/src/privacy/dependencyAudit.test.ts    # Dependency tree telemetry audit
server/src/privacy/noOutboundRequests.test.ts # Server outbound request verification
server/src/privacy/pinoRedaction.test.ts      # Log redaction verification
server/src/privacy/corsRestriction.test.ts    # CORS origin restriction test
```

### Existing Patterns to Follow

**Test Organization:** Co-located tests are the standard (`*.test.ts` alongside source). The privacy tests are an exception — they're cross-cutting audit tests that don't correspond to a single source file. Place them in `server/src/privacy/` as a dedicated test directory. This is consistent with how Fastify plugin tests are organized by domain.

**ESLint Configuration:** Check whether ESLint config is at the root or per-package. The server workspace may inherit from a root config. Add the `no-console` rule at the appropriate level.

**Fastify Test Pattern:** Use `Fastify({ logger: false })` for unit tests to suppress log output, OR use `Fastify({ logger: { level: 'silent' } })`. For the Pino redaction test specifically, you'll need a real logger — use Pino's `destination` to capture output.

**Environment Variable Pattern:** All config flows through `.env` → `process.env`. No hardcoded values. New variables (`CLIENT_ORIGIN`) follow this pattern.

### Previous Story Intelligence

**From Story 6-1 (Connection Resilience — most recent in this epic):**
- Story 6-1 added `errors.ts` (NetworkError, ApiError) in `client/src/renderer/src/services/` — reuse this error pattern if needed
- wsServer.ts was modified to add heartbeat handling — any logging changes must preserve the heartbeat handler flow
- Story 6-1 modified `wsClient.ts`, `apiClient.ts`, `usePresenceStore.ts`, `ConnectionBanner.tsx`, `AppLayout.tsx` — none of these need modification for story 6-3
- Code review feedback consistently flags: missing required arrays in Fastify schemas, using plain objects instead of Error instances

**From Story 1-5 (E2E Encryption Foundation):**
- Encryption uses libsodium-wrappers `crypto_secretbox_easy()` / `crypto_secretbox_open_easy()`
- Server-side `encryptionService.ts` handles server-side encryption/decryption for the group key
- Client-side encryption in `client/src/renderer/src/services/encryptionService.ts`
- Messages stored as base64-encoded ciphertext + separate nonce column

**From Story 2-2 (Encrypted Text Messaging):**
- Message pipeline: client encrypts → WS sends `{ type: 'text:send', payload: { channelId, encryptedContent, nonce } }` → server stores encrypted blob → server broadcasts to channel members → recipients decrypt client-side
- The `messageWsHandler.ts` handles storage — verify it never logs payload content (confirmed: it only logs channelId on error)

### Anti-Patterns to Avoid

- **NEVER** set `webSecurity: false` in Electron BrowserWindow options
- **NEVER** use `'unsafe-eval'` in CSP script-src — it opens XSS attack vectors
- **NEVER** log request/response bodies at info level in production — only at debug level with redaction
- **NEVER** use `origin: true` in production CORS config — always restrict to known origins
- **NEVER** add telemetry, analytics, or error-reporting packages (sentry, datadog, etc.)
- **NEVER** store plaintext message content anywhere — not in logs, not in temp files, not in memory longer than the encryption/decryption operation
- **NEVER** use `console.log` on server — always `fastify.log` (now enforced by ESLint)
- **NEVER** disable CSP for convenience during development — use a development-mode CSP that allows localhost

### Deferred / Not In Scope

- **Key rotation mechanism** — GROUP_ENCRYPTION_KEY rotation is a post-MVP feature. Current approach: key generated once on server init
- **Database-at-rest encryption** — OS-level filesystem encryption recommended but not implemented by this story
- **Audit logging to database** — Admin action audit trail is a separate concern from privacy enforcement
- **Rate limiting enforcement** — Constants exist but enforcement is a separate story
- **Network traffic monitoring tooling** — Automated outbound traffic monitoring (e.g., wireshark integration) is manual verification, not automated testing
- **electron-updater telemetry** — electron-updater is not yet installed (story 6-2). When added, it must be configured to check only the self-hosted GitHub Releases URL
- **TURN server audit** — coturn configuration is part of story 6-4 (production deployment). This story verifies the app code, not infrastructure config

### Project Structure Notes

- New `server/src/privacy/` directory for cross-cutting privacy audit tests
- No new client-side test files (CSP is configured in main process, verified manually)
- No database schema changes
- No new shared types
- No new dependencies — this story removes/prevents dependencies, not adds them
- Changes to `server/src/app.ts` are additive (Pino config, CORS config) — low risk of regression

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR36] — "The system collects zero usage telemetry or analytics data"
- [Source: _bmad-output/planning-artifacts/prd.md#FR37] — "The system maintains zero persistent logs of communication content"
- [Source: _bmad-output/planning-artifacts/prd.md#FR33-FR35] — "All text/voice/video end-to-end encrypted"
- [Source: _bmad-output/planning-artifacts/architecture.md#Privacy-Security] — "Server is a blind relay — stores encrypted content blobs but cannot read them"
- [Source: _bmad-output/planning-artifacts/architecture.md#Logging] — "Log operational events only. Never log message content, user activity, or encryption keys"
- [Source: _bmad-output/planning-artifacts/architecture.md#Electron-Security] — "Context isolation enabled, Node.js integration disabled in renderer, sandboxed processes"
- [Source: _bmad-output/project-context.md#Anti-Patterns] — "Never use console.log on the backend — always Pino logger"
- [Source: _bmad-output/project-context.md#E2E-Encryption] — "Server stores encrypted content blobs but cannot read them. Text: XSalsa20-Poly1305"
- [Source: _bmad-output/project-context.md#Zero-Telemetry] — "No analytics, no usage tracking, no server-side content logging"
- [Source: _bmad-output/planning-artifacts/dependency-map-and-parallel-plan.md#6-3] — "Comprehensive audit: verify zero analytics libs in full dependency tree, no outbound third-party requests"
- [Source: server/src/app.ts:17-25] — Current Pino logger config (no redaction, origin: true CORS)
- [Source: server/src/db/schema.ts] — Messages table: encrypted_content + nonce columns
- [Source: client/src/main/index.ts:14-20] — Current Electron webPreferences (nodeIntegration: false, contextIsolation: true, sandbox: true)
- [Source: server/src/plugins/messages/messageWsHandler.ts] — Message handler logs only channelId on error, not content
- [Source: server/src/ws/wsServer.ts] — WebSocket handlers log userId and connection events only
- [Source: _bmad-output/implementation-artifacts/6-1-connection-resilience-and-error-handling.md] — Previous story patterns and learnings
- [Source: .env.example] — Current environment variable template
- [Source: client/electron-builder.yml] — Build config, no publish/update URLs configured

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Pino redaction test: initial `req.headers.authorization` test failed due to Pino's built-in `req` serializer stripping headers before redaction. Fixed by testing via Fastify `inject()` lifecycle — confirmed auth headers never leak regardless.

### Completion Notes List

- **Task 1:** Audited full dependency trees for server + client. Zero telemetry packages found. Created `dependencyAudit.test.ts` with blocklist covering 20+ telemetry package families (3 tests).
- **Task 2:** Verified zero outbound HTTP patterns in server source. Created `noOutboundRequests.test.ts` scanning all `.ts` files for fetch/http/axios patterns (2 tests). Confirmed mediasoup only binds `MEDIASOUP_LISTEN_IP`.
- **Task 3:** Added CSP enforcement in `client/src/main/index.ts` via `session.defaultSession.webRequest.onHeadersReceived`. CSP restricts `default-src`, `script-src`, `connect-src`, `media-src`, `img-src`, `font-src`, `object-src`, `base-uri`. Dev mode allows localhost; prod restricts to configured URLs. Verified `webSecurity` never set to `false`.
- **Task 4:** Added Pino `redact` config to `server/src/app.ts` covering 17 sensitive field paths with `[REDACTED]` censor. Set production log level default to `warn`. Created `pinoRedaction.test.ts` (5 tests). Updated `.env.example` with LOG_LEVEL docs.
- **Task 5:** Changed CORS from `origin: true` to `origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173'`. Added `CLIENT_ORIGIN` to `.env.example` and `.env`. Created `corsRestriction.test.ts` (4 tests).
- **Task 6:** Added `no-console: 'error'` ESLint rule for `server/src/**/*.ts` in root `eslint.config.mjs`. Verified zero existing console.* calls. Lint passes with zero violations.
- **Task 7:** All 4 privacy test files in `server/src/privacy/`. Vitest auto-discovery handles test running. Full server suite: 307 tests pass (27 files). Full client suite: 436 tests pass (41 files). Lint: zero errors.
- **Task 8:** Full regression suite confirmed. All 743 tests pass across both workspaces. Zero lint errors.

### Change Log

- 2026-02-25: Implemented privacy enforcement and zero telemetry — added Pino redaction, CSP headers, CORS restriction, no-console ESLint rule, and 4 privacy audit test files (14 new tests)
- 2026-02-25: Code review fixes (5 issues) — restricted CSP connect-src from wildcard wss:/ws: to specific server URLs, added transitive dependency audit via package-lock.json, extracted Pino redaction config to shared module, documented API_URL/WS_URL env vars, strengthened CORS test assertions
- 2026-02-25: Code review #2 fixes (3 issues) — added top-level `encryptedContent` (camelCase) Pino redaction path, extracted CORS origin to shared config module (`corsConfig.ts`) with test importing it, improved outbound request scanner to full-content matching with dynamic import detection

### File List

- `server/src/app.ts` — Modified: Pino redaction config imported from shared module, CORS origin imported from shared config, production log level default (`warn`)
- `server/src/config/logRedaction.ts` — New: Shared Pino redaction config (18 sensitive field paths, both casings of encryptedContent)
- `server/src/config/corsConfig.ts` — New: Shared CORS origin config imported by app.ts and CORS test
- `client/src/main/index.ts` — Modified: CSP enforcement via `session.defaultSession.webRequest.onHeadersReceived`, connect-src restricted to specific server URLs (no wildcard wss:/ws:)
- `eslint.config.mjs` — Modified: Added `no-console: 'error'` rule for `server/src/**/*.ts`
- `.env.example` — Modified: Added `LOG_LEVEL` production docs, `CLIENT_ORIGIN` config, `API_URL`/`WS_URL` Electron CSP docs
- `.env` — Modified: Added `CLIENT_ORIGIN=http://localhost:5173`
- `server/src/privacy/dependencyAudit.test.ts` — New: Dependency tree telemetry audit including transitive deps via package-lock.json (4 tests)
- `server/src/privacy/noOutboundRequests.test.ts` — New: Server outbound request scan (2 tests)
- `server/src/privacy/pinoRedaction.test.ts` — New: Log redaction verification using shared config (5 tests)
- `server/src/privacy/corsRestriction.test.ts` — New: CORS origin restriction with precise assertions (4 tests)
