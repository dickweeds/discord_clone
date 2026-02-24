# Epic 6: Desktop App Polish & Production Deployment

The app is production-ready with auto-updates, graceful connection handling, zero telemetry, zero content logging, Docker Compose deployment, CI/CD pipeline, and the invite landing page for new users.

## Story 6.1: Connection Resilience & Error Handling

As a user,
I want clear feedback when the server is unreachable and automatic reconnection when it comes back,
So that I understand what's happening and don't lose my place.

**Acceptance Criteria:**

**Given** the server becomes unreachable
**When** the client detects the disconnection
**Then** a banner appears at the top of the content area: "Can't connect to server. Trying to reconnect..."
**And** the banner shows a subtle pulsing animation indicating active retry
**And** the banner does NOT block interaction with cached content

**Given** the connection is lost
**When** the client attempts to reconnect
**Then** reconnection uses exponential backoff (1s, 2s, 4s, 8s, max 30s)

**Given** reconnection succeeds
**When** the server comes back online
**Then** a brief green "Connected" flash appears and auto-dismisses after 2 seconds
**And** text and presence state is synced

**Given** reconnection fails after extended attempts
**When** the maximum backoff is reached
**Then** the banner updates to: "Can't connect to server. Check your connection or contact the server owner."
**And** reconnection attempts continue at 30s intervals

**Given** the user is in a voice channel when disconnection occurs
**When** voice/WebRTC drops
**Then** voice must be manually rejoined — no automatic voice reconnect
**And** the voice status bar reflects the disconnected state

## Story 6.2: Auto-Update System

As a user,
I want the app to check for updates and let me install them easily,
So that I always have the latest features and fixes without manual effort.

**Acceptance Criteria:**

**Given** a new version is published to GitHub Releases
**When** the app checks for updates on startup
**Then** a notification appears informing me that an update is available

**Given** I see an update notification
**When** I choose to install the update
**Then** the update downloads in the background
**And** I can continue using the app during download
**And** the update is applied on next app restart

**Given** electron-updater is configured
**When** the app starts
**Then** it checks GitHub Releases for the latest version
**And** compares it against the current installed version

**Given** no update is available
**When** the check completes
**Then** no notification is shown — the app proceeds normally

## Story 6.3: Privacy Enforcement & Zero Telemetry

As a user,
I want absolute assurance that no usage data is collected and no message content is logged,
So that my privacy is guaranteed by design.

**Acceptance Criteria:**

**Given** the app is running
**When** I use any feature
**Then** zero usage telemetry or analytics data is collected
**And** no analytics libraries are included in the build
**And** no outbound network requests are made to third-party services

**Given** the server processes messages
**When** content flows through the system
**Then** zero persistent logs of communication content are maintained
**And** Pino logger is configured to exclude message payloads
**And** only operational events (connections, errors, auth) are logged

**Given** the Electron app configuration
**When** the app is built
**Then** Chromium telemetry and crash reporting are disabled
**And** no usage data leaves the user's machine

## Story 6.4: Production Deployment Infrastructure

As the server owner (Aiden),
I want a Docker Compose setup with Nginx, TLS, and an invite landing page,
So that I can deploy the server securely on my EC2 instance and friends can discover the app via invite links.

**Acceptance Criteria:**

**Given** the docker-compose.yml configuration
**When** I run `docker compose up -d`
**Then** three containers start: app (Fastify + mediasoup), coturn (TURN/STUN), nginx (reverse proxy)
**And** all containers have `restart: unless-stopped` policy

**Given** Nginx is configured
**When** it receives HTTPS requests
**Then** TLS is terminated using Let's Encrypt certificates
**And** /api/* requests are proxied to Fastify
**And** /ws requests are upgraded to WebSocket and proxied
**And** all other paths serve the invite landing page

**Given** a friend clicks an invite URL in their browser
**When** the landing page loads
**Then** they see the server name, "You've been invited to join" message, and download buttons for Windows, macOS, and Linux
**And** the page attempts to open `discord-clone://invite/TOKEN` for users who already have the app installed

**Given** the custom protocol handler
**When** Electron receives a `discord-clone://invite/TOKEN` URL
**Then** the app opens with the invite token pre-loaded for registration

**Given** Docker volumes are configured
**When** the server restarts
**Then** SQLite database persists via volume mount
**And** TLS certificates persist
**And** coturn configuration persists

## Story 6.5: CI/CD Pipeline & Cross-Platform Distribution

As a developer,
I want automated CI/CD that tests, builds, and releases the Electron app for all platforms,
So that every release is reliable and cross-platform builds are automated.

**Acceptance Criteria:**

**Given** a pull request is opened
**When** the CI pipeline runs
**Then** tests are executed via Vitest
**And** linting passes via ESLint
**And** TypeScript compilation succeeds

**Given** a git tag is pushed
**When** the release pipeline runs
**Then** the Electron app is built for Windows (.exe/.msi), macOS (.dmg), and Linux (.AppImage/.deb)
**And** the builds are published to GitHub Releases
**And** electron-updater can discover and deliver the new version

**Given** the server Dockerfile
**When** the CI builds the server container
**Then** the image is built and can be deployed via Docker Compose

**Given** the release is published
**When** users' apps check for updates
**Then** they detect the new version via the GitHub Releases API
