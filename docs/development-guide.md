# Development Guide

**Generated:** 2026-02-26 | **Scan Level:** Exhaustive

## Prerequisites

- **Node.js** 18+ (20 recommended — matches Docker/CI)
- **npm** 9+ (workspaces support)
- **Python 3** (required for mediasoup native C++ worker compilation)
- **C++ build tools** (required for `better-sqlite3` and `mediasoup` native modules)
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential python3 make g++`
  - Windows: Visual Studio Build Tools
- **Docker & Docker Compose** (optional — only needed for TURN server in dev, required for production)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/AidenWoodside/discord_clone.git
cd discord_clone

# Install all workspace dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env to set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET

# Start both client and server in dev mode
npm run dev
```

The server starts on `http://localhost:3000` and the Electron client opens with hot-module reloading.

## Environment Setup

### Required Variables

| Variable | Default | Must Change? | Description |
|----------|---------|-------------|-------------|
| `JWT_ACCESS_SECRET` | `change-me-access-secret` | **Yes** | Access token signing key |
| `JWT_REFRESH_SECRET` | `change-me-refresh-secret` | **Yes** | Refresh token signing key |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `NODE_ENV` | `development` | `development` enables pino-pretty logging |
| `DATABASE_PATH` | `./data/discord_clone.db` | SQLite database file |
| `GROUP_ENCRYPTION_KEY` | (auto-generated) | Base64 32-byte key, auto-created on first server start |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allowed origin |
| `SERVER_NAME` | `discord_clone` | Server name shown in invites |
| `MEDIASOUP_LISTEN_IP` | `0.0.0.0` | mediasoup RTP listen IP |
| `MEDIASOUP_ANNOUNCED_IP` | `127.0.0.1` | IP announced to WebRTC clients |
| `MEDIASOUP_MIN_PORT` | `40000` | RTP port range start |
| `MEDIASOUP_MAX_PORT` | `49999` | RTP port range end |
| `TURN_HOST` | `127.0.0.1` | TURN server IP |
| `TURN_PORT` | `3478` | TURN server port |
| `TURN_SECRET` | `change-me-turn-secret` | TURN shared secret (empty = STUN-only) |

### Voice Chat in Development

For voice to work in dev, you need a TURN server:

```bash
# Start coturn via Docker
docker compose -f docker-compose.dev.yml up -d

# Or run without TURN (works only on localhost/same network)
# Just leave TURN_SECRET empty in .env
```

## NPM Scripts

### Root (Monorepo)

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `concurrently client+server` | Start both in dev mode |
| `npm run dev:client` | `npm run dev -w client` | Electron dev only |
| `npm run dev:server` | `npm run dev -w server` | Server dev only (tsx watch) |
| `npm run build` | shared → server → client | Full production build |
| `npm test` | shared → server → client | Run all test suites |
| `npm run lint` | `eslint .` | Lint entire monorepo |
| `npm run format` | `prettier --write` | Format all files |

### Server

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev -w server` | `tsx watch src/index.ts` | Dev with hot reload |
| `npm run build -w server` | `tsc` | Compile TypeScript |
| `npm run start -w server` | `node dist/index.js` | Production start |
| `npm test -w server` | `vitest run` | Run tests once |
| `npm run test:watch -w server` | `vitest` | Tests in watch mode |
| `npm run db:generate -w server` | `drizzle-kit generate` | Generate migration from schema changes |
| `npm run db:migrate -w server` | `drizzle-kit migrate` | Apply pending migrations |
| `npm run db:push -w server` | `drizzle-kit push` | Push schema directly (dev only) |
| `npm run db:studio -w server` | `drizzle-kit studio` | Open Drizzle Studio GUI |

### Client

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev -w client` | `electron-vite dev` | Electron + Vite HMR |
| `npm run build -w client` | `electron-vite build` | Build for packaging |
| `npm run preview -w client` | `electron-vite preview` | Preview built app |
| `npm test -w client` | `vitest run` | Run tests once |

## Build Order

The shared package must be built first — both client and server depend on it:

```
shared → server → client
```

