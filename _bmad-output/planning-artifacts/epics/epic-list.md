# Epic List

## Epic 1: Project Foundation & User Authentication
Users can receive an invite, create an account, log in, and see the Discord-familiar app shell. This establishes the project scaffold (electron-vite + Fastify + shared types monorepo), database schema, E2E encryption key exchange, invite system, and the three-column layout shell.
**FRs covered:** FR1, FR2, FR3, FR4, FR6, FR7, FR8, FR9, FR45

## Epic 2: Real-Time Text Communication
Users can send and receive end-to-end encrypted text messages in channels with persistent history. This delivers the WebSocket connection, encrypted messaging pipeline, text channel UI (message feed, message input, channel sidebar navigation), and message persistence.
**FRs covered:** FR10, FR11, FR12, FR13, FR14, FR33

## Epic 3: Voice Communication
Users can join voice channels, talk with friends in real-time, see who's in each channel, and manage their audio devices. This delivers the mediasoup SFU, coturn TURN/STUN, voice channel join/leave, real-time audio, speaking indicators, voice status bar with mute/deafen, and audio device selection/switching.
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR34, FR38, FR39, FR40

## Epic 4: Video Communication
Users can enable video while in voice channels to see each other. This extends the voice infrastructure with video tracks, camera toggle, and a video grid display for viewing other participants.
**FRs covered:** FR20, FR21, FR22, FR23, FR35

## Epic 5: Server Administration & User Management
The server owner can fully manage the platform — creating/deleting channels, viewing all users, kicking/banning/unbanning users, and resetting passwords. Admin controls are hidden from regular users.
**FRs covered:** FR5, FR24, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32

## Epic 6: Desktop App Polish & Production Deployment
The app is production-ready with auto-updates, graceful connection handling, zero telemetry, zero content logging, Docker Compose deployment, CI/CD pipeline, and the invite landing page for new users.
**FRs covered:** FR36, FR37, FR41, FR42, FR43, FR44
