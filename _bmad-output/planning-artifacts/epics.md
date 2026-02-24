---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
---

# discord_clone - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for discord_clone, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

- FR1: Users can create an account with a username and password via an invite link
- FR2: Users can log in to their account with their credentials
- FR3: Users can log out of their account
- FR4: Users remain authenticated across app restarts (persistent session)
- FR5: Server owner can reset any user's password
- FR6: Server owner can generate invite links
- FR7: Server owner can revoke active invite links
- FR8: Unauthenticated users can access the account creation flow via a valid invite link
- FR9: The invite link pre-fills the server connection details during account creation
- FR10: Users can view a list of available text channels
- FR11: Users can send plain text messages in a text channel
- FR12: Users can view real-time messages from other users in a text channel
- FR13: Users can view persistent message history in text channels upon login
- FR14: Users can scroll through past message history in a text channel
- FR15: Users can view a list of available voice channels and see who is currently in each
- FR16: Users can join a voice channel
- FR17: Users can leave a voice channel
- FR18: Users can speak and hear other participants in real-time within a voice channel
- FR19: Voice channels can support up to 20 concurrent participants
- FR20: Users can enable their video camera while in a voice channel
- FR21: Users can disable their video camera while in a voice channel
- FR22: Users can view video streams of other participants who have video enabled
- FR23: Video within voice channels can support up to 20 concurrent participants
- FR24: Server owner can create new text channels with a specified name
- FR25: Server owner can create new voice channels with a specified name
- FR26: Server owner can delete existing text channels
- FR27: Server owner can delete existing voice channels
- FR28: Server owner can view a list of all registered users
- FR29: Server owner can kick a user from the server
- FR30: Server owner can ban a user from the server
- FR31: Server owner can unban a previously banned user
- FR32: Banned users cannot log in or create new accounts
- FR33: All text messages are end-to-end encrypted between sender and recipients
- FR34: All voice audio is end-to-end encrypted between participants
- FR35: All video streams are end-to-end encrypted between participants
- FR36: The system collects zero usage telemetry or analytics data
- FR37: The system maintains zero persistent logs of communication content
- FR38: Users can select their preferred audio output device
- FR39: Users can select their preferred microphone input device
- FR40: Users can switch audio/microphone devices without disconnecting from voice
- FR41: The app automatically checks for and notifies users of available updates
- FR42: Users can install updates from within the app
- FR43: The app displays a clear "Can't connect to server" message when the server is unreachable
- FR44: The app automatically attempts to reconnect when connectivity is restored
- FR45: The app presents a Discord-familiar layout with channel list, message area, and member visibility

### NonFunctional Requirements

- NFR1: Voice audio latency must be 100ms or less (end-to-end, mouth to ear) to feel instant during gaming sessions
- NFR2: Video latency must be under 200ms to maintain natural conversation flow
- NFR3: Text messages must appear for all channel participants within 1 second of sending
- NFR4: Voice channel join time must be under 3 seconds from click to connected
- NFR5: App startup to usable state must be under 5 seconds
- NFR6: The app must maintain stable voice/video quality with up to 20 concurrent participants in a single channel
- NFR7: User passwords hashed with bcrypt (appropriate cost factor) — no plaintext storage
- NFR8: All client-server communication over TLS (HTTPS/WSS)
- NFR9: End-to-end encryption for all text, voice, and video content (server cannot read content)
- NFR10: Authentication tokens must expire and be refreshable
- NFR11: Invite links must be cryptographically random and non-guessable
- NFR12: No sensitive data (passwords, encryption keys) stored in plaintext on client or server
- NFR13: Server stores only encrypted message content — plaintext messages never written to disk
- NFR14: 99.9% server uptime target (less than 8.7 hours unplanned downtime per year)
- NFR15: Text message history must survive server restarts with zero data loss
- NFR16: Voice/video disconnections due to server issues require manual rejoin (automatic reconnect not required for voice)
- NFR17: Client app connection to server must auto-reconnect for text/presence after network interruptions
- NFR18: No silent data loss — if a message fails to send, the user must be clearly notified