This is enforced in:
- `npm run build` script (sequential)
- `npm test` script (sequential)
- CI pipeline (`ci.yml`: build shared first, then lint, then test each workspace)

## Database Management

### SQLite Location

- **Development:** `./data/discord_clone.db` (auto-created on first run)
- **Testing:** `:memory:` (in-memory, no file)
- **Docker:** `/app/data/discord_clone.db` (mapped to `./data/sqlite/` on host)

### Schema Changes

1. Edit `server/src/db/schema.ts`
2. Generate migration: `npm run db:generate -w server`
3. Review generated SQL in `server/drizzle/`
4. Apply migration: `npm run db:migrate -w server`
5. (Or push directly in dev: `npm run db:push -w server`)

### Reset Database

```bash
# Delete the database file (dev only)
rm -rf data/discord_clone.db

# Restart server — it will auto-migrate and seed
npm run dev:server
```

### Inspect Database

```bash
# Open Drizzle Studio (web UI)
npm run db:studio -w server

# Or use sqlite3 CLI
sqlite3 data/discord_clone.db ".tables"
```

## Testing

### Test Infrastructure

| Workspace | Runner | Environment | Coverage |
|-----------|--------|-------------|----------|
| shared | Vitest 4.0 | Node.js | Constants verification |
| server | Vitest 4.0 | Node.js | 22 test files + 4 privacy tests |
| client | Vitest 4.0 | jsdom | 44 test files |

### Running Tests

```bash
# All workspaces
npm test

# Individual workspace
npm test -w server
npm test -w client
npm test -w shared

# Watch mode (individual workspace only)
npm run test:watch -w server
npm run test:watch -w client
```

### Server Test Patterns

- **Integration tests:** Use `setupApp()` helper which builds a full Fastify instance with in-memory SQLite
- **Test helpers:** `seedOwner()`, `seedRegularUser()`, `seedUserWithSession()`, `seedInvite()`
- **WebSocket tests:** Use Fastify's `injectWS()` for real WebSocket testing
- **mediasoup tests:** Mock mediasoup Worker/Router (C++ subprocess not needed in tests)
- **Privacy tests:** CORS restriction, zero telemetry deps, no outbound requests, log redaction

### Client Test Patterns

- **Component tests:** `@testing-library/react` with `render()`, `screen`, `userEvent`
- **Store tests:** Direct Zustand store manipulation via `getState()` and `setState()`
- **Service tests:** Module-level mocking via `vi.mock()`, global object mocking for browser APIs
- **Setup file:** `vitest.setup.ts` imports jest-dom matchers, polyfills `ResizeObserver`

## Code Style

### ESLint Rules

