---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments: []
date: 2026-02-24
author: Aidenwoodside
---

# Product Brief: discord_clone

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

discord_clone is a privacy-first, self-hosted communication platform built as an Electron desktop app that replicates the core Discord experience for small friend groups. Born out of growing concerns over Discord's increasing surveillance, identification requirements, and data harvesting practices, this project provides a fully private alternative where the owner controls all data, infrastructure, and software. Deployed on AWS EC2 and supporting up to 20 users, it delivers voice channels, video calls, and persistent text chat — all protected by end-to-end encryption with zero logging and no telemetry.

---

## Core Vision

### Problem Statement

Discord has become the default communication platform for gaming friend groups, but its increasing identification requirements, surveillance software integration, and corporate data harvesting practices erode user privacy. Users who simply want a private space to hang out with friends are forced to accept these terms with no viable alternative that matches Discord's UX and feature set.

### Problem Impact

Friend groups are left "tolerating" a platform they no longer fully trust, with no practical way to opt out without sacrificing the voice, video, and text experience they rely on for daily social interaction. The lack of a simple, privacy-respecting alternative means users continue feeding their personal data and communications into a corporate platform against their preferences.

### Why Existing Solutions Fall Short

Self-hosted alternatives like Matrix/Element and Revolt exist but suffer from UX complexity, incomplete feature sets (particularly around voice and video), and difficult setup processes. None deliver the polished, familiar Discord-like experience as a simple Electron desktop app that a single person can deploy and manage. The gap isn't in the concept of self-hosting — it's in the execution and user experience.

### Proposed Solution

A self-hosted Electron desktop application that faithfully replicates the core Discord experience — voice channels, video calls, and persistent text chat — within a single server with multiple channels. The backend runs on a single AWS EC2 instance managed solely by the owner, with end-to-end encryption, zero logging, and no telemetry baked in from day one. Designed for a small group of up to 20 users, it prioritizes simplicity, privacy, and the familiar UX that makes Discord effective.

### Key Differentiators

- **True data sovereignty**: All data lives on infrastructure you own and control — no corporate middleman
- **End-to-end encryption by default**: All communications (text, voice, video) are encrypted with zero logging and no telemetry
- **Discord-familiar UX**: Not a compromise or workaround — a native Electron app that feels like the real thing
- **Single-owner simplicity**: One person deploys and manages it, no complex federation or distributed setup
- **Purpose-built for small groups**: Optimized for ~20 users rather than trying to scale to millions, keeping the architecture simple and the experience fast

## Target Users

### Primary Users

#### Persona 1: "Aiden" — The Server Owner

- **Role:** Server owner and sole administrator
- **Backstory:** A privacy-conscious gamer who is tired of Discord's surveillance and data harvesting. Technically capable enough to deploy and manage a cloud-hosted application on AWS EC2. Wants to provide a private, trusted space for their friend group without relying on corporate platforms.
- **Motivations:** Data sovereignty, privacy for the group, the satisfaction of building and running their own platform
- **Key Responsibilities:** Deploys and maintains the server, creates and deletes channels, invites users via invite links, manages users (kick/ban), configures server settings
- **Day-to-day:** Set-and-forget once running. Occasionally creates new channels or manages users. Otherwise uses the platform just like everyone else — hopping on voice for gaming sessions and chatting in text channels.
- **Success looks like:** "I deployed it once, my friends are all on it, and I never have to think about whether our conversations are being harvested."

#### Persona 2: "Jordan" — The Regular User

- **Role:** Invited group member, regular user
- **Backstory:** A friend of the server owner who games regularly with the group. Not particularly privacy-motivated on their own, but appreciates that the platform is private and trusts the server owner. Moderately tech-savvy — comfortable downloading and installing a desktop app from a link.
- **Motivations:** Hanging out with friends, easy voice chat for gaming sessions, a familiar Discord-like experience with zero friction
- **Key Activities:** Joins voice channels for gaming sessions, participates in text chat, receives an invite link and sets up their account
- **Day-to-day:** Gets a ping from the group, opens the app, hops into a voice channel, games for a few hours. Occasionally checks text channels for updates or banter.
- **Success looks like:** "It works just like Discord. I clicked a link, made an account, and now I'm in voice chat with my friends. Easy."

### Secondary Users

N/A — This is a closed, invite-only platform with a flat structure. There are no secondary user types, stakeholders, or external parties. The server owner is the sole admin and decision-maker.

### User Journey