### Additional Requirements

**From Architecture:**

- Starter template: electron-vite (React + TypeScript template) via `npm create @quick-start/electron@latest discord-clone -- --template react-ts` — this should be Epic 1, Story 1
- Backend framework: Fastify with TypeScript, with @fastify/websocket for real-time messaging
- Database: SQLite via better-sqlite3 with Drizzle ORM for schema and migrations
- Schema tables: users, channels, messages, sessions, invites, bans
- Authentication: JWT (access + refresh tokens) with bcrypt password hashing
- E2E encryption: Shared group symmetric key via libsodium-wrappers (XSalsa20-Poly1305 for text, DTLS/SRTP for voice/video in MVP)
- Client token storage: Electron safeStorage API (OS-level encryption)
- WebRTC SFU: mediasoup for group voice/video calls
- TURN/STUN: coturn self-hosted on EC2
- State management: Zustand with domain stores (auth, channels, messages, voice, presence)
- Routing: React Router
- Styling: Tailwind CSS + Radix UI with warm earthy theme tokens
- Containerization: Docker Compose (app, coturn, nginx containers)
- Reverse proxy: Nginx for TLS termination + WebSocket upgrade
- CI/CD: GitHub Actions for testing, building, and releasing
- Electron distribution: GitHub Releases + electron-updater
- Logging: Pino (operational events only, never message content)
- Health monitoring: /health endpoint + AWS CloudWatch
- Monorepo structure: client/, server/, shared/ workspaces
- WebSocket message protocol: namespace:action format (e.g., text:send, voice:join, presence:update)
- API response format: { data: {...} } for success, { error: { code, message } } for errors
- Custom protocol handler: discord-clone://invite/TOKEN for invite deep linking
- Invite landing page: static HTML served by Nginx for browser-based invite URLs
- Co-located tests (next to source files), Vitest + React Testing Library
- TypeScript strict mode across full stack

**From UX Design:**

- Warm earthy color palette (Direction B) with custom tokens in tailwind.config.js
- Three-column layout: Channel sidebar (240px fixed), Content area (flexible), Member list (240px, collapsible)
- Voice status bar: 52px height fixed to bottom of sidebar, visible only when connected
- User panel: fixed to bottom of sidebar below voice status bar
- Speaking indicator: green ring/glow around avatar, pulsing animation, respects prefers-reduced-motion
- Audio cues: connect sound, disconnect sound, mute/unmute confirmation sounds
- Message grouping: consecutive messages from same author within 5 minutes share a single header
- Message input: Enter to send, Shift+Enter for newline, plain text only
- Discord-familiar layout with # prefix for text channels, speaker icon for voice channels
- Minimum window size: 960x540 enforced in Electron BrowserWindow config
- Responsive breakpoints: compact (<1000px), default (1000-1400px), wide (>1400px)
- Message content max-width capped at ~720px for readability on wide monitors
- WCAG 2.1 Level AA accessibility target
- Keyboard shortcuts: Ctrl/Cmd+Shift+M (mute), Ctrl/Cmd+Shift+D (deafen), Ctrl/Cmd+Shift+E (disconnect)
- Semantic HTML: nav for sidebar, main for content, aside for member list
- ARIA live regions for messages and voice state changes
- Skeleton placeholders for loading content (no full-screen spinners)
- No loading indicator for actions under 300ms
- Inline errors (not modal), persistent until resolved
- Confirmations only for destructive actions (delete, kick, ban)
- Empty states with warm, inviting copy
- Context menus (right-click) for power actions on channels and members
- Admin options hidden (not greyed out) for regular users
- Form validation on submit, not on blur
- 8px default border radius, 12px for inputs, avatars fully round
- System font stack (no custom web fonts)

### FR Coverage Map

