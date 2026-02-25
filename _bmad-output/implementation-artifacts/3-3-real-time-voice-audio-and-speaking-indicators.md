# Story 3.3: Real-Time Voice Audio & Speaking Indicators

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to speak and hear other participants with instant, clear audio and see who's talking,
So that voice feels as natural as being in the same room.

## Acceptance Criteria

1. **Given** I am in a voice channel with other participants **When** I speak into my microphone **Then** all other participants hear my audio in real-time with less than 100ms latency

2. **Given** other participants are speaking **When** their audio is transmitted **Then** I hear them clearly with no echo, no clipping, and no perceptible delay

3. **Given** a voice channel **When** up to 20 users are connected **Then** all participants can speak and hear each other **And** voice quality remains stable

4. **Given** voice audio is transmitted **When** data flows between clients and the SFU **Then** DTLS/SRTP encryption secures the audio in transit

5. **Given** I am speaking **When** my voice is detected **Then** a green speaking indicator (ring/glow) appears around my avatar in the participant list **And** the indicator updates in real-time with zero perceptible delay **And** the animation uses a subtle pulse, not a flash

6. **Given** the user has `prefers-reduced-motion` enabled **When** speaking indicators are displayed **Then** a static green ring is used instead of the pulse animation

7. **Given** another participant is speaking **When** their voice is detected **Then** a green speaking indicator appears around their avatar in the participant list

## Tasks / Subtasks

- [x] Task 1: Create VAD (Voice Activity Detection) service (AC: 5, 7)
  - [x] 1.1 Create `client/src/renderer/src/services/vadService.ts`
  - [x] 1.2 Implement `startLocalVAD(stream: MediaStream, onSpeakingChange: (speaking: boolean) => void)` using Web Audio API `AudioContext` → `MediaStreamSource` → `AnalyserNode` → poll `getByteFrequencyData()` at ~50ms interval
  - [x] 1.3 Implement energy threshold detection: compute RMS of frequency data, compare against threshold (~15-20 on 0-255 scale), with 250ms hold time to avoid flickering
  - [x] 1.4 Implement `startRemoteVAD(consumer: Consumer, peerId: string, onSpeakingChange: (peerId: string, speaking: boolean) => void)` — same AnalyserNode approach on consumer track's MediaStream
  - [x] 1.5 Implement `stopLocalVAD()` and `stopRemoteVAD(peerId: string)` — disconnect AnalyserNodes, clear intervals, close AudioContext nodes
  - [x] 1.6 Implement `stopAllVAD()` — cleanup all VAD instances (called on voice leave)
  - [x] 1.7 Export: `startLocalVAD`, `startRemoteVAD`, `stopLocalVAD`, `stopRemoteVAD`, `stopAllVAD`

- [x] Task 2: Add speaking state to useVoiceStore (AC: 5, 7)
  - [x] 2.1 Add `speakingUsers: Set<string>` to VoiceState interface
  - [x] 2.2 Add `setSpeaking(userId: string, isSpeaking: boolean)` action — adds/removes userId from `speakingUsers` Set
  - [x] 2.3 Initialize `speakingUsers: new Set()` in store default state
  - [x] 2.4 Clear `speakingUsers` in `leaveChannel()` and `localCleanup()`

- [x] Task 3: Wire VAD into voice join/leave lifecycle (AC: 5, 7)
  - [x] 3.1 In `voiceService.ts` `joinVoiceChannel()`: after `produceAudio()` returns, call `vadService.startLocalVAD(localStream, callback)` where callback calls `useVoiceStore.getState().setSpeaking(userId, speaking)`
  - [x] 3.2 In `wsClient.ts` `handleNewProducer()`: after `consumeAudio()` returns, call `vadService.startRemoteVAD(consumer, peerId, callback)` where callback calls `useVoiceStore.getState().setSpeaking(peerId, speaking)`
  - [x] 3.3 In `voiceService.ts` `cleanupMedia()`: call `vadService.stopAllVAD()` before closing transports
  - [x] 3.4 In `wsClient.ts` `VOICE_PRODUCER_CLOSED` handler: call `vadService.stopRemoteVAD(peerId)` before removing consumer
  - [x] 3.5 Export `getLocalStream()` from `mediaService.ts` so VAD can access the mic stream

