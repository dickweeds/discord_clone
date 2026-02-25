# Dependency Map & Parallel Execution Plan

**Generated:** 2026-02-24 | **Revised:** 2026-02-24
**Project:** discord_clone
**Scope:** 13 remaining stories across Epics 2-6 (Epic 1 complete)

---

## Current State

Epic 1 (Project Foundation & User Authentication) is **fully complete** — all 6 stories done, 167 tests passing. The foundation provides: monorepo scaffold, SQLite + Drizzle ORM, JWT auth, E2E encryption (libsodium), and the Discord-familiar three-column app shell.

---

## Full Dependency Graph

```
                         ┌──────────────────────────────────────────────────────┐
                         │              EPIC 1 (COMPLETE)                       │
                         │  1-1 → 1-2 → 1-3 → 1-4 → 1-5 → 1-6               │
                         └──────────────┬───────────────────────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
          [6-2] Auto-Update      [2-1] WebSocket ★          [6-3] Zero Telemetry
          (no remaining deps)    (CRITICAL PATH)            (no remaining deps)
                                        │
                         ┌──────────────┼──────────────┐
                         │              │              │
                    [2-2] Text     [3-1] Voice    [5-2] User
                    Messaging ★★   Server ★       Management
                         │              │
                    ┌────┴────┐    [3-2] Join/
                    │         │    Leave ★
               [2-3] Feed  [5-1] Channel    │
               & UI        Management  ┌────┼──────────┐
                    │                   │    │          │
               [2-4] History      [3-3] Audio [4-1] Video [6-1] Connection
               & Scrollback       Indicators ★ Toggle     Resilience
                                       │          │
                                  [3-4] Device [4-2] Video
                                  Controls ★   Grid ←─── also needs [3-3]
                                       │          │
                                       └────┬─────┘
                                            │
                                     [6-4] Production
                                     Deployment
                                            │
                                     [6-5] CI/CD
                                     Pipeline

★  = Critical path story
★★ = Key enabler (unblocks 5-1)
```

---

## Story-by-Story Dependency Matrix