- FR1: Epic 1 - Account creation via invite link
- FR2: Epic 1 - User login with credentials
- FR3: Epic 1 - User logout
- FR4: Epic 1 - Persistent session across app restarts
- FR5: Epic 5 - Admin password reset
- FR6: Epic 1 - Invite link generation
- FR7: Epic 1 - Invite link revocation
- FR8: Epic 1 - Account creation flow via invite
- FR9: Epic 1 - Invite pre-fills server connection
- FR10: Epic 2 - View text channel list
- FR11: Epic 2 - Send text messages
- FR12: Epic 2 - View real-time messages
- FR13: Epic 2 - View persistent message history
- FR14: Epic 2 - Scroll through message history
- FR15: Epic 3 - View voice channels with participants
- FR16: Epic 3 - Join voice channel
- FR17: Epic 3 - Leave voice channel
- FR18: Epic 3 - Real-time voice communication
- FR19: Epic 3 - Voice channel capacity (20 users)
- FR20: Epic 4 - Enable video camera
- FR21: Epic 4 - Disable video camera
- FR22: Epic 4 - View participant video streams
- FR23: Epic 4 - Video capacity (20 users)
- FR24: Epic 5 - Create text channels
- FR25: Epic 5 - Create voice channels
- FR26: Epic 5 - Delete text channels
- FR27: Epic 5 - Delete voice channels
- FR28: Epic 5 - View all registered users
- FR29: Epic 5 - Kick user
- FR30: Epic 5 - Ban user
- FR31: Epic 5 - Unban user
- FR32: Epic 5 - Banned users blocked from access
- FR33: Epic 2 - E2E encrypted text messages
- FR34: Epic 3 - E2E encrypted voice audio
- FR35: Epic 4 - E2E encrypted video streams
- FR36: Epic 6 - Zero telemetry
- FR37: Epic 6 - Zero content logging
- FR38: Epic 3 - Audio output device selection
- FR39: Epic 3 - Microphone input device selection
- FR40: Epic 3 - Device switching without disconnecting
- FR41: Epic 6 - Auto-update check and notification
- FR42: Epic 6 - In-app update installation
- FR43: Epic 6 - Connection error messaging
- FR44: Epic 6 - Automatic reconnection
- FR45: Epic 1 - Discord-familiar layout

## Epic List

### Epic 1: Project Foundation & User Authentication
Users can receive an invite, create an account, log in, and see the Discord-familiar app shell. This establishes the project scaffold (electron-vite + Fastify + shared types monorepo), database schema, E2E encryption key exchange, invite system, and the three-column layout shell.
**FRs covered:** FR1, FR2, FR3, FR4, FR6, FR7, FR8, FR9, FR45

### Epic 2: Real-Time Text Communication
Users can send and receive end-to-end encrypted text messages in channels with persistent history. This delivers the WebSocket connection, encrypted messaging pipeline, text channel UI (message feed, message input, channel sidebar navigation), and message persistence.
**FRs covered:** FR10, FR11, FR12, FR13, FR14, FR33

### Epic 3: Voice Communication
Users can join voice channels, talk with friends in real-time, see who's in each channel, and manage their audio devices. This delivers the mediasoup SFU, coturn TURN/STUN, voice channel join/leave, real-time audio, speaking indicators, voice status bar with mute/deafen, and audio device selection/switching.
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR34, FR38, FR39, FR40

### Epic 4: Video Communication
Users can enable video while in voice channels to see each other. This extends the voice infrastructure with video tracks, camera toggle, and a video grid display for viewing other participants.
**FRs covered:** FR20, FR21, FR22, FR23, FR35

### Epic 5: Server Administration & User Management
The server owner can fully manage the platform — creating/deleting channels, viewing all users, kicking/banning/unbanning users, and resetting passwords. Admin controls are hidden from regular users.
**FRs covered:** FR5, FR24, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32

### Epic 6: Desktop App Polish & Production Deployment
The app is production-ready with auto-updates, graceful connection handling, zero telemetry, zero content logging, Docker Compose deployment, CI/CD pipeline, and the invite landing page for new users.
**FRs covered:** FR36, FR37, FR41, FR42, FR43, FR44

## Epic 1: Project Foundation & User Authentication

