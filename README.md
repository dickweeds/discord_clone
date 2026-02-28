# Discord Clone

A full-featured Discord clone built as a cross-platform desktop application with end-to-end encryption, real-time messaging, and voice/video chat.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 40 |
| Frontend | React 19, TypeScript, Tailwind CSS 4, Radix UI |
| State Management | Zustand |
| Routing | React Router 7 |
| Backend | Fastify 5, Node.js |
| Database | PostgreSQL 15 + Drizzle ORM |
| Real-Time | Native WebSockets, mediasoup (WebRTC SFU) |
| Encryption | libsodium (XSalsa20-Poly1305 for messages, DTLS/SRTP for voice) |
| Auth | JWT (access + refresh tokens), bcrypt |
| Testing | Vitest, React Testing Library |
| Build | electron-vite, electron-builder |

## Project Structure

```
discord_clone/
├── client/           # Electron + React desktop app
│   └── src/
│       ├── main/         # Electron main process
│       ├── preload/      # IPC bridge (context isolation)
│       └── renderer/     # React application
│           ├── components/   # Shared UI components
│           ├── features/     # Feature modules (auth, channels, etc.)
│           ├── services/     # API/WS/encryption clients
│           ├── stores/       # Zustand state stores
│           └── hooks/        # Custom React hooks
├── server/           # Fastify backend API
│   └── src/
│       ├── db/           # Drizzle schema & migrations
│       ├── plugins/      # Fastify domain plugins
│       ├── services/     # Business logic
│       └── ws/           # WebSocket handlers
├── shared/           # Types & constants shared across packages
│   └── src/
│       ├── types.ts      # Domain types (User, Channel, Message, etc.)
│       ├── constants.ts  # Limits, rates, config values
│       └── ws-messages.ts # WebSocket message envelopes
└── .env.example      # Environment variable template
```

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 25 | CI and Docker both use Node 25 |
| **npm** | 9+ | Required for npm workspaces |
| **Docker** | Latest | For PostgreSQL (and optionally coturn) |
| **Python 3** | 3.x | Required to compile mediasoup's C++ worker |
| **C++ Build Tools** | See below | Required to compile mediasoup's C++ worker |

#### Platform-specific C++ build tools

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install -y build-essential python3 make g++
```

**Linux (Fedora/RHEL):**
```bash
sudo dnf groupinstall "Development Tools"
sudo dnf install python3 make gcc-c++
```

**Windows:**

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload. Then from an elevated PowerShell:
```powershell
npm config set msvs_version 2022
```
Alternatively, install via npm:
```powershell
npm install -g windows-build-tools
```

### Installation

```bash
# Clone the repository
git clone https://github.com/AidenWoodside/discord_clone.git
cd discord_clone

# Install dependencies (includes native compilation of mediasoup — takes a few minutes)
npm install

# Copy environment config
cp .env.example .env
```

On Windows (Command Prompt):
```cmd
copy .env.example .env
```

On Windows (PowerShell):
```powershell
Copy-Item .env.example .env
```

### Database Setup

The server requires PostgreSQL. The easiest way to run it locally is with Docker:

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts PostgreSQL 15 on port 5432 with:
- **User:** `discord_clone`
- **Password:** `dev_password`
- **Database:** `discord_clone_dev`

Then set the `DATABASE_URL` in your `.env` file:
```
DATABASE_URL=postgresql://discord_clone:dev_password@localhost:5432/discord_clone_dev
```

To run database migrations on startup, also add:
```
RUN_MIGRATIONS=true
```

To stop PostgreSQL:
```bash
docker compose -f docker-compose.dev.yml down
```

To stop and delete all data:
```bash
docker compose -f docker-compose.dev.yml down -v
```

### Environment Variables

Edit the `.env` file created during installation. The minimum required changes for local development:

| Variable | Required Change | Description |
|----------|----------------|-------------|
| `DATABASE_URL` | Set to Docker Postgres URL above | PostgreSQL connection string |
| `RUN_MIGRATIONS` | Set to `true` | Auto-apply database migrations on server start |
| `JWT_ACCESS_SECRET` | Replace default | Access token signing key (any random string) |
| `JWT_REFRESH_SECRET` | Replace default | Refresh token signing key (any random string) |

Generate secure random secrets:
```bash
# macOS / Linux
openssl rand -hex 32

# Windows (PowerShell)
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

All other variables have sensible defaults for local development. Notable defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `NODE_ENV` | `development` | Enables pretty-printed logs and dev CORS |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin for the Electron dev server |
| `GROUP_ENCRYPTION_KEY` | Auto-generated | Base64-encoded 32-byte key, generated on first server start. Save it to `.env` after first run. |
| `MEDIASOUP_ANNOUNCED_IP` | `127.0.0.1` | WebRTC ICE candidate IP (localhost for dev) |
| `TURN_HOST` | `127.0.0.1` | TURN server host |
| `TURN_SECRET` | `change-me-turn-secret` | TURN shared secret |

### Running

```bash
# Start both client and server in dev mode
npm run dev

# Or start them individually
npm run dev:client    # Electron + React with HMR
npm run dev:server    # Fastify with auto-restart (tsx watch)
```

On first server start, if `GROUP_ENCRYPTION_KEY` is not set in `.env`, one will be auto-generated and printed to stderr. Copy it into your `.env` file to persist it across restarts.

### Building

```bash
# Build all packages (shared -> server -> client)
npm run build

# Package desktop app for your platform
cd client && npm run build
```

### Testing

Tests use PGlite (in-memory PostgreSQL) — no external database required.

```bash
# Run all tests
npm run test

# Run tests for a specific workspace
npm run test -w server
npm run test -w client
npm run test -w shared
```

### Database Management

```bash
# Generate a migration from schema changes
npm run db:generate -w server

# Apply migrations manually
npm run db:migrate -w server

# Push schema directly to database (dev only, skips migration files)
npm run db:push -w server

# Open Drizzle Studio (visual database browser)
npm run db:studio -w server
```

### Linting & Formatting

```bash
npm run lint
npm run format
```

### Voice/Video (Optional)

Voice and video chat uses mediasoup (WebRTC SFU) and optionally a TURN relay server (coturn). For local development, WebRTC typically works without coturn since peers are on the same machine or LAN.

If you need TURN relay support (e.g., testing across NATs), the dev compose file includes coturn:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Ensure `TURN_SECRET` in `.env` matches the coturn configuration in `docker/coturn/turnserver.conf`.

## Architecture

**Monorepo** with three npm workspaces (`client`, `server`, `shared`). The `shared` package is the contract boundary — client and server never import from each other directly.

- **Frontend:** Feature-based organization. Zustand stores for state, service layer for all server communication. Electron runs with context isolation and sandboxing enabled; tokens stored in OS keychain via `safeStorage`.
- **Backend:** Plugin-based Fastify. Each domain (auth, channels, messages, voice) is a plugin. All endpoints under `/api/` with consistent `{ data }` / `{ error }` response envelopes. Pino for structured logging.
- **Real-Time:** WebSocket for text/presence, mediasoup SFU for voice/video via WebRTC.
- **Security:** Messages encrypted client-side before transmission. 15-min access tokens + 7-day refresh tokens. Rate limiting on all endpoints.

## License

This project is for educational purposes.