| Story | Title | Hard Dependencies | Rationale |
|-------|-------|-------------------|-----------|
| **2-1** | WebSocket Connection & Real-Time Transport | Epic 1 (done) | JWT auth gates WebSocket access; no other remaining blockers |
| **2-2** | Encrypted Text Messaging | **2-1** | Sends/receives messages over WebSocket; uses encryption from 1-5 (done). Creates the messages table in SQLite. |
| **2-3** | Message Feed & Channel Navigation UI | **2-2** | Needs message data to render; extends app shell from 1-6 (done) |
| **2-4** | Persistent Message History & Scrollback | **2-3** | Needs message feed UI to integrate scrollback and history loading |
| **3-1** | Voice Server Infrastructure | **2-1** | Voice signaling (`voice:join`, `rtc:offer`, etc.) travels over WebSocket |
| **3-2** | Voice Channel Join, Leave & Presence | **3-1** | Requires mediasoup transports and coturn from 3-1 |
| **3-3** | Real-Time Voice Audio & Speaking Indicators | **3-2** | Requires active voice connections to produce/consume audio |
| **3-4** | Audio Device Management & Voice Controls | **3-3** | Needs working audio tracks for device switching; mute icon depends on voice UI |
| **4-1** | Video Camera Toggle & Streaming | **3-2** | Adds video tracks to existing voice transport; voice status bar toggle button from 3-2 |
| **4-2** | Video Grid Display | **4-1, 3-3** | Renders video streams from 4-1; speaking indicator (green border) on video tiles requires speaking detection from 3-3 |
| **5-1** | Channel Management | **2-1, 2-2** | WebSocket broadcasts (`channel:created/deleted`); AC requires "all associated messages are permanently removed" on channel delete — needs the messages table created by 2-2 |
| **5-2** | User Management & Administration | **2-1** | WebSocket notifications (`user:kicked/banned`); session invalidation cascades to WebSocket disconnect (and transitively to voice if active) |
| **6-1** | Connection Resilience & Error Handling | **2-1, 3-2** | Handles WebSocket reconnection + voice manual rejoin; AC explicitly states "voice must be manually rejoined" |
| **6-2** | Auto-Update System | Epic 1 (done) | Pure Electron feature (electron-updater); no feature dependencies |
| **6-3** | Privacy Enforcement & Zero Telemetry | Epic 1 (done) | Configures Pino exclusions + disables Chromium telemetry; guards are preventative |
| **6-4** | Production Deployment Infrastructure | All feature stories | Docker Compose includes coturn (3-1) + full app server; should come after all features for production readiness |
| **6-5** | CI/CD Pipeline & Cross-Platform Distribution | **6-4** | Server Dockerfile defined in 6-4; publishes to GitHub Releases (consumed by 6-2's auto-updater) |

### Changes From v1 (and why)

| Story | v1 Deps | Corrected Deps | What Was Missed |
|-------|---------|----------------|-----------------|
| **5-1** | 2-1 only | **2-1, 2-2** | AC: "all associated messages are permanently removed" on channel delete. Can't implement cascade delete without the messages table that 2-2 creates. **Moved from Wave 2 → Wave 3.** |
| **5-2** | 2-1 only | **2-1** (soft: 3-2) | Kick invalidates sessions → WebSocket drops → voice disconnects naturally via cascade. Hard dep is still just 2-1, but testing kick-from-voice requires 3-2. **Stays Wave 2; soft dep noted.** |
| **4-2** | 4-1 only | **4-1, 3-3** | AC: "speaking indicator activates... green border/glow" on video tiles. Can't render speaking state without speaking detection from 3-3. **Wave unchanged (both deps in prior wave), but dependency now explicit.** |

All other stories: dependencies confirmed correct through line-by-line AC review.

---

## Critical Path

The longest dependency chain determines the minimum possible project duration:

```
2-1 → 3-1 → 3-2 → 3-3 → 3-4 → 6-4 → 6-5
 ★      ★      ★      ★      ★
```

**7 stories in sequence.** Every day saved on a critical path story saves a day on the total project. Non-critical-path stories can be deferred or interleaved without affecting the end date.

The critical path runs entirely through the **voice pipeline**. This is the longest chain because mediasoup/coturn/WebRTC are the most technically complex features in the project.

---

## Parallel Execution Waves

Each wave contains stories whose **hard dependencies** are fully satisfied by all prior waves. Stories within a wave are independent of each other and can be worked simultaneously.

### Wave 1 — Immediate Start (3 stories, 0 blockers)

| Story | Title | Effort Est. | Notes |
|-------|-------|-------------|-------|
| **2-1** ★ | WebSocket Connection & Real-Time Transport | Large | **CRITICAL PATH.** Unblocks 5 stories directly. Highest priority. |
| 6-2 | Auto-Update System | Small | Standalone Electron feature. Low risk. Good warmup task. |
| 6-3 | Privacy Enforcement & Zero Telemetry | Small | Standalone audit/config task. Low risk. Good warmup task. |

> **Parallel capacity:** 3 concurrent developers
> **Recommendation:** 2-1 is the bottleneck — assign your strongest dev or start it first if solo.

---

### Wave 2 — After 2-1 Completes (3 stories)

| Story | Title | Effort Est. | Notes |
|-------|-------|-------------|-------|
| **3-1** ★ | Voice Server Infrastructure | Large | **CRITICAL PATH.** mediasoup + coturn + signaling. Technically complex. |
| 2-2 | Encrypted Text Messaging | Medium | Uses WebSocket from 2-1 + encryption from 1-5. Creates messages table. Unblocks 5-1. |
| 5-2 | User Management & Administration | Medium | Kick/ban/unban + WebSocket notifications. Soft dep on 3-2 for voice-kick testing — core functionality works without it. |

> **Parallel capacity:** 3 concurrent developers
> **Recommendation:** If solo, prioritize **3-1** (critical path), then **2-2** (key enabler that unblocks 5-1 and the text pipeline).

---

### Wave 3 — After Wave 2 Deps (3 stories)

| Story | Title | Blocked By | Effort Est. | Notes |
|-------|-------|------------|-------------|-------|
| **3-2** ★ | Voice Channel Join, Leave & Presence | 3-1 | Large | **CRITICAL PATH.** Unblocks 3-3, 4-1, and 6-1. |
| 2-3 | Message Feed & Channel Navigation UI | 2-2 | Medium | Message display, grouping, input bar, channel switching. |
| 5-1 | Channel Management | 2-2 | Medium | Create/delete channels, WebSocket broadcasts, message cascade delete. |

> **Parallel capacity:** 3 concurrent developers
> **Recommendation:** If solo, prioritize **3-2** (critical path). 2-3 and 5-1 are both unblocked by 2-2 and can follow in either order.

---

### Wave 4 — After Wave 3 Deps (4 stories)

| Story | Title | Blocked By | Effort Est. | Notes |
|-------|-------|------------|-------------|-------|
| **3-3** ★ | Real-Time Voice Audio & Speaking Indicators | 3-2 | Large | **CRITICAL PATH.** Audio producers/consumers + speaking detection. Also unblocks 4-2. |
| 4-1 | Video Camera Toggle & Streaming | 3-2 | Medium | Adds video track to existing voice transport. Soft dep on 3-3 (audio should ideally work before adding video). |
| 2-4 | Persistent Message History & Scrollback | 2-3 | Medium | REST message fetch, pagination, auto-scroll, "new messages" indicator. |
| 6-1 | Connection Resilience & Error Handling | 2-1, 3-2 | Medium | Reconnection banner, exponential backoff, voice manual rejoin. |

> **Parallel capacity:** 4 concurrent developers (peak parallelism)
> **Recommendation:** If solo, prioritize **3-3** (critical path). 4-1 is a natural follow-up since it builds on the same transport layer.

---

### Wave 5 — After Wave 4 Deps (2 stories)

| Story | Title | Blocked By | Effort Est. | Notes |
|-------|-------|------------|-------------|-------|
| **3-4** ★ | Audio Device Management & Voice Controls | 3-3 | Medium | **CRITICAL PATH.** Device selection, mute/deafen, keyboard shortcuts. |
| 4-2 | Video Grid Display | **4-1 + 3-3** | Medium | Responsive grid, username overlay, speaking indicator (green border) on tiles. Dual dependency: needs video streams (4-1) AND speaking detection (3-3). |

> **Parallel capacity:** 2 concurrent developers
> **Recommendation:** Both can run in parallel. 3-4 is on critical path.

---

### Wave 6 — After All Features (1 story)

| Story | Title | Blocked By | Effort Est. |
|-------|-------|------------|-------------|
| 6-4 | Production Deployment Infrastructure | All feature stories | Large |

> Docker Compose (app + coturn + nginx), TLS via Let's Encrypt, invite landing page, custom protocol handler. Must come after all features for a production-ready deployment.

---

### Wave 7 — Final (1 story)

| Story | Title | Blocked By | Effort Est. |
|-------|-------|------------|-------------|
| 6-5 | CI/CD Pipeline & Cross-Platform Distribution | 6-4 | Medium |

> GitHub Actions, cross-platform Electron builds, server Docker image. Last story in the project. Publishes to GitHub Releases (consumed by 6-2's auto-updater).

---

## Optimal Solo Developer Execution Order

For a solo developer, total project time = sum of all story durations (no true parallelism). The optimization is: **always prioritize the critical path**, and **group related stories to minimize context switching**.

| # | Story | Wave | Critical Path? | Why This Order |
|---|-------|------|----------------|----------------|
| 1 | **2-1** WebSocket | W1 | YES | Unblocks everything. Do this first, no question. |
| 2 | **3-1** Voice Server Infra | W2 | YES | Critical path. Start the technically hardest chain early. |
| 3 | **2-2** Encrypted Text Messaging | W2 | No | Key enabler — unblocks both 5-1 and the text UI pipeline. Good context switch from mediasoup. |
| 4 | **3-2** Voice Join/Leave & Presence | W3 | YES | Critical path. Unblocks 3-3, 4-1, and 6-1. |
| 5 | **2-3** Message Feed & Channel UI | W3 | No | Text pipeline continues. Context switch from voice work. |
| 6 | **5-1** Channel Management | W3 | No | Admin CRUD while text context is warm. All deps (2-1, 2-2) satisfied. |
| 7 | **3-3** Voice Audio & Speaking Indicators | W4 | YES | Critical path. Core voice experience. |
| 8 | **4-1** Video Camera Toggle | W4 | No | Builds on voice transport from 3-2. Natural follow-on from 3-3. |
| 9 | **3-4** Audio Device Mgmt & Controls | W5 | YES | Critical path. Completes voice feature set. |
| 10 | **4-2** Video Grid Display | W5 | No | Completes video. Both deps (4-1, 3-3) now satisfied. |
| 11 | **2-4** Message History & Scrollback | W4 | No | Completes text feature set. |
| 12 | **5-2** User Management & Admin | W2 | No | Admin feature. All core features exist. Voice-kick cascade testable now. |
| 13 | **6-1** Connection Resilience | W4 | No | Polish. All connection types (WS + voice) are stable. |
| 14 | **6-2** Auto-Update System | W1 | No | Standalone. Slot in during any downtime. |
| 15 | **6-3** Privacy Enforcement | W1 | No | Standalone. Slot in during any downtime. |
| 16 | **6-4** Production Deployment | W6 | No | After all features are complete. |
| 17 | **6-5** CI/CD Pipeline | W7 | No | Final story. |

### Solo Strategy Notes

- **Stories 1-2** (2-1 → 3-1): Get WebSocket up, then immediately jump to voice infra. This frontloads the two hardest stories.
- **Story 3** (2-2): Break from voice to stand up text messaging. This gives you a working chat app to demo while voice matures.
- **Stories 4-6** (3-2, 2-3, 5-1): All three are in Wave 3. Knock out the critical path story first (3-2), then complete the text UI and admin channels.
- **Stories 7-8** (3-3, 4-1): Core audio + video in the same stretch while WebRTC/mediasoup knowledge is fresh.
- **Stories 9-13**: Sweep up remaining features in any order — all deps are satisfied.
- **Stories 14-15** (6-2, 6-3): Zero-dep polish stories. Slot these in between larger stories as palate cleansers, or batch them at the end.
- **Stories 16-17** (6-4, 6-5): Always last. Deployment and CI/CD wrap up the project.

---

## Multi-Developer Capacity Analysis

| Wave | Stories | Max Parallel Devs | Cumulative Stories Done |
|------|---------|-------------------|------------------------|
| W1 | 2-1, 6-2, 6-3 | 3 | 3 |
| W2 | 3-1, 2-2, 5-2 | 3 | 6 |
| W3 | 3-2, 2-3, 5-1 | 3 | 9 |
| W4 | 3-3, 4-1, 2-4, 6-1 | 4 | 13 |
| W5 | 3-4, 4-2 | 2 | 15 |
| W6 | 6-4 | 1 | 16 |
| W7 | 6-5 | 1 | 17 |

**Peak parallelism:** 4 developers (Wave 4)
**Consistent parallelism:** 3 developers (Waves 1-3)
**Minimum waves to complete:** 7 (regardless of team size)
**Total stories remaining:** 17 (including 6-2 and 6-3 which have zero blockers)

### Team Size Recommendations

- **1 dev:** Follow the solo execution order above. ~17 story-units of work in strict sequence.
- **2 devs:** Dev A takes the critical path (voice/video chain). Dev B takes text + admin + polish. Both devs stay productive through Wave 5.
- **3 devs:** Each dev "owns" a stream: (A) voice chain, (B) text chain, (C) admin + polish. Peak efficiency through Wave 3, then C helps with Wave 4.
- **4 devs:** Maximum utilization only in Wave 4. One dev will be idle in Waves 1-3 and 5-7. Best to have the 4th dev handle 6-2, 6-3, then assist on larger stories.

---

## Risk Notes

1. **2-1 is the single biggest bottleneck.** It blocks 5 downstream stories directly and sits on the critical path. Any delay here cascades through the entire project.
2. **Voice stories (3-1 through 3-4) are technically complex.** mediasoup, coturn, and WebRTC have steep learning curves. Budget extra time. These are the critical path.
3. **2-2 is a key enabler.** Beyond feeding the text pipeline, it creates the messages table that 5-1 needs for cascade deletes. Completing 2-2 early maximizes downstream options.
4. **4-2 has a dual dependency** (4-1 + 3-3) that isn't obvious. The speaking indicator on video tiles requires 3-3's speaking detection. Both must complete before 4-2 can start.
5. **5-2 works without voice but is incomplete.** Kick/ban core logic only needs WebSocket (2-1), but testing the full kick-from-voice cascade requires 3-2. Implement core first, verify voice cascade integration after 3-2 lands.
6. **6-2 and 6-3 are zero-dependency freebies.** Good for warming up, filling gaps between waves, or onboarding a new contributor.
7. **6-4 (Docker Compose) requires coturn from 3-1.** Don't start deployment infra until voice server infrastructure is proven and all features are complete.