Users can receive an invite, create an account, log in, and see the Discord-familiar app shell. This establishes the project scaffold (electron-vite + Fastify + shared types monorepo), database schema, E2E encryption key exchange, invite system, and the three-column layout shell.

### Story 1.1: Project Scaffold & Monorepo Setup

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

### Story 1.2: Database Schema & Core Server Configuration

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

### Story 1.3: User Registration & Invite System

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

### Story 1.4: User Login, Logout & Session Management

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

### Story 1.5: E2E Encryption Foundation

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

### Story 1.6: Discord-Familiar App Shell & Navigation

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

## Epic 2: Real-Time Text Communication

Users can send and receive end-to-end encrypted text messages in channels with persistent history.

### Story 2.1: WebSocket Connection & Real-Time Transport

As a user,
I want a persistent WebSocket connection to the server,
So that I can send and receive messages in real-time without page refreshes.

**Acceptance Criteria:**

**Given** I am logged in
**When** the app initializes
**Then** a WebSocket connection is established to the server at /ws
**And** the connection is authenticated with my JWT access token

**Given** the WebSocket connection is active
**When** the server sends a message
**Then** the wsClient dispatches it to the appropriate Zustand store based on message type

**Given** the WebSocket connection drops unexpectedly
**When** the client detects the disconnection
**Then** automatic reconnection attempts begin with exponential backoff (1s, 2s, 4s, 8s, max 30s)
**And** a connection state indicator is visible to the user

**Given** the WebSocket connection is re-established
**When** the reconnection succeeds
**Then** the client resumes normal operation
**And** any missed messages are synced

**Given** the WebSocket message protocol
**When** any message is sent or received
**Then** it follows the `{ type: "namespace:action", payload: {...}, id?: string }` envelope format

### Story 2.2: Encrypted Text Messaging

As a user,
I want to send and receive end-to-end encrypted text messages in a channel,
So that I can communicate with my friends knowing the server cannot read our messages.

**Acceptance Criteria:**

**Given** I am in a text channel
**When** I type a message and press Enter
**Then** the message is encrypted client-side using the group key (XSalsa20-Poly1305) with a unique nonce
**And** the encrypted content and nonce are sent via WebSocket as a `text:send` message
**And** the input field clears immediately

**Given** another user sends a message in my active channel
**When** I receive a `text:receive` WebSocket message
**Then** the encrypted content is decrypted client-side using the group key and nonce
**And** the plaintext message appears in the message feed in real-time

**Given** the server receives an encrypted message
**When** it stores the message in SQLite
**Then** only the encrypted content blob and nonce are persisted — plaintext is never written to disk

**Given** I press Shift+Enter while typing
**When** the input processes the key combination
**Then** a newline is inserted instead of sending the message

**Given** a message fails to send
**When** the WebSocket delivery fails
**Then** I am clearly notified that the message was not delivered
**And** the message is visually marked as failed

### Story 2.3: Message Feed & Channel Navigation UI

As a user,
I want to see messages displayed in a clean, chronological feed with Discord-familiar grouping,
So that I can follow conversations naturally and know who said what.

**Acceptance Criteria:**

**Given** I am viewing a text channel
**When** messages are displayed
**Then** they appear in chronological order in the content area
**And** the content header shows the channel name with # prefix

**Given** consecutive messages are from the same author within 5 minutes
**When** the messages render
**Then** they are grouped under a single header showing avatar (32px), username (semibold), and timestamp (muted, 12px)
**And** subsequent messages in the group have 4px vertical spacing

**Given** a new author sends a message or more than 5 minutes pass
**When** the next message renders
**Then** a new message group starts with its own header
**And** 16px gap separates it from the previous group

**Given** the message input bar
**When** I look at the bottom of the content area
**Then** I see a text input with placeholder "Message #channel-name"
**And** it has 12px border radius, bg-tertiary background, and 44px minimum height

**Given** I click a different text channel in the sidebar
**When** the channel switches
**Then** the content area instantly swaps to show that channel's messages
**And** the previously active channel loses its selected state
**And** the new channel shows the active/selected state

