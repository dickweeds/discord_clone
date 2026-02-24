---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - product-brief-discord_clone-2026-02-24.md
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: desktop_app
  domain: general
  complexity: low
  projectContext: greenfield
workflowType: 'prd'
---

# Product Requirements Document - discord_clone

**Author:** Aidenwoodside
**Date:** 2026-02-24

## Executive Summary

discord_clone is a self-hosted, privacy-first communication platform delivered as an Electron desktop application. It replicates the core Discord experience — voice channels, video calls, and persistent text chat — for a closed group of up to 20 users. All infrastructure runs on a single AWS EC2 instance owned and managed solely by the server owner, with end-to-end encryption, zero logging, and no telemetry. The project exists because Discord's increasing surveillance, identification requirements, and data harvesting have eroded trust, and no existing alternative delivers the familiar UX in a simple, self-hosted package. This is also a personal builder's project — proving that one person can replace a corporate platform for their friend group.

### What Makes This Special

The core emotional driver is ownership: the moment users realize "this is actually ours." Privacy is the reason to leave Discord, but true data sovereignty — running on infrastructure you control, with no corporate middleman — is what makes staying feel right. Unlike Matrix/Element or Revolt, discord_clone prioritizes a polished, Discord-familiar experience as a native desktop app that a single person can deploy and manage. It's purpose-built for a small friend group, not designed to scale to millions, which keeps the architecture simple and the experience fast.

## Project Classification

- **Project Type:** Desktop application (Electron) with self-hosted backend
- **Domain:** General — real-time communication platform
- **Complexity:** Low — small user base (~20), no regulatory requirements, single-instance architecture, no monetization or multi-tenancy
- **Project Context:** Greenfield — new product built from scratch

## Success Criteria

### User Success

- All ~20 invited friends have created accounts and use the platform at least once per week
- New users go from invite link to their first voice call in under 5 minutes with no hand-holding
- No one asks to switch back to Discord or another platform for gaming sessions
- The app becomes the default launch alongside the game — open game, open discord_clone, hop in voice

### Business Success

N/A — this is a personal, non-commercial project. Success is defined entirely by friend group adoption and satisfaction. The sole measure is: "My friends use it and like it."

### Technical Success

- 99.9% uptime with zero unplanned downtime on the AWS EC2 instance
- Voice and video stable with ~10 concurrent users as the comfortable target, with capacity for up to 20 in a single voice channel
- Text messages deliver instantly with no perceived lag
- Voice connections establish without issues — no dropped calls, no audio glitches during normal use
- End-to-end encryption functioning across all communication types (text, voice, video) with zero data leakage
- Zero critical bugs in production affecting core features

### Measurable Outcomes

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Group adoption | 20/20 accounts created and active weekly | Account count + weekly open rate |
| Onboarding time | Invite link to first voice call < 5 minutes | Manual timing during rollout |
| Call quality | Zero complaints from users | Absence of complaints, no requests to switch platforms |
| Platform uptime | 99.9% | AWS EC2 monitoring |
| Voice/video capacity | ~10 comfortable, up to 20 supported | Load testing during development |
| Critical bugs | Zero in production | Bug tracking |

## User Journeys

### Journey 1: Jordan Joins the Group — Regular User Happy Path

**Opening Scene:** Jordan gets a Discord message from Aiden: "Hey, I built our own thing. No more Discord spying on us. Click this." There's a link. Jordan is skeptical but curious — Aiden's been talking about this for weeks.

**Rising Action:** Jordan clicks the invite link and lands on a clean download page. Downloads the Electron app, installs it in under a minute. The invite link pre-fills the server address. Jordan picks a username and password, creates an account, and lands inside the server. It looks... familiar. There's a list of text channels on the left. A voice channel called "Gaming" with two friends already in it. Jordan recognizes the layout immediately — it's Discord, but stripped down and clean.

**Climax:** Jordan clicks "Gaming," hears the connect sound, and says "yo, can you hear me?" Two friends respond instantly with zero lag. Within 30 seconds, Jordan is in voice chat, launching the game. It just works. No email verification, no phone number, no CAPTCHA, no "customize your experience" wizard. Just click, talk, play.