- `no-explicit-any`: **error** (strict — use `unknown` instead)
- `no-console`: **error** (server only — use Fastify's Pino logger)
- `react-hooks/rules-of-hooks`: error
- `react-hooks/exhaustive-deps`: warn
- `no-unused-vars`: warn (ignores `_`-prefixed args)

### Prettier

- Semicolons, single quotes, 100-char lines, 2-space indent, ES5 trailing commas

### TypeScript

- Strict mode enabled globally
- ES2022 target, bundler module resolution
- `isolatedModules: true` (Vite compatibility)

## Common Development Tasks

### Add a New REST Endpoint

1. Create route handler in `server/src/plugins/{domain}/{domain}Routes.ts`
2. Create service function in `server/src/plugins/{domain}/{domain}Service.ts`
3. Register routes in `server/src/app.ts` (follow existing registration order)
4. Add tests in `*.test.ts` alongside the source files
5. If needed, add shared types to `shared/src/types.ts`

### Add a New WebSocket Message Type

1. Add the type constant to `WS_TYPES` in `shared/src/ws-messages.ts`
2. Define payload interface in the same file
3. Add handler in the appropriate `*WsHandler.ts` (server)
4. Register handler in `server/src/app.ts` (via the WS handler registration)
5. Add client-side handling in `client/src/renderer/src/services/wsClient.ts`
6. Rebuild shared: `npm run build -w shared`

### Add a New Database Table

1. Define table in `server/src/db/schema.ts` using Drizzle's SQLite column builders
2. Generate migration: `npm run db:generate -w server`
3. Review SQL in `server/drizzle/`
4. Apply: `npm run db:migrate -w server`
5. Add shared types if needed in `shared/src/types.ts`

### Add a New React Component

1. Create in appropriate feature directory: `client/src/renderer/src/features/{feature}/`
2. Use functional component with TypeScript props interface
3. Style with Tailwind CSS utility classes (use existing color tokens from `globals.css`)
4. Add test file alongside: `ComponentName.test.tsx`
5. Use existing UI primitives from `components/` (Button, Modal, Input, etc.)

### Add a New Zustand Store

1. Create in `client/src/renderer/src/stores/use{Name}Store.ts`
2. Follow pattern: `export const use{Name}Store = create<{Name}State>((set, get) => ({ ... }))`
3. Access in components via selectors: `const value = use{Name}Store((s) => s.field)`
4. Access in services via: `use{Name}Store.getState()`
5. Add test file: `use{Name}Store.test.ts`

## Deployment

### Production Setup (EC2)

```bash
# Run interactive setup script
chmod +x scripts/setup.sh
./scripts/setup.sh

# Start coturn (runs outside Swarm — needs host networking)
docker compose -f docker-compose.coturn.yml up -d

# Deploy the Swarm stack
docker stack deploy -c docker-compose.yml --with-registry-auth discord-clone

# Check logs
docker service logs -f discord-clone_app
```

The `scripts/setup.sh` script:
- Generates cryptographic secrets (JWT, TURN)
- Configures nginx, TURN, and .env for your domain
- Obtains initial TLS certificate via Let's Encrypt
- Creates data directories

### Release Process

Releases are fully automated via [release-please](https://github.com/googleapis/release-please).

1. Create a feature branch and make changes
2. Open a PR to `main` — the title **must** follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by CI)
   - `fix: ...` — patch version bump
   - `feat: ...` — minor version bump
   - `feat!: ...` or `BREAKING CHANGE:` — major version bump
   - `chore:`, `ci:`, `docs:`, `deps:`, `refactor:`, `test:`, `perf:`, `revert:` — no version bump on their own
3. Merge the PR into `main`
4. release-please automatically opens/updates a **Release PR** that bumps `package.json` and updates `CHANGELOG.md`
5. When ready to release, merge the Release PR — this creates a `v*` tag
6. The `release.yml` workflow triggers automatically and:
   - Validates tag matches `package.json` version
   - Builds Electron app for macOS, Windows, Linux
   - Builds and pushes the server Docker image
   - Publishes to GitHub Releases
   - Deploys server to EC2 (with rollback on failure)
   - Uploads desktop installers to S3 for landing page downloads

> **Note:** Never manually bump versions in `package.json` or create `v*` tags — release-please handles both.

### Docker Services (Production)

| Service | Port | Purpose |
|---------|------|---------|
| app | 3000 | Node.js API + WebSocket |
| coturn | 3478 + 49152-49252 | TURN/STUN relay |
| nginx | 80, 443 | TLS termination, reverse proxy |
| certbot | — | Auto-renewing TLS certs (every 12h) |

All services use `network_mode: host` for mediasoup UDP port compatibility.

## CI/CD Pipeline

### Pull Request (`ci.yml`)

Triggered on PRs to `main`. Must pass before merge:
1. **lint-pr-title** — validates PR title follows Conventional Commits format
2. Install dependencies
3. Build shared
4. Lint (entire monorepo)
5. Test shared → server → client
6. Build server + client (verify compilation)

### Release Please (`release-please.yml`)

Triggered on every push to `main`:
- Parses Conventional Commit messages since the last release
- Opens or updates a Release PR with version bump and changelog
- On merge, creates the `v*` tag that triggers the release workflow

### Release (`release.yml`)

Triggered on `v*` tags (created by release-please):
1. **validate-version** — tag matches `package.json` version
2. **detect-changes** — determines which components changed since the previous tag
3. **build-electron** — matrix build (macOS + Windows + Linux), conditional on client changes
4. **build-server-image** — Docker image build + push to GHCR, conditional on server changes
5. **publish-release** — publish draft GitHub Release + upload installers to S3
6. **deploy-server** — deploy via SSM to EC2 with health check