- [x] Task 4: Implement actual mute functionality (AC: 1)
  - [x] 4.1 Add `muteAudio()` to `mediaService.ts` — sets `producer.track.enabled = false`, stops local VAD
  - [x] 4.2 Add `unmuteAudio()` to `mediaService.ts` — sets `producer.track.enabled = true`, restarts local VAD
  - [x] 4.3 Update `toggleMute()` in `useVoiceStore` to call `mediaService.muteAudio()` / `mediaService.unmuteAudio()`
  - [x] 4.4 When muted, clear self from `speakingUsers`

- [x] Task 5: Implement actual deafen functionality (AC: 2)
  - [x] 5.1 Add `deafenAudio()` to `mediaService.ts` — mutes all consumer audio elements (set `audio.muted = true` on each), also mutes mic (deafen implies mute)
  - [x] 5.2 Add `undeafenAudio()` to `mediaService.ts` — unmutes all consumer audio elements, restores mic to previous mute state
  - [x] 5.3 Update `toggleDeafen()` in `useVoiceStore` to call `mediaService.deafenAudio()` / `mediaService.undeafenAudio()`, and sync `isMuted` state (deafen always sets muted=true, undeafen restores prior mute state)

- [x] Task 6: Update VoiceParticipant with speaking indicator (AC: 5, 6, 7)
  - [x] 6.1 Read `speakingUsers` from `useVoiceStore` in `VoiceParticipant`
  - [x] 6.2 When `speakingUsers.has(userId)`, add `ring-2 ring-voice-speaking` classes to avatar div
  - [x] 6.3 Add CSS animation `animate-speaking-pulse` in `globals.css`: subtle opacity pulse on the ring (1s ease-in-out infinite)
  - [x] 6.4 Apply `animate-speaking-pulse` when speaking AND `prefers-reduced-motion` is NOT set
  - [x] 6.5 When `prefers-reduced-motion` is set, use static `ring-2 ring-voice-speaking` with no animation
  - [x] 6.6 Use `window.matchMedia('(prefers-reduced-motion: reduce)')` or a Tailwind `motion-reduce:` variant
  - [x] 6.7 Add ARIA live region: `aria-label` updates to include "(speaking)" when active