1. **Discovery:** The server owner (Aiden) builds and deploys the platform, then sends invite links directly to friends
2. **Onboarding:** Friends click the invite link, download the Electron app, create an account, and land in the server — all in a straightforward flow
3. **Core Usage:** Users open the app, see available voice and text channels, and hop into voice for gaming sessions or drop messages in text channels
4. **"Aha!" Moment:** The first time the whole group is in a voice channel gaming together and someone says "wait, this is actually ours?"
5. **Long-term:** The app becomes the default launch before every gaming session — open game, open discord_clone, hop in voice. It just works.

## Success Metrics

### User Success Metrics

- **Full group adoption**: All ~20 invited friends have created accounts and actively use the platform as their primary communication tool for gaming sessions
- **Zero complaints on call quality**: Voice and video quality is good enough that no one asks to switch back to Discord or another platform
- **Instant usability**: New users who receive an invite link can create an account and immediately start using voice, text, and video with no confusion or setup friction
- **Reliable core experience**: Text messages deliver instantly, voice channels connect without issues, and video calls work smoothly with up to 10 concurrent participants

### Business Objectives

N/A — This is a personal, non-commercial project. There are no revenue, growth, or market share objectives. The sole objective is providing a private, reliable communication platform for a closed friend group.

### Key Performance Indicators

| KPI | Target | Measurement |
|-----|--------|-------------|
| Platform uptime | 99.9% (zero unplanned downtime) | Server monitoring on AWS EC2 |
| Voice/video call quality | No user complaints; stable with ~10 concurrent users | User feedback, absence of complaints |
| Group adoption rate | 20/20 invited users with active accounts | Account creation count |
| Active usage | Users default to discord_clone for gaming sessions | Observed behavior — platform is the go-to for the group |
| Onboarding friction | Invite-to-first-voice-call in under 5 minutes | Time from invite link click to joining a voice channel |
| Core feature reliability | Text, voice, and video work without failure | Zero critical bugs in production affecting core features |

## MVP Scope

### Core Features

- **User Authentication**: Account creation and login with secure credentials
- **Invite System**: Server owner generates invite links; friends click link to join and create account
- **Text Channels**: Flat list of text channels with persistent, real-time messaging (plain text only)
- **Voice Channels**: Flat list of voice channels supporting up to ~10 concurrent users with low-latency, high-quality audio
- **Video Calls**: Video capability within voice channels supporting up to ~10 concurrent participants
- **Server Owner Admin Controls**: Create/delete channels, invite users via links, kick/ban users, manage server settings
- **Two-Role System**: Server owner (admin) and regular user — no additional roles or permissions
- **End-to-End Encryption**: All text, voice, and video communications encrypted by default
- **Zero Logging & No Telemetry**: No usage tracking, no analytics, no data collection beyond what's needed for functionality
- **Persistent Message History**: Text messages stored on the server and available on login
- **Electron Desktop App**: Native desktop application with Discord-familiar UX
- **Self-Hosted Backend**: Single AWS EC2 instance, managed solely by the server owner

### Out of Scope for MVP

- Mobile applications (iOS/Android)
- Push notifications or email notifications
- Direct messages (DMs) between users
- File and image sharing in text chat
- Screen sharing
- Emoji reactions
- User profiles beyond username
- Channel categories or folder organization
- Typing indicators, read receipts, or presence status
- Multiple servers
- Any form of federation or multi-instance communication
- Public registration or self-service server creation

### MVP Success Criteria

- **Core group adoption**: 5-10 friends actively using the platform for gaming sessions without issues
- **Feature completeness**: Voice, video, and text all work reliably without workarounds
- **Call stability**: ~10 users in a voice/video channel simultaneously with no quality complaints
- **Zero critical bugs**: No crashes, no data loss, no connection failures during normal use
- **Onboarding works**: A friend can go from invite link to voice chat in minutes with no hand-holding

### Future Vision

This project is purpose-built for a single friend group and will remain so. Future enhancements beyond MVP would focus on enriching the existing experience rather than expanding scope or audience:

- **Image sharing** in text channels
- **Direct messages** between users
- **File sharing** and attachments
- **Screen sharing** in voice/video channels
- **Push/email notifications**
- **Emoji reactions** on messages
- **Richer user profiles** (avatars, status, etc.)
- **Channel categories** for organization
- **Mobile app** for on-the-go access

No plans for open-sourcing, multi-instance support, or expansion beyond the core friend group.