**Resolution:** Jordan's new routine: open game, open discord_clone, hop in voice. It becomes invisible infrastructure — it's just where the group hangs out now. Jordan never thinks about privacy, but quietly appreciates that nobody's harvesting their data. When someone asks "wait, who runs this?" and Aiden says "I do, on my own server," Jordan thinks: "That's actually kind of cool."

### Journey 2: Jordan Hits a Snag — Regular User Edge Case

**Opening Scene:** It's Friday night. Jordan opens discord_clone to join the gaming session but the app shows a connection error — the server isn't responding. Jordan tries refreshing, restarting the app. Nothing.

**Rising Action:** Jordan texts Aiden on their phone: "App's not working." Aiden checks the EC2 instance and realizes it needs a restart. A few minutes later, the server comes back up. Jordan reopens the app and reconnects — the text channel history is all still there, nothing lost. Jordan hops into voice and the session picks up.

**Climax:** A few weeks later, Jordan forgets their password. There's no "forgot password" email flow — this is a self-hosted platform with no email integration. Jordan messages Aiden, who resets Jordan's password through admin controls. Jordan logs back in, picks a new password, and is back in the server within minutes.

**Resolution:** Jordan learns that when something breaks, you just ask Aiden. It's not a faceless support ticket — it's a friend who fixes it. The failure modes are simple and human-scale. Nothing is catastrophic because the group is small and the owner is accessible.

### Journey 3: Aiden Builds the Clubhouse — Server Owner Admin Journey

**Opening Scene:** Aiden is done with Discord. The latest privacy policy update was the last straw. Aiden has an AWS account and enough technical skill to deploy a cloud application. Time to build the alternative.

**Rising Action:** Aiden spins up an EC2 instance, deploys the discord_clone backend, and configures the basics — server name, a few initial channels: "general" for text, "gaming" for voice, "off-topic" for random banter. Aiden creates their own admin account, tests voice by joining a channel solo, sends a few test messages. Everything works. Aiden generates invite links and sends them to the group chat: "Everyone switch to this. Trust me."

**Climax:** Over the next few days, friends trickle in. One by one, accounts get created. The first real gaming session happens — eight people in the "Gaming" voice channel, trash-talking and laughing. Aiden glances at the member list and realizes: this is entirely theirs. No corporate server. No ads. No data harvesting. Every byte of this conversation lives on Aiden's machine.

**Resolution:** Aiden's ongoing admin work is minimal. Occasionally creates a new channel when the group wants one ("movie-night" voice channel, "memes" text channel). Once, Aiden has to kick someone's old alt account. Mostly, Aiden just uses the platform like everyone else — gaming, chatting, hanging out. The server runs quietly in the background. Set it and forget it. When a friend says "wait, this is actually ours?" Aiden grins.

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---------|----------------------|
| Jordan Happy Path | Invite link system, account creation, server auto-connect, voice channel join, Discord-familiar UI layout, instant usability |
| Jordan Edge Case | Graceful connection error handling, automatic reconnection, persistent message history across outages, admin password reset, resilient client state |
| Aiden Admin | Server deployment process, channel create/delete, invite link generation, user management (kick/ban), admin account setup, member list visibility |

**Cross-cutting requirements:** End-to-end encryption on all communications, zero logging, no telemetry, persistent message storage, low-latency voice connections.

## Product Scope & Phased Development

### MVP Strategy

**MVP Approach:** Problem-solving MVP — the minimum feature set that lets the friend group fully replace Discord for gaming sessions. Every MVP feature directly supports the core loop: open app, join voice, game with friends.

**Resource Requirements:** Solo developer (Aidenwoodside). Full-stack responsibility covering Electron frontend, Node.js backend, WebRTC voice/video, E2E encryption, and AWS deployment.

**Core User Journeys Supported:**
- Jordan Happy Path (invite → account → voice → gaming)
- Jordan Edge Case (connection errors, password reset, reconnection)
- Aiden Admin (deploy, configure channels, invite friends, manage users)

