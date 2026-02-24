# Requirements Inventory

## Functional Requirements

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

## NonFunctional Requirements

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

## Additional Requirements

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

## FR Coverage Map

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