**Given** the message feed content
**When** messages are displayed on a wide window (>1400px)
**Then** message content width is capped at ~720px and centered in the content area

**Given** a text channel with no messages
**When** I view the empty channel
**Then** I see centered text: channel name + "This is the beginning of #channel-name. Send the first message!"

### Story 2.4: Persistent Message History & Scrollback

As a user,
I want to see previous message history when I open a channel and scroll through past conversations,
So that I never lose context from earlier discussions.

**Acceptance Criteria:**

**Given** I open the app and navigate to a text channel
**When** the channel loads
**Then** the most recent messages are fetched from the server via GET /api/channels/:channelId/messages
**And** the encrypted messages are decrypted client-side and displayed

**Given** the message feed is loaded
**When** I am at the bottom of the feed
**Then** new incoming messages auto-scroll the feed to show the latest message

**Given** I have scrolled up in the message feed
**When** a new message arrives
**Then** the feed does NOT auto-scroll
**And** a "New messages" indicator appears to let me jump to the latest

**Given** I am viewing a channel with extensive history
**When** I scroll to the top of the loaded messages
**Then** older messages are fetched from the server (paginated)
**And** decrypted and prepended to the feed without losing scroll position

**Given** the server restarts
**When** I reconnect and view a text channel
**Then** all previously stored messages are still available and decryptable
**And** zero messages are lost

## Epic 3: Voice Communication

Users can join voice channels, talk with friends in real-time, see who's in each channel, and manage their audio devices.

### Story 3.1: Voice Server Infrastructure

As a developer,
I want the mediasoup SFU and coturn TURN/STUN server configured,
So that the platform has the server-side infrastructure to support group voice calls with NAT traversal.

**Acceptance Criteria:**

**Given** the server starts
**When** mediasoup is initialized
**Then** a mediasoup Worker is created with appropriate settings
**And** a Router is created for media routing

**Given** the server configuration
**When** coturn is configured
**Then** STUN/TURN services are available for WebRTC NAT traversal
**And** credentials are configured securely

**Given** a client needs to establish a WebRTC connection
**When** the client requests transport creation via WebSocket
**Then** the server creates a mediasoup WebRtcTransport with coturn ICE servers
**And** returns the transport parameters to the client

**Given** the WebSocket signaling protocol
**When** voice-related messages are exchanged
**Then** they follow the namespace:action format (voice:join, voice:leave, rtc:offer, rtc:answer, rtc:ice)

### Story 3.2: Voice Channel Join, Leave & Presence

As a user,
I want to join and leave voice channels with one click and see who's in each channel,
So that I can hop in and talk with friends instantly.

**Acceptance Criteria:**

**Given** I am logged in and viewing the channel sidebar
**When** I look at voice channels
**Then** each voice channel shows a speaker icon and its name
**And** connected users are listed nested beneath the channel name with their avatars

**Given** I click a voice channel name
**When** I join the channel
**Then** a WebRTC connection is established via mediasoup within 3 seconds
**And** a connect sound plays
**And** my name appears in the voice channel participant list for all users
**And** the voice status bar appears at the bottom of the sidebar

**Given** I am in a voice channel
**When** I click the disconnect button in the voice status bar
**Then** I immediately leave the voice channel
**And** a disconnect sound plays
**And** my name is removed from the participant list for all users
**And** the voice status bar disappears

**Given** I am in a voice channel
**When** I navigate to different text channels
**Then** my voice connection persists — voice is a layer, not a destination

**Given** the voice status bar is visible
**When** I look at it
**Then** I see: connection status label, channel name, mute button, deafen button, video toggle, disconnect button
**And** it is 52px height, fixed to bottom of sidebar above user panel

**Given** another user joins or leaves a voice channel
**When** the presence update arrives via WebSocket
**Then** the voice channel participant list updates in real-time for all users

### Story 3.3: Real-Time Voice Audio & Speaking Indicators

As a user,
I want to speak and hear other participants with instant, clear audio and see who's talking,
So that voice feels as natural as being in the same room.

