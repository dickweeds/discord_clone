# Dependency Map & Parallel Execution Plan

**Generated:** 2026-02-24
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
                 ┌──────────┬───────────┼───────────┬───────────┐
                 │          │           │           │           │
            [2-2] Text  [3-1] Voice [5-1] Channel [5-2] User
            Messaging   Server ★    Management    Management
                 │          │
            [2-3] Feed  [3-2] Join/
            & UI        Leave ★
                 │          │
            [2-4] History   ├──────────┬───────────┐
            & Scrollback    │          │           │
                       [3-3] Audio [4-1] Video [6-1] Connection
                       Indicators ★ Toggle     Resilience
                            │          │
                       [3-4] Device [4-2] Video
                       Controls ★   Grid
                            │          │
                            └────┬─────┘
                                 │
                          [6-4] Production
                          Deployment
                                 │
                          [6-5] CI/CD
                          Pipeline

★ = Critical path story
```

---

## Story-by-Story Dependency Matrix

| Story | Title | Hard Dependencies | Rationale |
|-------|-------|-------------------|-----------|
| **2-1** | WebSocket Connection & Real-Time Transport | Epic 1 (done) | JWT auth gates WebSocket access; no other remaining blockers |
| **2-2** | Encrypted Text Messaging | 2-1 | Sends/receives messages over WebSocket; uses encryption from 1-5 (done) |
| **2-3** | Message Feed & Channel Navigation UI | 2-2 | Needs message data to render; extends app shell from 1-6 (done) |
| **2-4** | Persistent Message History & Scrollback | 2-3 | Needs message feed UI to integrate scrollback and history loading |
| **3-1** | Voice Server Infrastructure | 2-1 | Voice signaling (`voice:join`, `rtc:offer`, etc.) travels over WebSocket |
| **3-2** | Voice Channel Join, Leave & Presence | 3-1 | Requires mediasoup transports and coturn from 3-1 |
| **3-3** | Real-Time Voice Audio & Speaking Indicators | 3-2 | Requires active voice connections to produce/consume audio |
| **3-4** | Audio Device Management & Voice Controls | 3-3 | Refines voice experience; needs working audio streams |
| **4-1** | Video Camera Toggle & Streaming | 3-2 | Adds video tracks to existing voice connection; must be in a voice channel |
| **4-2** | Video Grid Display | 4-1 | Renders video streams produced by 4-1 |
| **5-1** | Channel Management | 2-1 | `channel:created` / `channel:deleted` WebSocket broadcasts |
| **5-2** | User Management & Administration | 2-1 | `user:kicked` / `user:banned` WebSocket notifications; session invalidation |
| **6-1** | Connection Resilience & Error Handling | 2-1, 3-2 | Handles WebSocket reconnection + voice manual rejoin |
| **6-2** | Auto-Update System | Epic 1 (done) | Pure Electron feature; no feature dependencies |
| **6-3** | Privacy Enforcement & Zero Telemetry | Epic 1 (done) | Configures Pino + disables Chromium telemetry; no feature dependencies |
| **6-4** | Production Deployment Infrastructure | 3-1, all features | Docker Compose includes coturn + app; should come after all features |
| **6-5** | CI/CD Pipeline & Cross-Platform Distribution | 6-4 | Builds and distributes what 6-4 defines |

---

## Critical Path

The longest dependency chain determines the minimum possible project duration:

```
2-1 → 3-1 → 3-2 → 3-3 → 3-4 → 6-4 → 6-5
 ★      ★      ★      ★      ★
