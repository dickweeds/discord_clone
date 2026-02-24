# Epic 1: Project Foundation & User Authentication

Users can receive an invite, create an account, log in, and see the Discord-familiar app shell. This establishes the project scaffold (electron-vite + Fastify + shared types monorepo), database schema, E2E encryption key exchange, invite system, and the three-column layout shell.

## Story 1.1: Project Scaffold & Monorepo Setup

As a developer,
I want the project scaffolded with the electron-vite React+TS client, Fastify server, and shared types package in a monorepo workspace,
So that I have a working development environment with all foundational tooling configured.

**Acceptance Criteria:**

**Given** a fresh repository
**When** the scaffold commands are executed
**Then** the monorepo is structured with client/, server/, and shared/ workspaces
**And** root package.json configures npm workspaces

**Given** the client workspace
**When** I run `npm run dev` in client
**Then** the Electron app launches with Vite HMR active in the renderer

**Given** the server workspace
**When** I run `npm run dev` in server
**Then** the Fastify server starts in tsx watch mode

**Given** the root workspace
**When** I run `npm run dev`
**Then** both client and server start concurrently

**Given** the project configuration
**When** I inspect the tooling
**Then** TypeScript strict mode is enabled across all packages
**And** Tailwind CSS is configured in the client with the warm earthy color tokens from the UX spec
**And** Radix UI primitives are installed as dependencies
**And** Vitest is configured for testing
**And** ESLint and Prettier are configured for consistent code style

## Story 1.2: Database Schema & Core Server Configuration

As a developer,
I want the database schema established and core server infrastructure configured,
So that the server can persist data and provide foundational services for all features.

**Acceptance Criteria:**

**Given** the server is initialized
**When** the server starts
**Then** a SQLite database is created via better-sqlite3
**And** Drizzle ORM connects successfully
**And** migrations run automatically on startup

**Given** the database schema
**When** I inspect the tables
**Then** the users table exists with columns: id, username, password_hash, role, public_key, created_at
**And** the sessions table exists with columns: id, user_id, refresh_token_hash, expires_at, created_at
**And** the invites table exists with columns: id, token, created_by, revoked, created_at
**And** the bans table exists with columns: id, user_id, banned_by, created_at
**And** the channels table exists with columns: id, name, type, created_at

**Given** the server is running
**When** I call GET /api/health
**Then** I receive a 200 response with server status information

**Given** the server logging configuration
**When** I inspect Pino setup
**Then** structured JSON logging is configured for operational events only
**And** no message content is ever included in logs

## Story 1.3: User Registration & Invite System

As a new user (Jordan),
I want to create an account using an invite link from the server owner,
So that I can join the server and start communicating with my friends.

**Acceptance Criteria:**

**Given** the server is running for the first time
**When** the server initializes
**Then** an owner account is created via environment-configured credentials
**And** default channels are seeded (e.g., #general text channel, Gaming voice channel)

**Given** I am the server owner
**When** I call POST /api/invites
**Then** a cryptographically random, non-guessable invite token is generated
**And** the invite link is returned

**Given** I am the server owner
**When** I call DELETE /api/invites/:id
**Then** the invite is revoked and can no longer be used for registration

**Given** I have a valid invite token
**When** I call GET /api/invites/:token/validate
**Then** the invite is validated and the server name is returned for display

**Given** I am on the registration screen with a valid invite
**When** I submit a username and password
**Then** my account is created with a bcrypt-hashed password
**And** I am assigned the "user" role
**And** the registration UI shows only username and password fields — no email, phone, or CAPTCHA

**Given** I try to register with an already-taken username
**When** I submit the form
**Then** I see an inline error below the username field: "That username is taken. Try another."

**Given** I try to register with an invalid or revoked invite token
**When** I attempt to access the registration flow
**Then** I see: "This invite is no longer valid. Ask the server owner for a new one."

**Given** I am a banned user
**When** I try to create a new account
**Then** registration is blocked

## Story 1.4: User Login, Logout & Session Management

As a returning user,
I want to log in with my credentials and stay authenticated across app restarts,
So that I can quickly access the platform without re-entering my password every time.

**Acceptance Criteria:**

**Given** I have a valid account
**When** I submit my username and password on the login screen
**Then** I receive a JWT access token (~15min expiry) and a refresh token
**And** tokens are stored securely via Electron safeStorage
**And** I am redirected to the main app interface

**Given** I enter incorrect credentials
**When** I submit the login form
**Then** I see an inline error: "Invalid username or password."

**Given** my access token has expired
**When** I make an API request
**Then** the client automatically refreshes the token using the refresh token
**And** the request proceeds without interruption

**Given** I have a persisted session
**When** I restart the app
**Then** I am automatically logged in without re-entering credentials
**And** the app loads to the last-viewed channel

**Given** I am logged in
**When** I click logout
**Then** my session is invalidated on the server
**And** local tokens are cleared from safeStorage
**And** I am returned to the login screen

**Given** I am a banned user
**When** I attempt to log in
**Then** login is rejected with a clear error message

## Story 1.5: E2E Encryption Foundation

As a user,
I want end-to-end encryption established during my account setup,
So that all my future communications are encrypted and the server cannot read my messages.

**Acceptance Criteria:**

**Given** the server initializes for the first time
**When** the owner account is created
**Then** a group symmetric key is generated using libsodium

**Given** I am registering a new account
**When** my account is created
**Then** an X25519 key pair is generated on my client
**And** my public key is sent to the server
**And** the server encrypts the group key with my public key and stores the encrypted blob

**Given** I log in successfully
**When** I receive my authentication response
**Then** I also receive my encrypted group key blob
**And** my client decrypts it using my private key
**And** the group key is available in memory for message encryption/decryption

**Given** the encryption service is initialized
**When** I encrypt a message
**Then** XSalsa20-Poly1305 symmetric encryption is used with the group key
**And** a unique nonce is generated per message

**Given** the encryption service is initialized
**When** I decrypt an encrypted message with its nonce
**Then** the original plaintext is recovered correctly

## Story 1.6: Discord-Familiar App Shell & Navigation

As a user,
I want the app to present a Discord-familiar three-column layout with channel navigation,
So that I can immediately orient myself and navigate the platform.

**Acceptance Criteria:**

**Given** I am logged in
**When** the main interface loads
**Then** I see a three-column layout: channel sidebar (240px), content area (flexible), member list (240px)
**And** the layout uses the warm earthy color palette from the UX spec

**Given** the channel sidebar is visible
**When** I look at the sidebar
**Then** I see the server name header at the top
**And** text channels listed with # prefix
**And** voice channels listed with a speaker icon
**And** my user panel at the bottom showing avatar, username, and settings gear

**Given** the member list is visible
**When** I look at the right column
**Then** online members are grouped under "ONLINE — {count}"
**And** offline members are grouped under "OFFLINE — {count}" with dimmed opacity

**Given** I click a text channel in the sidebar
**When** the channel is selected
**Then** the content area updates to show that channel
**And** the channel item displays the active/selected state

**Given** the window is narrower than 1000px
**When** the layout adapts
**Then** the member list auto-collapses
**And** a toggle button appears to show/hide the member list

**Given** the Electron window configuration
**When** the app launches
**Then** the minimum window size is enforced at 960x540

**Given** the app layout
**When** I inspect the HTML structure
**Then** the sidebar uses semantic `<nav>`, content uses `<main>`, member list uses `<aside>`
**And** all interactive elements have visible focus rings for keyboard navigation