**Acceptance Criteria:**

**Given** I am in a voice channel with other participants
**When** I speak into my microphone
**Then** all other participants hear my audio in real-time with less than 100ms latency

**Given** other participants are speaking
**When** their audio is transmitted
**Then** I hear them clearly with no echo, no clipping, and no perceptible delay

**Given** a voice channel
**When** up to 20 users are connected
**Then** all participants can speak and hear each other
**And** voice quality remains stable

**Given** voice audio is transmitted
**When** data flows between clients and the SFU
**Then** DTLS/SRTP encryption secures the audio in transit

**Given** I am speaking
**When** my voice is detected
**Then** a green speaking indicator (ring/glow) appears around my avatar in the participant list
**And** the indicator updates in real-time with zero perceptible delay
**And** the animation uses a subtle pulse, not a flash

**Given** the user has prefers-reduced-motion enabled
**When** speaking indicators are displayed
**Then** a static green ring is used instead of the pulse animation

**Given** another participant is speaking
**When** their voice is detected
**Then** a green speaking indicator appears around their avatar in the participant list

### Story 3.4: Audio Device Management & Voice Controls

As a user,
I want to select my audio devices and control my microphone and speaker during voice calls,
So that I can use the right hardware and manage my audio without leaving the call.

**Acceptance Criteria:**

**Given** I am in app settings or voice settings
**When** I open audio device selection
**Then** I see a list of available audio output devices (speakers/headphones)
**And** a list of available microphone input devices

**Given** I select a different audio output device
**When** the selection is applied
**Then** audio plays through the newly selected device
**And** I am NOT disconnected from voice

**Given** I select a different microphone input device
**When** the selection is applied
**Then** my voice is captured from the newly selected device
**And** I am NOT disconnected from voice

**Given** I am in a voice channel
**When** I click the mute button in the voice status bar
**Then** my microphone is muted — I stop transmitting audio
**And** the mute button shows a crossed-out mic icon
**And** a mute sound cue plays

**Given** I am muted
**When** I click the mute button again
**Then** my microphone is unmuted — I resume transmitting audio

**Given** I am in a voice channel
**When** I click the deafen button
**Then** all incoming audio is silenced AND my microphone is muted
**And** the deafen button shows a crossed-out headphone icon

**Given** I am in a voice channel
**When** I press Ctrl/Cmd+Shift+M
**Then** mute is toggled

**Given** I am in a voice channel
**When** I press Ctrl/Cmd+Shift+D
**Then** deafen is toggled

**Given** I am in a voice channel
**When** I press Ctrl/Cmd+Shift+E
**Then** I disconnect from voice

**Given** I am muted in a voice channel
**When** other users look at my participant entry
**Then** a small mute icon overlay appears on my avatar

## Epic 4: Video Communication

Users can enable video while in voice channels to see each other.

### Story 4.1: Video Camera Toggle & Streaming

As a user,
I want to enable and disable my video camera while in a voice channel,
So that I can see my friends and be seen during calls.

**Acceptance Criteria:**

**Given** I am in a voice channel
**When** I click the video toggle button in the voice status bar
**Then** my camera activates and begins streaming video to other participants
**And** the video toggle button shows an active/highlighted state

**Given** I have my video enabled
**When** I click the video toggle button again
**Then** my camera stops and video streaming ceases
**And** the video toggle button returns to its default state

**Given** I enable my video
**When** video is transmitted through the SFU
**Then** DTLS/SRTP encryption secures the video stream in transit

**Given** my video is enabled
**When** other participants view the voice channel
**Then** they can see my video stream

**Given** video is enabled in a voice channel
**When** up to 20 participants have video active
**Then** all video streams remain stable and viewable

### Story 4.2: Video Grid Display

As a user,
I want to see all participants' video streams in an organized grid,
So that I can see everyone who has their camera on during a call.

**Acceptance Criteria:**

**Given** I am in a voice channel where participants have video enabled
**When** I view the voice channel content area
**Then** video streams are displayed in a responsive grid layout