```

**7 stories in sequence.** Every day saved on a critical path story saves a day on the total project. Non-critical-path stories can be deferred or interleaved without affecting the end date.

---

## Parallel Execution Waves

Each wave contains stories whose dependencies are fully satisfied by all prior waves. Stories within a wave are **independent of each other** and can be worked simultaneously.

### Wave 1 — Immediate Start (3 stories, 0 blockers)

| Story | Title | Effort Est. | Notes |
|-------|-------|-------------|-------|
| **2-1** ★ | WebSocket Connection & Real-Time Transport | Large | **CRITICAL PATH.** Unblocks 6 stories. Highest priority. |
| 6-2 | Auto-Update System | Small | Standalone Electron feature. Low risk. |
| 6-3 | Privacy Enforcement & Zero Telemetry | Small | Standalone audit/config task. Low risk. |

> **Parallel capacity:** 3 concurrent developers
> **Recommendation:** 2-1 is the bottleneck — assign your strongest dev or start it first if solo.

---

### Wave 2 — After 2-1 Completes (4 stories)

| Story | Title | Effort Est. | Notes |
|-------|-------|-------------|-------|
| **3-1** ★ | Voice Server Infrastructure | Large | **CRITICAL PATH.** mediasoup + coturn + signaling. |
| 2-2 | Encrypted Text Messaging | Medium | Uses WebSocket from 2-1 + encryption from 1-5. |
| 5-1 | Channel Management | Medium | Admin CRUD + WebSocket broadcasts. Independent of text/voice. |
| 5-2 | User Management & Administration | Medium | Admin kick/ban + WebSocket notifications. Independent of 5-1. |

> **Parallel capacity:** 4 concurrent developers
> **Recommendation:** If solo, prioritize **3-1** (critical path), then **2-2** (unblocks the text pipeline).

---

### Wave 3 — After Wave 2 Deps (2 stories)

| Story | Title | Blocked By | Effort Est. |
|-------|-------|------------|-------------|
| **3-2** ★ | Voice Channel Join, Leave & Presence | 3-1 | Large |
| 2-3 | Message Feed & Channel Navigation UI | 2-2 | Medium |

> **Parallel capacity:** 2 concurrent developers
> **Recommendation:** If solo, prioritize **3-2** (critical path).

---

### Wave 4 — After Wave 3 Deps (4 stories)

| Story | Title | Blocked By | Effort Est. |
|-------|-------|------------|-------------|
| **3-3** ★ | Real-Time Voice Audio & Speaking Indicators | 3-2 | Large |
| 4-1 | Video Camera Toggle & Streaming | 3-2 | Medium |
| 2-4 | Persistent Message History & Scrollback | 2-3 | Medium |
| 6-1 | Connection Resilience & Error Handling | 2-1, 3-2 | Medium |

> **Parallel capacity:** 4 concurrent developers
> **Recommendation:** If solo, prioritize **3-3** (critical path). 4-1 and 6-1 are good secondary picks since they share the 3-2 dependency.

---

### Wave 5 — After Wave 4 Deps (2 stories)

| Story | Title | Blocked By | Effort Est. |
|-------|-------|------------|-------------|
| **3-4** ★ | Audio Device Management & Voice Controls | 3-3 | Medium |
| 4-2 | Video Grid Display | 4-1 | Medium |

> **Parallel capacity:** 2 concurrent developers
> **Recommendation:** Both can run in parallel. 3-4 is on critical path.

---

### Wave 6 — After All Features (1 story)

| Story | Title | Blocked By | Effort Est. |
|-------|-------|------------|-------------|
| 6-4 | Production Deployment Infrastructure | All feature stories | Large |

> Docker Compose (app + coturn + nginx), TLS, invite landing page. Must come after voice/video infrastructure exists.

---

### Wave 7 — Final (1 story)

| Story | Title | Blocked By | Effort Est. |
|-------|-------|------------|-------------|
| 6-5 | CI/CD Pipeline & Cross-Platform Distribution | 6-4 | Medium |

> GitHub Actions, cross-platform Electron builds, server Docker image. Last story in the project.

---

## Optimal Solo Developer Execution Order

If you're working alone, follow this order to minimize total project duration by always prioritizing the critical path while batching convenient non-critical work:

| # | Story | Wave | Critical Path? | Why This Order |
|---|-------|------|----------------|----------------|
| 1 | **2-1** WebSocket | W1 | YES | Unblocks everything. Do this first. |
| 2 | **3-1** Voice Server Infra | W2 | YES | Critical path. Unblocks voice + video chains. |
| 3 | **2-2** Encrypted Text Messaging | W2 | No | Unblocks the text UI pipeline while 3-1 knowledge is fresh. |
| 4 | **3-2** Voice Join/Leave & Presence | W3 | YES | Critical path. Unblocks 3-3, 4-1, and 6-1. |
| 5 | **2-3** Message Feed & Channel UI | W3 | No | Text pipeline continues. Good context switch from voice. |
| 6 | **3-3** Voice Audio & Speaking Indicators | W4 | YES | Critical path. Core voice experience. |
| 7 | **4-1** Video Camera Toggle | W4 | No | Builds on 3-2 work while voice context is warm. |
| 8 | **3-4** Audio Device Mgmt & Controls | W5 | YES | Critical path. Completes voice feature set. |
| 9 | **4-2** Video Grid Display | W5 | No | Completes video feature set. |
| 10 | **2-4** Message History & Scrollback | W4 | No | Completes text feature set. |
| 11 | **5-1** Channel Management | W2 | No | Admin feature. Can be done anytime after 2-1. |
| 12 | **5-2** User Management & Admin | W2 | No | Admin feature. Can be done anytime after 2-1. |
| 13 | **6-1** Connection Resilience | W4 | No | Polish. Better after voice + WS are stable. |
| 14 | **6-2** Auto-Update System | W1 | No | Standalone. Slot in during any downtime. |
| 15 | **6-3** Privacy Enforcement | W1 | No | Standalone. Slot in during any downtime. |
| 16 | **6-4** Production Deployment | W6 | No | After all features are complete. |
| 17 | **6-5** CI/CD Pipeline | W7 | No | Final story. |

---

## Multi-Developer Capacity Analysis

| Wave | Stories Available | Max Parallel Devs | Cumulative Stories Done |
|------|------------------|--------------------|------------------------|
| W1 | 3 | 3 | 3 |
| W2 | 4 | 4 | 7 |
| W3 | 2 | 2 | 9 |
| W4 | 4 | 4 | 13 |
| W5 | 2 | 2 | 15 |
| W6 | 1 | 1 | 16 |
| W7 | 1 | 1 | 17 |

**Peak parallelism:** 4 developers (Waves 2 and 4)
**Minimum waves to complete:** 7 (regardless of team size)
**Total stories remaining:** 17 (including 6-2 and 6-3 which have zero blockers)

---

## Risk Notes

1. **2-1 is the single biggest bottleneck.** It blocks 6 downstream stories and sits on the critical path. Any delay here cascades through the entire project.
2. **Voice stories (3-1 through 3-4) are technically complex.** mediasoup, coturn, and WebRTC have steep learning curves. Budget extra time for these.
3. **5-1 and 5-2 are the most flexible.** They only need 2-1 and can be slotted in whenever there's capacity without affecting the critical path.
4. **6-2 and 6-3 are zero-dependency freebies.** Good for warming up, filling gaps between waves, or onboarding a new contributor.
5. **6-4 (Docker Compose) requires coturn configuration from 3-1.** Don't start deployment infra until voice server infrastructure is proven.