### MVP Feature Set (Phase 1)

- User authentication (account creation, login with secure credentials)
- Invite link system (owner generates, friends join via link)
- Text channels with persistent, real-time messaging (plain text)
- Voice channels with low-latency audio (~10 comfortable, up to 20 supported)
- Video calls within voice channels (~10 comfortable, up to 20 supported)
- Server owner admin controls (create/delete channels, invite, kick/ban, password reset)
- Two-role system (owner and regular user)
- End-to-end encryption on all text, voice, and video
- Zero logging and no telemetry
- Persistent message history
- Electron desktop app (Windows, macOS, Linux) with Discord-familiar UI
- Auto-update mechanism
- Audio output and microphone input device selection
- Self-hosted backend on single AWS EC2 instance
- Graceful connection error handling with automatic reconnection
- "Can't connect" messaging when server is unreachable

### Phase 2: Growth Features

- Image sharing in text channels
- Direct messages between users
- File sharing and attachments
- Screen sharing in voice/video channels
- Emoji reactions on messages
- Richer user profiles (avatars, status)

### Phase 3: Expansion

- Push/email notifications
- Channel categories for organization
- Mobile app for on-the-go access
- Voice/video capacity scaling beyond 20 concurrent users

### Risk Mitigation Strategy

**Technical Risks:** Real-time voice/video via WebRTC and end-to-end encryption are the most complex components. Mitigation: leverage well-established WebRTC libraries and proven E2E encryption protocols (e.g., Signal Protocol or libsodium). Prototype voice/video early to validate feasibility before building out the full UI.

**Market Risks:** Effectively zero — the "market" is 20 friends. The only risk is the group not adopting. Mitigation: involve a few friends early as testers to build buy-in and catch usability issues before full rollout.

**Resource Risks:** Solo developer means limited bandwidth. Mitigation: the MVP scope is deliberately tight — no feature creep, no nice-to-haves in Phase 1. If development takes longer than expected, the mitigation is timeline flexibility rather than scope reduction.

## Desktop App Specific Requirements

### Project-Type Overview

discord_clone is an Electron-based desktop application targeting Windows, macOS, and Linux. The app pairs with a self-hosted Node.js backend on AWS EC2. As an Electron app, it leverages web technologies (HTML/CSS/JS) for the UI while providing native desktop capabilities like system-level audio device access and auto-updates.

### Technical Architecture Considerations

**Platform Support:**
- Windows (10+), macOS (12+), Linux (major distributions: Ubuntu, Fedora, Arch)
- Single Electron codebase targeting all three platforms
- Platform-specific build and packaging for each OS (`.exe`/`.msi` for Windows, `.dmg` for macOS, `.AppImage`/`.deb` for Linux)

**Update Strategy:**
- Auto-update built into the app using Electron's built-in update mechanism (e.g., electron-updater)
- Updates delivered seamlessly — users notified when a new version is available, install with one click or on next restart
- Update server hosted alongside the backend or via GitHub releases

**Audio/Video Device Integration:**
- Audio output device selection (speakers/headphones)
- Microphone input device selection
- Device enumeration and switching within app settings or voice channel UI
- Real-time device switching without disconnecting from voice

**Offline Behavior:**
- No offline functionality — the app requires a connection to the server
- Clear "Can't connect to server" message when the backend is unreachable
- Automatic reconnection attempts when connectivity is restored

### Implementation Considerations

- Electron security best practices: context isolation, disabled Node.js integration in renderer, sandboxed processes
- Native audio access via WebRTC for voice/video — leveraging Chromium's built-in media APIs
- Cross-platform testing required for all three OS targets before each release
- App signing for macOS (and optionally Windows) to avoid security warnings during installation
- Minimal resource footprint — the app should feel lightweight, not resource-heavy

## Functional Requirements

### User Authentication & Accounts