**Given** multiple participants have video enabled
**When** the grid displays
**Then** each participant's video shows their stream with their username overlaid
**And** the grid adapts layout based on the number of active video streams

**Given** a participant enables or disables their video
**When** the change occurs
**Then** the video grid updates in real-time — adding or removing the stream

**Given** a participant is speaking while their video is shown
**When** the speaking indicator activates
**Then** their video tile shows a green border/glow matching the speaking indicator style

**Given** a participant without video enabled
**When** they are in the voice channel
**Then** they are not shown in the video grid (audio-only participants appear in the sidebar participant list only)

## Epic 5: Server Administration & User Management

The server owner can fully manage the platform — creating/deleting channels, viewing all users, kicking/banning/unbanning users, and resetting passwords. Admin controls are hidden from regular users.

### Story 5.1: Channel Management

As the server owner (Aiden),
I want to create and delete text and voice channels,
So that I can organize the server's communication spaces for the group.

**Acceptance Criteria:**

**Given** I am the server owner
**When** I click "Create Channel" via the server settings dropdown
**Then** a modal appears with: channel name input, text/voice type toggle, and "Create" button

**Given** I fill in a channel name and select a type
**When** I click "Create"
**Then** the channel is created on the server
**And** it appears immediately in the channel sidebar for all connected users
**And** a `channel:created` WebSocket message notifies all clients

**Given** I right-click on a channel in the sidebar
**When** I see the context menu (admin only)
**Then** a "Delete Channel" option is available

**Given** I select "Delete Channel"
**When** the confirmation dialog appears
**Then** it shows: "Delete #channel-name?" with a warning that messages will be permanently lost
**And** offers "Cancel" (secondary) and "Delete" (danger) buttons

**Given** I confirm channel deletion
**When** the channel is deleted
**Then** it is removed from the sidebar for all connected users
**And** a `channel:deleted` WebSocket message notifies all clients
**And** all associated messages are permanently removed

**Given** I am a regular user
**When** I view the sidebar
**Then** no channel creation or deletion options are visible — admin controls are hidden, not greyed out

### Story 5.2: User Management & Administration

As the server owner (Aiden),
I want to view all users and manage membership (kick, ban, unban, reset passwords),
So that I can maintain the server and help friends who get locked out.

**Acceptance Criteria:**

**Given** I am the server owner
**When** I access user management via server settings or right-click on a member
**Then** I can view a list of all registered users with their status

**Given** I right-click on a member in the member list
**When** the context menu appears (admin only)
**Then** I see options: "Kick", "Ban", "Reset Password"

**Given** I select "Kick" on a user
**When** a confirmation dialog appears and I confirm
**Then** the user is removed from the server
**And** their active sessions are invalidated
**And** they receive a `user:kicked` WebSocket notification
**And** they can rejoin via a new invite link

**Given** I select "Ban" on a user
**When** a confirmation dialog appears and I confirm
**Then** the user is removed from the server
**And** their account is banned
**And** they cannot log in or create new accounts
**And** they receive a `user:banned` WebSocket notification

**Given** I access the banned users list
**When** I select "Unban" on a previously banned user
**Then** their ban is lifted
**And** they can register a new account or log in again via invite

**Given** I select "Reset Password" on a user
**When** the action is executed
**Then** a new temporary password is generated
**And** displayed to me (the admin) for sharing with the user directly
**And** the user's existing sessions are invalidated

**Given** I am a regular user
**When** I right-click on a member
**Then** no admin options (kick, ban, reset password) are visible

## Epic 6: Desktop App Polish & Production Deployment

The app is production-ready with auto-updates, graceful connection handling, zero telemetry, zero content logging, Docker Compose deployment, CI/CD pipeline, and the invite landing page for new users.

### Story 6.1: Connection Resilience & Error Handling

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

### Story 6.2: Auto-Update System

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

### Story 6.3: Privacy Enforcement & Zero Telemetry

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

### Story 6.4: Production Deployment Infrastructure

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

### Story 6.5: CI/CD Pipeline & Cross-Platform Distribution

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