- [x] Task 7: Add mute icon overlay to VoiceParticipant (AC: related to 3.4 but deferred from 3.2)
  - [x] 7.1 Read `isMuted` state — for local user from `useVoiceStore.isMuted`, for remote users this requires broadcasting mute state (defer remote mute display to 3.4, only show local user's mute icon for now)
  - [x] 7.2 When local user is muted, show small `MicOff` icon (12px) overlaid on bottom-right of avatar
  - [x] 7.3 Style: `absolute bottom-0 right-0 bg-bg-primary rounded-full p-0.5`

- [x] Task 8: Write tests (AC: 1-7)
  - [x] 8.1 Create `client/src/renderer/src/services/vadService.test.ts`:
    - Test `startLocalVAD()` creates AudioContext, AnalyserNode, starts polling
    - Test speaking detection fires callback when energy exceeds threshold
    - Test silence detection fires callback after hold time
    - Test `stopLocalVAD()` cleans up all resources
    - Test `startRemoteVAD()` creates per-peer VAD instance
    - Test `stopRemoteVAD()` cleans up specific peer's VAD
    - Test `stopAllVAD()` cleans up everything
    - Mock Web Audio API: AudioContext, AnalyserNode, MediaStreamAudioSourceNode
  - [x] 8.2 Update `client/src/renderer/src/stores/useVoiceStore.test.ts`:
    - Test `setSpeaking()` adds/removes from speakingUsers Set
    - Test `leaveChannel()` clears speakingUsers
    - Test `localCleanup()` clears speakingUsers
    - Test `toggleMute()` calls mediaService.muteAudio/unmuteAudio
    - Test `toggleDeafen()` calls mediaService.deafenAudio/undeafenAudio
    - Test deafen sets isMuted = true
  - [x] 8.3 Update `client/src/renderer/src/features/voice/VoiceParticipant.test.tsx`:
    - Test speaking indicator ring appears when user is in speakingUsers
    - Test speaking indicator ring absent when user is not speaking
    - Test mute icon overlay appears when local user is muted
    - Test ARIA label includes "(speaking)" when speaking
  - [x] 8.4 Update `client/src/renderer/src/services/mediaService.test.ts`:
    - Test `muteAudio()` sets producer.track.enabled = false
    - Test `unmuteAudio()` sets producer.track.enabled = true
    - Test `deafenAudio()` mutes all consumer audio elements
    - Test `undeafenAudio()` unmutes all consumer audio elements
    - Test `getLocalStream()` returns the stream

- [x] Task 9: Final verification (AC: 1-7)
  - [x] 9.1 Run `npm test -w client` — all new + existing tests pass
  - [x] 9.2 Run `npm run lint` — no lint errors
  - [x] 9.3 Run `npm run build -w client` — builds successfully
  - [ ] 9.4 Manual test: join voice channel, speak → green ring appears around own avatar
  - [ ] 9.5 Manual test: other user speaks → green ring appears around their avatar
  - [ ] 9.6 Manual test: stop speaking → green ring disappears after ~250ms hold time
  - [ ] 9.7 Manual test: click mute → mic actually stops transmitting, speaking indicator cannot activate while muted
  - [ ] 9.8 Manual test: click deafen → all incoming audio silenced AND mic muted
  - [ ] 9.9 Manual test: undeafen → audio resumes, mic restores to pre-deafen mute state
  - [ ] 9.10 Manual test: with 2+ users, all participants can hear each other clearly
  - [ ] 9.11 Manual test: enable `prefers-reduced-motion` → speaking indicator is static ring, no pulse

## Dev Notes

### Critical: VAD Implementation — Web Audio API AnalyserNode

Voice Activity Detection is **purely client-side** — no server changes needed. Each client independently detects who is speaking by analyzing audio energy from both local mic and remote consumer tracks.

**Architecture:**

```
Local mic:   MediaStream → AudioContext → MediaStreamSource → AnalyserNode → poll getByteFrequencyData()
Remote peer: consumer.track → new MediaStream([track]) → AudioContext → MediaStreamSource → AnalyserNode → poll
```

**VAD Algorithm:**

```typescript
// Core detection loop (~50ms polling interval)
const dataArray = new Uint8Array(analyser.frequencyBinCount)
analyser.getByteFrequencyData(dataArray)

// Compute RMS energy
const sum = dataArray.reduce((acc, val) => acc + val * val, 0)
const rms = Math.sqrt(sum / dataArray.length)

// Threshold comparison with hold time
const SPEAKING_THRESHOLD = 15  // Tune: 10-25 range on 0-255 scale
const HOLD_TIME_MS = 250       // Prevent rapid on/off flickering

if (rms > SPEAKING_THRESHOLD) {
  if (!isSpeaking) { isSpeaking = true; onSpeakingChange(true) }
  lastSpeakingTime = Date.now()
} else if (isSpeaking && Date.now() - lastSpeakingTime > HOLD_TIME_MS) {
  isSpeaking = false
  onSpeakingChange(false)
}
```

**Key design decisions:**
- **Per-peer AudioContext/AnalyserNode** for remote VAD (one per consumer). Max ~20 concurrent AnalyserNodes is fine — they're lightweight
- **Single AudioContext** for local VAD — reuse it for the lifetime of the voice session
- **50ms polling interval** balances responsiveness vs CPU overhead. Faster than 30ms adds CPU for negligible UX gain
- **250ms hold time** prevents the speaking indicator from flickering during natural speech pauses
- **AnalyserNode.fftSize = 256** (default) is sufficient — we only need energy magnitude, not detailed frequency analysis

**CRITICAL: AnalyserNode on consumer tracks requires a connected audio graph.**
The AnalyserNode must be connected to the AudioContext destination (or a GainNode connected to destination) for `getByteFrequencyData()` to return non-zero data. Since remote audio is already playing via `HTMLAudioElement`, create a *parallel* audio path:

```typescript
// Remote VAD setup — does NOT replace the existing HTMLAudioElement playback
const audioCtx = new AudioContext()
const source = audioCtx.createMediaStreamSource(new MediaStream([consumer.track]))
const analyser = audioCtx.createAnalyser()
analyser.fftSize = 256
source.connect(analyser)
// Connect to destination BUT at zero volume to avoid double-audio
const gain = audioCtx.createGain()
gain.gain.value = 0  // Silent — analysis only, no audible output
analyser.connect(gain)
gain.connect(audioCtx.destination)
```

This ensures the AnalyserNode receives data without producing audible double-audio.

### Critical: Mute/Deafen — Actual Audio Control

Story 3-2 implemented `isMuted` / `isDeafened` as **UI-only boolean flags** with no actual audio effect. This story makes them functional.

**Mute implementation:**

```typescript
// mediaService.ts
export function muteAudio(): void {
  if (producer && producer.track) {
    producer.track.enabled = false  // Stops sending audio to SFU
  }
}
export function unmuteAudio(): void {
  if (producer && producer.track) {
    producer.track.enabled = true   // Resumes sending audio to SFU
  }
}
```

Using `track.enabled = false` is the correct approach — it stops audio frames from being sent to the SFU while keeping the producer alive. Do NOT call `producer.pause()` (that's a mediasoup server-side concept) or `track.stop()` (that releases the mic and would require a new `getUserMedia` call to unmute).

**Deafen implementation:**

```typescript
// mediaService.ts
export function deafenAudio(): void {
  // Mute all incoming audio
  for (const { audio } of consumers.values()) {
    audio.muted = true
  }
  // Also mute mic (deafen implies mute)
  muteAudio()
}

export function undeafenAudio(restoreMuted: boolean): void {
  // Unmute all incoming audio
  for (const { audio } of consumers.values()) {
    audio.muted = false
  }
  // Only unmute mic if user wasn't manually muted before deafen
  if (!restoreMuted) {
    unmuteAudio()
  }
}
```

**Deafen/mute state interaction:**
- Deafen ON → always sets `isMuted = true` + `isDeafened = true`
- Deafen OFF → sets `isDeafened = false`, restores `isMuted` to its value *before* deafen was activated
- Store needs a `wasMutedBeforeDeafen: boolean` internal flag to track this

### Existing Code to Reuse (Do NOT Reinvent)

| What | Where | How to Reuse |
|---|---|---|
| `producer` reference | `mediaService.ts` module-level `producer` var | Access via new `muteAudio()`/`unmuteAudio()` exports — already have `producer` in scope |
| `consumers` Map | `mediaService.ts` → `Map<string, { consumer, audio }>` | Access for `deafenAudio()`/`undeafenAudio()` — already in scope |
| `localStream` | `mediaService.ts` module-level var | Export new `getLocalStream()` getter for VAD to hook onto |
| WebSocket event handlers | `wsClient.ts` → `handleNewProducer()` | Add VAD start call after `consumeAudio()` completes |
| Voice cleanup | `voiceService.ts` → `cleanupMedia()` | Add `vadService.stopAllVAD()` before existing `mediaService.cleanup()` |
| `soundPlayer.ts` | `client/src/renderer/src/utils/soundPlayer.ts` | Already uses `AudioContext` singleton — VAD should create its OWN AudioContext instances (don't share with sound effects) |
| `voice-speaking` CSS token | `globals.css` → `--color-voice-speaking: #23a55a` | Already defined, use `ring-voice-speaking` Tailwind class |
| `slideUp` animation | `globals.css` → `@keyframes slideUp` | Pattern to follow for `speakingPulse` keyframe |
| `VoiceParticipant` avatar div | `features/voice/VoiceParticipant.tsx` → 24px rounded-full div | Add `ring-2 ring-voice-speaking` classes conditionally |
| `useMemberStore` | `stores/useMemberStore.ts` | Already used in VoiceParticipant for username lookup |
| `useAuthStore` | `stores/useAuthStore.ts` | Get current userId to compare with VoiceParticipant userId for local user mute icon |
| Lucide icons | `lucide-react` (installed) | `MicOff` for mute overlay icon |

### VoiceParticipant Speaking Indicator Design

Per UX spec, the speaking indicator is a **green ring/glow around the avatar** that pulses subtly:

```
Default (not speaking):
┌──────────────────────────┐
│  [avatar] Username       │  ← 32px row, 24px indent, 24px avatar, no ring
└──────────────────────────┘

Speaking:
┌──────────────────────────┐
│  [🟢avatar🟢] Username   │  ← 2px green ring around avatar, subtle pulse animation
└──────────────────────────┘

Muted (local user only):
┌──────────────────────────┐
│  [avatar🔇] Username     │  ← Small MicOff icon bottom-right of avatar
└──────────────────────────┘
```

**CSS for speaking pulse animation:**

```css
/* globals.css */
@keyframes speakingPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(35, 165, 90, 0.4); }
  50% { box-shadow: 0 0 0 3px rgba(35, 165, 90, 0.1); }
}

.animate-speaking-pulse {
  animation: speakingPulse 1s ease-in-out infinite;
}
```

**Tailwind application in VoiceParticipant:**

```tsx
<div
  className={cn(
    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white relative',
    isSpeaking && 'ring-2 ring-voice-speaking',
    isSpeaking && !prefersReducedMotion && 'animate-speaking-pulse'
  )}
  style={{ backgroundColor: avatarColor }}
>
  {initial}
  {isLocalUser && isMuted && (
    <div className="absolute -bottom-0.5 -right-0.5 bg-bg-primary rounded-full p-0.5">
      <MicOff className="w-3 h-3 text-text-muted" />
    </div>
  )}
</div>
```

**ARIA accessibility:**
```tsx
<div
  className="h-8 flex items-center gap-2 pl-6 pr-2"
  role="listitem"
  aria-label={`${username}${isSpeaking ? ' (speaking)' : ''}${isMuted ? ' (muted)' : ''}`}
>
```

### Audio Quality & DTLS/SRTP Encryption (AC: 1, 2, 4)

Audio quality and encryption are **already handled by the mediasoup pipeline** from story 3-1/3-2:

- **Codec:** Opus at 48kHz, 2 channels (stereo) — configured in `mediasoupManager.ts`
- **Encryption:** DTLS/SRTP is automatic in WebRTC — mediasoup's `WebRtcTransport` negotiates DTLS during the `connect` phase. No additional code needed
- **Latency:** mediasoup SFU architecture provides <100ms latency for LAN/same-region connections. The `preferUdp: true` transport config favors low-latency UDP
- **Echo cancellation:** Chromium's WebRTC stack includes AEC (Acoustic Echo Cancellation) by default when using `getUserMedia({ audio: true })` — no additional configuration needed
- **20-user capacity:** mediasoup Router handles up to `MAX_PARTICIPANTS=25` (server config). Each client creates one producer + N consumers. With 20 users, each client has 19 consumer AnalyserNodes for remote VAD — well within browser limits

**No code changes needed for AC 1, 2, 3, 4** — these are satisfied by the existing mediasoup infrastructure. This story's code changes are focused on VAD (AC 5, 6, 7) and mute/deafen functionality.

### Project Structure Notes

**New files:**
```
client/src/renderer/src/
  services/vadService.ts              # Voice Activity Detection service
  services/vadService.test.ts         # VAD unit tests
```

**Modified files:**
```
client/src/renderer/src/
  services/mediaService.ts            # Add muteAudio, unmuteAudio, deafenAudio, undeafenAudio, getLocalStream
  services/mediaService.test.ts       # Add tests for new functions
  services/voiceService.ts            # Wire VAD start in joinVoiceChannel, stopAllVAD in cleanupMedia
  services/wsClient.ts                # Wire remote VAD in handleNewProducer, stopRemoteVAD in producer-closed
  stores/useVoiceStore.ts             # Add speakingUsers, setSpeaking, update toggleMute/toggleDeafen
  stores/useVoiceStore.test.ts        # Add tests for new state/actions
  features/voice/VoiceParticipant.tsx  # Add speaking ring, mute icon overlay
  features/voice/VoiceParticipant.test.tsx  # Add tests for speaking/mute UI
  globals.css                          # Add speakingPulse keyframe animation
```

### Anti-Patterns to Avoid

- **NEVER** modify server code — VAD is purely client-side. The server doesn't know or care who's speaking
- **NEVER** use `producer.pause()` / `producer.resume()` for mute — that's a server-side mediasoup concept. Use `track.enabled = false/true`
- **NEVER** call `track.stop()` for mute — that releases the mic permanently. Unmuting would require a new `getUserMedia()` call
- **NEVER** share AudioContext between VAD and soundPlayer — create separate AudioContext instances for VAD
- **NEVER** connect remote VAD AnalyserNode to destination at full volume — use a GainNode with `gain.value = 0` to avoid double-audio
- **NEVER** forget hold time in VAD — without the 250ms hold, the speaking indicator will flicker rapidly during natural speech
- **NEVER** poll VAD faster than ~30ms — it wastes CPU for no visible benefit. 50ms is the sweet spot
- **NEVER** forget to clean up AnalyserNodes/AudioContexts on voice leave — memory and resource leak
- **NEVER** import `useVoiceStore` directly in `vadService` — pass callbacks instead to avoid circular dependencies
- **NEVER** forget to stop local VAD when muting — a muted user should never show as speaking
- **NEVER** add `prefers-reduced-motion` detection in every component — use Tailwind's `motion-reduce:` variant or a single check in VoiceParticipant
- **NEVER** create a new file for speaking-related WS types — `VoiceStatePayload` already exists in `shared/src/ws-messages.ts` (but is NOT used in this story — VAD is client-only)

### Deferred / Not In Scope

- **Remote mute icon display** — showing other users' mute state requires broadcasting via `voice:state` WS events. Deferred to story 3.4 which has full audio device management
- **Audio device selection** — story 3.4
- **Video toggle functionality** — Epic 4
- **Voice reconnection** — story 6.1
- **Server-side speaking broadcast** — `VoiceStatePayload` exists but is unused. Client-side VAD is sufficient for ~20 users. Server broadcast would only be needed at scale
- **Noise suppression** — Chromium's built-in noise suppression via `getUserMedia` constraints is sufficient for MVP
- **Audio level meters / volume visualization** — not in any story requirement

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-3-voice-communication.md#Story-3.3] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend-Architecture] — useVoiceStore with speaking indicators, useSpeakingIndicator.ts hook
- [Source: _bmad-output/planning-artifacts/architecture.md#WebRTC-SFU] — mediasoup Opus codec, DTLS/SRTP transport encryption
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#VoiceParticipant] — Green ring (status-online), subtle pulse not flash, 24px avatar, 32px row
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Speaking-Indicator] — Green glow on active speaker, real-time with zero delay, respects prefers-reduced-motion
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility] — prefers-reduced-motion: static ring instead of pulse, ARIA live regions for "X is speaking", color-blind safe (ring + animation, not color-only)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color-Tokens] — voice-speaking #23a55a, meets AA contrast against dark sidebar
- [Source: _bmad-output/project-context.md#Performance-Targets] — Voice latency <100ms mouth-to-ear
- [Source: _bmad-output/project-context.md#Framework-Rules] — Zustand store naming, feature-based organization, no cross-store imports
- [Source: _bmad-output/project-context.md#Testing-Rules] — Co-located tests, Vitest, React Testing Library
- [Source: _bmad-output/project-context.md#E2E-Encryption] — Voice/video MVP: DTLS/SRTP transport encryption (E2E via Encoded Transform is post-MVP)
- [Source: _bmad-output/implementation-artifacts/3-2-voice-channel-join-leave-and-presence.md] — Complete voice join/leave flow, mediaService API, useVoiceStore shape, wsClient voice handlers, VoiceParticipant component, sound player AudioContext pattern, circular import fix (voiceService.ts intermediary)
- [Source: client/src/renderer/src/services/mediaService.ts] — producer, consumers Map, localStream, produceAudio, consumeAudio, cleanup
- [Source: client/src/renderer/src/stores/useVoiceStore.ts] — isMuted/isDeafened as UI-only booleans, channelParticipants Map
- [Source: client/src/renderer/src/services/voiceService.ts] — joinVoiceChannel orchestration, cleanupMedia delegation
- [Source: client/src/renderer/src/services/wsClient.ts] — handleNewProducer flow, VOICE_PRODUCER_CLOSED handler
- [Source: client/src/renderer/src/features/voice/VoiceParticipant.tsx] — Current avatar div structure (no ring, no speaking state)
- [Source: client/src/renderer/src/globals.css] — --color-voice-speaking already defined, slideUp keyframe exists as pattern
- [Source: shared/src/ws-messages.ts] — VoiceStatePayload { userId, channelId, muted, deafened, speaking } exists but unused
- [Source: server/src/plugins/voice/mediasoupManager.ts] — Opus 48kHz codec config, preferUdp transport, TURN credentials

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- vadService.test.ts mock needed proper `function` constructor syntax for AudioContext (vi.fn arrow functions don't work as constructors in Vitest)

### Completion Notes List

- **Task 1:** Created `vadService.ts` with full VAD implementation using Web Audio API AnalyserNode. Includes 50ms polling interval, RMS energy threshold detection (15), 250ms hold time, silent GainNode for remote audio analysis.
- **Task 2:** Added `speakingUsers: Set<string>` and `setSpeaking()` action to useVoiceStore. Clears on leave/cleanup.
- **Task 3:** Wired VAD into voice lifecycle — local VAD starts after `produceAudio()`, remote VAD starts after `consumeAudio()`, all VAD stops on cleanup/leave/producer-closed. Added `getLocalStream()` export to mediaService.
- **Task 4:** Implemented real mute via `producer.track.enabled = false/true`. Stops/restarts local VAD on mute/unmute. Clears self from speakingUsers when muting.
- **Task 5:** Implemented real deafen via `audio.muted` on all consumer elements. Tracks `wasMutedBeforeDeafen` to restore correct mute state on undeafen.
- **Task 6:** Added green ring (`ring-2 ring-voice-speaking`) + `speakingPulse` CSS animation to VoiceParticipant. Respects `prefers-reduced-motion`. Added ARIA labels.
- **Task 7:** Added MicOff icon overlay on local user avatar when muted (12px, bottom-right positioned).
- **Task 8:** Wrote comprehensive tests: 11 VAD tests, 13 new voice store tests, 9 new VoiceParticipant tests, 5 new mediaService tests. All 303 tests pass across 35 files.
- **Task 9:** Tests pass (303/303), lint clean, build successful. Manual tests deferred to user.

### Senior Developer Review (AI)

**Reviewer:** Code Review Workflow — 2026-02-25
**Outcome:** Changes Requested → Fixed

**Issues Found:** 3 High, 4 Medium, 3 Low (10 total)
**Issues Fixed:** 9 (all HIGH, all MEDIUM except M4, all LOW)
**Issues Deferred:** 1 (M4: per-peer AudioContext optimization — within browser limits, defer to scale)

**Fixes Applied:**
1. **H1: Stale speakingUsers on peer departure** — Added `speakingUsers.delete(userId)` in `removePeer()` (`useVoiceStore.ts`)
2. **H2: No error handling in createVADInstance** — Wrapped in try/catch, returns null on failure, callers handle gracefully (`vadService.ts`)
3. **H3: destroyVADInstance doesn't clear speaking state** — Resolved by H1 fix (cleanup at store level)
4. **M1: Test gap — unmute VAD restart** — Added test with mock stream verifying `startLocalVAD` called on unmute (`useVoiceStore.test.ts`)
5. **M2: Test gap — undeafen wasMutedBeforeDeafen** — Added 3 tests: restoreMuted=false, restoreMuted=true, VAD restart on undeafen (`useVoiceStore.test.ts`)
6. **M3+L2: Redundant JS matchMedia** — Removed JS check from VoiceParticipant, CSS `@media (prefers-reduced-motion)` in globals.css handles it (`VoiceParticipant.tsx`)
7. **L1: Silent error swallowing** — Added `console.warn` to vadService AudioContext close and wsClient speaking state import (`vadService.ts`, `wsClient.ts`)
8. **L3: No warning when VAD can't start** — Added `console.warn` when localStream unavailable (`voiceService.ts`)
9. **H1 regression test** — Added test verifying `removePeer` clears departed user from speakingUsers (`useVoiceStore.test.ts`)

**Test Results After Fixes:** 305/305 pass (35 files), lint clean, build successful

### Change Log

- 2026-02-25: Implemented story 3-3 — VAD service, speaking indicators, actual mute/deafen functionality, comprehensive tests
- 2026-02-25: Code review — fixed 9 issues (3H, 3M, 3L): stale speakingUsers cleanup, VAD error handling, test coverage gaps, CSS-only reduced motion, warning logs

### File List

**New files:**
- `client/src/renderer/src/services/vadService.ts`
- `client/src/renderer/src/services/vadService.test.ts`

**Modified files:**
- `client/src/renderer/src/services/mediaService.ts` — added muteAudio, unmuteAudio, deafenAudio, undeafenAudio, getLocalStream
- `client/src/renderer/src/services/mediaService.test.ts` — added tests for new functions
- `client/src/renderer/src/services/voiceService.ts` — wired VAD start in joinVoiceChannel, stopAllVAD in cleanupMedia
- `client/src/renderer/src/services/wsClient.ts` — wired remote VAD in handleNewProducer, stopRemoteVAD in producer-closed
- `client/src/renderer/src/stores/useVoiceStore.ts` — added speakingUsers, setSpeaking, real toggleMute/toggleDeafen with mediaService calls
- `client/src/renderer/src/stores/useVoiceStore.test.ts` — added tests for setSpeaking, mute/deafen with mediaService, speakingUsers cleanup
- `client/src/renderer/src/features/voice/VoiceParticipant.tsx` — added speaking ring, pulse animation, mute icon overlay, ARIA labels
- `client/src/renderer/src/features/voice/VoiceParticipant.test.tsx` — added tests for speaking indicator, mute icon, ARIA
- `client/src/renderer/src/globals.css` — added speakingPulse keyframe animation
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — updated story status
- `_bmad-output/implementation-artifacts/3-3-real-time-voice-audio-and-speaking-indicators.md` — updated tasks, dev record, file list