- **FR1:** Users can create an account with a username and password via an invite link
- **FR2:** Users can log in to their account with their credentials
- **FR3:** Users can log out of their account
- **FR4:** Users remain authenticated across app restarts (persistent session)
- **FR5:** Server owner can reset any user's password

### Invite & Onboarding

- **FR6:** Server owner can generate invite links
- **FR7:** Server owner can revoke active invite links
- **FR8:** Unauthenticated users can access the account creation flow via a valid invite link
- **FR9:** The invite link pre-fills the server connection details during account creation

### Text Communication

- **FR10:** Users can view a list of available text channels
- **FR11:** Users can send plain text messages in a text channel
- **FR12:** Users can view real-time messages from other users in a text channel
- **FR13:** Users can view persistent message history in text channels upon login
- **FR14:** Users can scroll through past message history in a text channel

### Voice Communication

- **FR15:** Users can view a list of available voice channels and see who is currently in each
- **FR16:** Users can join a voice channel
- **FR17:** Users can leave a voice channel
- **FR18:** Users can speak and hear other participants in real-time within a voice channel
- **FR19:** Voice channels can support up to 20 concurrent participants

### Video Communication

- **FR20:** Users can enable their video camera while in a voice channel
- **FR21:** Users can disable their video camera while in a voice channel
- **FR22:** Users can view video streams of other participants who have video enabled
- **FR23:** Video within voice channels can support up to 20 concurrent participants

### Channel Management

- **FR24:** Server owner can create new text channels with a specified name
- **FR25:** Server owner can create new voice channels with a specified name
- **FR26:** Server owner can delete existing text channels
- **FR27:** Server owner can delete existing voice channels

### User & Server Administration

- **FR28:** Server owner can view a list of all registered users
- **FR29:** Server owner can kick a user from the server
- **FR30:** Server owner can ban a user from the server
- **FR31:** Server owner can unban a previously banned user
- **FR32:** Banned users cannot log in or create new accounts

### Privacy & Security

- **FR33:** All text messages are end-to-end encrypted between sender and recipients
- **FR34:** All voice audio is end-to-end encrypted between participants
- **FR35:** All video streams are end-to-end encrypted between participants
- **FR36:** The system collects zero usage telemetry or analytics data
- **FR37:** The system maintains zero persistent logs of communication content

### Desktop App Experience

- **FR38:** Users can select their preferred audio output device
- **FR39:** Users can select their preferred microphone input device
- **FR40:** Users can switch audio/microphone devices without disconnecting from voice
- **FR41:** The app automatically checks for and notifies users of available updates
- **FR42:** Users can install updates from within the app
- **FR43:** The app displays a clear "Can't connect to server" message when the server is unreachable
- **FR44:** The app automatically attempts to reconnect when connectivity is restored
- **FR45:** The app presents a Discord-familiar layout with channel list, message area, and member visibility

## Non-Functional Requirements

### Performance

- Voice audio latency must be 100ms or less (end-to-end, mouth to ear) to feel instant during gaming sessions
- Video latency must be under 200ms to maintain natural conversation flow
- Text messages must appear for all channel participants within 1 second of sending
- Voice channel join time must be under 3 seconds from click to connected
- App startup to usable state must be under 5 seconds
- The app must maintain stable voice/video quality with up to 20 concurrent participants in a single channel

### Security

- User passwords hashed with bcrypt (appropriate cost factor) — no plaintext storage
- All client-server communication over TLS (HTTPS/WSS)
- End-to-end encryption for all text, voice, and video content (server cannot read content)
- Authentication tokens must expire and be refreshable
- Invite links must be cryptographically random and non-guessable
- No sensitive data (passwords, encryption keys) stored in plaintext on client or server
- Server stores only encrypted message content — plaintext messages never written to disk

### Reliability

- 99.9% server uptime target (less than 8.7 hours unplanned downtime per year)
- Text message history must survive server restarts with zero data loss
- Voice/video disconnections due to server issues require manual rejoin (automatic reconnect not required for voice)
- Client app connection to server must auto-reconnect for text/presence after network interruptions
- No silent data loss — if a message fails to send, the user must be clearly notified
