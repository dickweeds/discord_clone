# Story 4.1: Video Camera Toggle & Streaming

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to enable and disable my video camera while in a voice channel,
So that I can see my friends and be seen during calls.

## Acceptance Criteria

1. **Given** I am in a voice channel **When** I click the video toggle button in the voice status bar **Then** my camera activates and begins streaming video to other participants **And** the video toggle button shows an active/highlighted state

2. **Given** I have my video enabled **When** I click the video toggle button again **Then** my camera stops and video streaming ceases **And** the video toggle button returns to its default state

3. **Given** I enable my video **When** video is transmitted through the SFU **Then** DTLS/SRTP encryption secures the video stream in transit

4. **Given** my video is enabled **When** other participants view the voice channel **Then** they can see my video stream

5. **Given** video is enabled in a voice channel **When** up to 20 participants have video active **Then** all video streams remain stable and viewable

## Tasks / Subtasks

- [x] Task 1: Add VP8 video codec to mediasoup Router (AC: 3, 5)
  - [x] 1.1 In `server/src/plugins/voice/mediasoupManager.ts`, add VP8 video codec to `mediaCodecs` array:
    ```typescript
    const mediaCodecs: RouterRtpCodecCapability[] = [
      { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
      { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
    ]
    ```
  - [x] 1.2 **CRITICAL**: Use VP8 (not H.264) — VP8 is universally supported across all Chromium/Electron platforms without hardware codec licensing concerns. H.264 requires OpenH264 or platform codecs which vary by OS
  - [x] 1.3 Increase `initialAvailableOutgoingBitrate` on WebRtcTransport from `600000` (600 kbps, audio-only) to `3000000` (3 Mbps, supports video):
    ```typescript
    initialAvailableOutgoingBitrate: 3000000,
    ```
  - [x] 1.4 Update mediasoup Router tests to verify VP8 codec is present in `rtpCapabilities`

- [x] Task 2: Extend server VoicePeer to support video producer (AC: 1, 2, 4)
  - [x] 2.1 In `server/src/plugins/voice/voiceService.ts`, add `videoProducer` field to `VoicePeer` interface:
    ```typescript
    export interface VoicePeer {
      userId: string
      channelId: string
      rtpCapabilities: unknown
      sendTransport: WebRtcTransport | null
      recvTransport: WebRtcTransport | null
      producer: Producer | null        // audio producer
      videoProducer: Producer | null    // NEW: video producer
      consumers: Map<string, Consumer>
    }
    ```
  - [x] 2.2 Initialize `videoProducer: null` in `joinVoiceChannel()`
  - [x] 2.3 Add `setPeerVideoProducer(userId, producer)` function
  - [x] 2.4 Update `removePeer()` to close `videoProducer` on cleanup
  - [x] 2.5 Update `leaveVoiceChannel()` to close `videoProducer`

- [x] Task 3: Update server voice:produce handler for video support (AC: 1, 2, 3, 4)
  - [x] 3.1 In `server/src/plugins/voice/voiceWsHandler.ts`, update `handleProduce` to accept `kind: 'audio' | 'video'`:
    - Currently hardcoded to `kind: 'audio'` — change to read `kind` from payload
    - If `kind === 'video'`, store producer via `voiceService.setPeerVideoProducer(userId, producer)` instead of `setPeerProducer()`
    - If `kind === 'audio'`, keep existing behavior
  - [x] 3.2 Validate: reject if user already has a video producer active (prevent duplicate video producers)
  - [x] 3.3 When video producer closes (via `producer.on('transportclose')` or explicit close), broadcast `voice:producer-closed` with `{ producerId, peerId }` to all channel peers
  - [x] 3.4 Ensure `voice:new-producer` broadcast includes the `kind` field so clients know it's a video producer: `{ producerId, peerId, kind: 'video' }`

- [x] Task 4: Update shared types for video support (AC: 1, 4)
  - [x] 4.1 In `shared/src/ws-messages.ts`, update `VoiceProducePayload`:
    ```typescript
    export interface VoiceProducePayload {
      transportId: string
      kind: 'audio' | 'video'  // was: 'audio'
      rtpParameters: unknown
    }
    ```
  - [x] 4.2 Update `VoiceConsumeResponse`:
    ```typescript
    export interface VoiceConsumeResponse {
      consumerId: string
      producerId: string
      kind: 'audio' | 'video'  // was: 'audio'
      rtpParameters: unknown
    }
    ```
  - [x] 4.3 Update `VoiceNewProducerPayload` to include `kind`:
    ```typescript
    export interface VoiceNewProducerPayload {
      producerId: string
      peerId: string
      kind: 'audio' | 'video'  // NEW field
    }
    ```
  - [x] 4.4 Ensure all exports from `shared/src/index.ts` remain correct

- [x] Task 5: Add video produce/consume to client mediaService (AC: 1, 2, 4)
  - [x] 5.1 In `client/src/renderer/src/services/mediaService.ts`, add `videoProducer` state variable:
    ```typescript
    let videoProducer: types.Producer | null = null
    let localVideoStream: MediaStream | null = null
    ```
  - [x] 5.2 Implement `produceVideo(sendTransport)`:
    ```typescript
    export async function produceVideo(sendTransport: types.Transport): Promise<void> {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
      })
      const track = stream.getVideoTracks()[0]
      videoProducer = await sendTransport.produce({ track })
      localVideoStream = stream
    }
    ```
  - [x] 5.3 Implement `stopVideo()`:
    ```typescript
    export function stopVideo(): void {
      if (videoProducer) {
        videoProducer.close()
        videoProducer = null
      }
      if (localVideoStream) {
        localVideoStream.getTracks().forEach(t => t.stop())
        localVideoStream = null
      }
    }
    ```
  - [x] 5.4 Implement `getLocalVideoStream()` — returns `localVideoStream` for self-preview
  - [x] 5.5 Update `consumeAudio` → rename to generic `consumeTrack` or add `consumeVideo()`:
    - For video consumers, create a `<video>` element instead of `<audio>` element
    - Store video consumers separately: `const videoConsumers = new Map<string, { consumer: types.Consumer; element: HTMLVideoElement }>()`
  - [x] 5.6 Update `cleanup()` to close `videoProducer` and stop `localVideoStream`, close all video consumers
  - [x] 5.7 **CRITICAL**: `getUserMedia({ video })` is a separate call from `getUserMedia({ audio })` — do NOT combine them. Audio was already captured on voice join. Video is captured independently when user toggles video on
  - [x] 5.8 **CRITICAL**: The existing `sendTransport` is reused for video — do NOT create a new transport. mediasoup allows multiple producers on the same transport (one for audio, one for video)

- [x] Task 6: Add video state to useVoiceStore (AC: 1, 2)
  - [x] 6.1 In `client/src/renderer/src/stores/useVoiceStore.ts`, add video state:
    ```typescript
    isVideoEnabled: boolean  // false by default
    videoParticipants: Set<string>  // userIds with video enabled
    ```
  - [x] 6.2 Implement `toggleVideo()`:
    1. If not in a voice channel, return (video requires active voice connection)
    2. If `isVideoEnabled` is false:
       - Call `mediaService.produceVideo(sendTransport)` to capture camera and produce video track
       - Set `isVideoEnabled: true`
       - Add self to `videoParticipants`
    3. If `isVideoEnabled` is true:
       - Call `mediaService.stopVideo()` to close producer and stop camera
       - Set `isVideoEnabled: false`
       - Remove self from `videoParticipants`
  - [x] 6.3 Implement `addVideoParticipant(userId)` / `removeVideoParticipant(userId)` for remote peers
  - [x] 6.4 Update `leaveChannel()` to stop video if enabled before leaving
  - [x] 6.5 Update `localCleanup()` (WS disconnect handler) to reset video state

- [x] Task 7: Handle video-related WebSocket events on client (AC: 4)
  - [x] 7.1 In `client/src/renderer/src/services/wsClient.ts` (or `voiceService.ts`), update `voice:new-producer` handler:
    - Check `kind` field from `VoiceNewProducerPayload`
    - If `kind === 'video'`:
      - Call `wsClient.request('voice:consume', { producerId })` to get consumer params
      - Call `mediaService.consumeVideo(recvTransport, consumerParams)` to create video consumer
      - Add the peerId to `useVoiceStore.videoParticipants`
      - Call `wsClient.request('voice:consumer-resume', { consumerId })`
    - If `kind === 'audio'`: keep existing behavior
  - [x] 7.2 Update `voice:producer-closed` handler:
    - Check if the closed producer was a video producer (by looking up in videoConsumers map)
    - If video: remove from `videoParticipants`, close video consumer, remove video element
    - If audio: keep existing behavior
  - [x] 7.3 Update `voice:peer-left` handler to also remove peer from `videoParticipants`

- [x] Task 8: Enable video toggle button in VoiceStatusBar (AC: 1, 2)
  - [x] 8.1 In `client/src/renderer/src/features/voice/VoiceStatusBar.tsx`:
    - Remove `disabled` attribute from video button
    - Remove `opacity-50 cursor-not-allowed` classes
    - Add `onClick={() => useVoiceStore.getState().toggleVideo()}` handler
    - Toggle icon between `Video` (enabled) and `VideoOff` (disabled)
    - When video enabled: show `accent-primary` color (same pattern as mute/deafen toggle)
  - [x] 8.2 Update ARIA label: "Toggle video" → dynamic "Turn on camera" / "Turn off camera"
  - [x] 8.3 Add keyboard shortcut `Ctrl/Cmd + Shift + V` in `AppLayout.tsx`:
    ```typescript
    } else if (key === 'v') {
      e.preventDefault()
      useVoiceStore.getState().toggleVideo()
    }
    ```

- [x] Task 9: Write server-side tests (AC: 1-5)
  - [x] 9.1 Update `server/src/plugins/voice/mediasoupManager.test.ts`:
    - Test Router rtpCapabilities includes VP8 video codec
    - Test transport `initialAvailableOutgoingBitrate` is 3000000
  - [x] 9.2 Update `server/src/plugins/voice/voiceService.test.ts`:
    - Test `setPeerVideoProducer()` stores video producer
    - Test `removePeer()` closes video producer
    - Test `leaveVoiceChannel()` closes video producer
    - Test video producer null by default on join
  - [x] 9.3 Update `server/src/plugins/voice/voiceWsHandler.test.ts`:
    - Test `voice:produce` with `kind: 'video'` creates video producer and stores via `setPeerVideoProducer`
    - Test `voice:produce` with `kind: 'audio'` keeps existing behavior
    - Test `voice:new-producer` broadcast includes `kind` field
    - Test rejecting duplicate video producer

- [x] Task 10: Write client-side tests (AC: 1-4)
  - [x] 10.1 Update `client/src/renderer/src/services/mediaService.test.ts`:
    - Test `produceVideo()` calls `getUserMedia({ video })` and produces on send transport
    - Test `stopVideo()` closes producer and stops video tracks
    - Test `getLocalVideoStream()` returns the local video stream
    - Test `consumeVideo()` creates video consumer with HTMLVideoElement
    - Test `cleanup()` closes video resources
  - [x] 10.2 Update `client/src/renderer/src/stores/useVoiceStore.test.ts`:
    - Test `toggleVideo()` enables video (calls produceVideo, sets isVideoEnabled)
    - Test `toggleVideo()` disables video (calls stopVideo, clears isVideoEnabled)
    - Test `toggleVideo()` no-op when not in voice channel
    - Test `leaveChannel()` stops video if enabled
    - Test `addVideoParticipant()` / `removeVideoParticipant()`
  - [x] 10.3 Update `client/src/renderer/src/features/voice/VoiceStatusBar.test.tsx`:
    - Test video button is enabled (not disabled)
    - Test video button click toggles video
    - Test video button shows Video/VideoOff icon based on state
    - Test ARIA label changes based on video state

- [x] Task 11: Final verification (AC: 1-5)
  - [x] 11.1 Run `npm test -w server` — all tests pass (288/288)
  - [x] 11.2 Run `npm test -w client` — all tests pass (276/276)
  - [x] 11.3 Run `npm run lint` — no lint errors
  - [x] 11.4 Run `npm run build` — shared + client build successfully (server has pre-existing TS errors in channelRoutes.ts/wsRouter.test.ts/wsServer.test.ts unrelated to this story)
  - [ ] 11.5 Manual test: join voice channel → click video toggle → camera activates, video streams to SFU
  - [ ] 11.6 Manual test: click video toggle again → camera stops, video ceases
  - [ ] 11.7 Manual test: other participant sees video stream appear/disappear
  - [ ] 11.8 Manual test: video button shows correct active/inactive state
  - [ ] 11.9 Manual test: keyboard shortcut Ctrl+Shift+V toggles video
  - [ ] 11.10 Manual test: leaving voice channel stops video
  - [ ] 11.11 Manual test: WebSocket disconnect cleans up video state

## Dev Notes

### Critical: Video Extends Voice — Do NOT Create Separate Infrastructure

Video uses the **exact same mediasoup infrastructure** as voice. The key insight:
- **Same Router** — just add VP8 codec to the existing Router's `mediaCodecs`
- **Same Transports** — `sendTransport` and `recvTransport` already created during voice join support multiple producers/consumers. Do NOT create new transports for video
- **Same signaling** — `voice:produce`, `voice:consume`, `voice:consumer-resume` work identically for video tracks. The only difference is `kind: 'video'` instead of `kind: 'audio'`
- **Same `voice:new-producer` / `voice:producer-closed`** broadcasts — just include `kind` field so clients know whether to create audio or video playback

### mediasoup Multi-Producer Pattern

A single mediasoup Transport can carry multiple Producers:
```
sendTransport:
  ├── audioProducer (kind: 'audio', opus)
  └── videoProducer (kind: 'video', VP8)

recvTransport:
  ├── audioConsumer (per remote peer's audio)
  └── videoConsumer (per remote peer's video)
```

The `transport.on('connect')` callback fires only ONCE (on the first produce/consume). The `transport.on('produce')` callback fires for EACH new producer. Since audio is already producing when the user joins voice, the send transport is already connected — video produce will trigger only the `produce` callback, not `connect`.

### Video Codec: VP8 (Not H.264)

**Why VP8:**
- Universally supported in all Chromium/Electron builds — no codec licensing issues
- Does not require platform-specific hardware codec support (H.264 availability varies)
- mediasoup handles VP8 efficiently as an SFU (just forwards packets)
- Good quality at typical webcam resolutions (720p)

**VP8 Router Configuration:**
```typescript
{ kind: 'video', mimeType: 'video/VP8', clockRate: 90000 }
```

Do NOT add `preferredPayloadType` — let mediasoup negotiate it.

### getUserMedia: Separate Audio and Video Calls

**CRITICAL**: Audio was already captured during voice join (`getUserMedia({ audio: true })`). Video must be captured separately:
```typescript
// WRONG — recaptures audio, may cause echo/duplicate
const stream = await getUserMedia({ audio: true, video: true })

// CORRECT — only captures video
const stream = await getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } })
```

This means `localStream` (audio) and `localVideoStream` (video) are separate MediaStream objects with separate lifecycle management.

### Video Constraints

```typescript
{
  video: {
    width: { ideal: 1280 },   // 720p width
    height: { ideal: 720 },    // 720p height
    frameRate: { ideal: 30 }   // 30fps
  }
}
```

Use `ideal` (not `exact`) so the browser falls back gracefully if the camera doesn't support 720p. The SFU doesn't care about resolution — it forwards whatever the producer sends.

### Bitrate Increase for Video

`initialAvailableOutgoingBitrate` on WebRtcTransport controls the starting bitrate estimate:
- **Current (audio-only):** 600,000 bps (600 kbps) — fine for Opus audio
- **With video:** 3,000,000 bps (3 Mbps) — supports 720p VP8 + audio

This is a starting estimate. mediasoup's bandwidth estimation (REMB) will adjust dynamically based on network conditions.

### Transport Event Callback Behavior with Second Producer

When video is produced on an already-connected send transport:
1. `transport.on('connect')` does **NOT** fire again — transport is already connected
2. `transport.on('produce')` fires with `{ kind: 'video', rtpParameters }` — this triggers the `voice:produce` WS request
3. Server creates video producer and broadcasts `voice:new-producer { kind: 'video', producerId, peerId }`

### Video Consumer Playback

Audio consumers use `HTMLAudioElement`. Video consumers need `HTMLVideoElement`:
```typescript
const consumer = await recvTransport.consume({ id, producerId, kind: 'video', rtpParameters })
const video = document.createElement('video')
video.srcObject = new MediaStream([consumer.track])
video.autoplay = true
video.playsInline = true
video.muted = true  // muted=true allows autoplay in all browsers (even non-Electron)
```

**CRITICAL**: `video.muted = true` is needed for autoplay policy compliance. This only mutes the `<video>` element's audio — the actual audio comes through the separate audio consumer/element. Video elements should never play audio.

### Video State in Voice Store

```typescript
isVideoEnabled: boolean         // local camera on/off
videoParticipants: Set<string>  // userIds with active video
```

`videoParticipants` is used by story 4-2 (VideoGrid) to know which users to display. This story establishes the state; the grid UI is story 4-2.

### Existing Code to Reuse (Do NOT Reinvent)

| What | Where | How to Reuse |
|---|---|---|
| mediasoup Router + Worker | `server/src/plugins/voice/mediasoupManager.ts` | Add VP8 to existing `mediaCodecs`, increase bitrate |
| Voice peer state | `server/src/plugins/voice/voiceService.ts` | Add `videoProducer` field to existing `VoicePeer` |
| Produce/consume handlers | `server/src/plugins/voice/voiceWsHandler.ts` | Extend `handleProduce` to read `kind` from payload |
| Client send/recv transport | `client/src/renderer/src/services/mediaService.ts` | Reuse existing transports for video |
| Voice store | `client/src/renderer/src/stores/useVoiceStore.ts` | Add `isVideoEnabled`, `videoParticipants`, `toggleVideo()` |
| VoiceStatusBar | `client/src/renderer/src/features/voice/VoiceStatusBar.tsx` | Enable existing disabled video button |
| WS types | `shared/src/ws-messages.ts` | Update existing types to support `'audio' | 'video'` |
| WS event handlers | `client/src/renderer/src/services/wsClient.ts` | Extend `voice:new-producer` handler with kind check |
| Keyboard shortcuts | `client/src/renderer/src/features/layout/AppLayout.tsx` | Add `'v'` case to existing shortcut handler |
| Sound player | `client/src/renderer/src/utils/soundPlayer.ts` | No changes needed — video toggle doesn't play a sound |
| mediasoup mock pattern | `server/src/plugins/voice/mediasoupManager.test.ts` | Extend mock to include video producer |

### WebSocket Signaling Flow: Video Toggle On

```
CLIENT                            SERVER
  |                                 |
  | [Already in voice channel,     |
  |  send transport connected,     |
  |  audio producing]              |
  |                                 |
  | User clicks video toggle       |
  | → getUserMedia({ video })      |
  | → sendTransport.produce({      |
  |     track: videoTrack })       |
  |                                 |
  |-- voice:produce                |
  |   { transportId, kind:'video', |
  |     rtpParameters } ---------> |  transport.produce()
  |<-- response { producerId } --- |  → store as videoProducer
  |                                 |  → broadcast to peers:
  |                                 |  voice:new-producer
  |                                 |  { producerId, peerId,
  |                                 |    kind: 'video' }
  |                                 |
  | OTHER CLIENTS receive           |
  | voice:new-producer (kind:video) |
  | → voice:consume { producerId } |
  | → recvTransport.consume()      |
  | → create <video> element       |
  | → voice:consumer-resume        |
  | → video plays                   |
```

### Video Toggle Off

```
CLIENT                            SERVER
  |                                 |
  | User clicks video toggle       |
  | → videoProducer.close()        |
  | → stop video MediaStream tracks|
  |                                 |
  | [producer.close() triggers     |
  |  transport-level close on      |
  |  server]                       |
  |                                 |
  |                                 |  Server detects producer closed
  |                                 |  → broadcast voice:producer-closed
  |                                 |  { producerId, peerId }
  |                                 |
  | OTHER CLIENTS receive           |
  | voice:producer-closed           |
  | → find and close video consumer|
  | → remove <video> element       |
  | → remove from videoParticipants|
```

**Note**: When `producer.close()` is called client-side, mediasoup automatically notifies the server that the producer is closed. The server's `producer.on('transportclose')` event fires, which should trigger the `voice:producer-closed` broadcast. Verify this event chain works in testing.

### Anti-Patterns to Avoid

- **NEVER** create new transports for video — reuse existing send/recv transports from voice join
- **NEVER** combine audio + video in a single `getUserMedia()` call — they have separate lifecycles
- **NEVER** use H.264 codec — use VP8 for universal Electron/Chromium support
- **NEVER** add `<video>` elements with audio unmuted — always set `muted=true` on video elements (audio comes from separate audio consumers)
- **NEVER** forget to stop `localVideoStream` tracks when disabling video — camera LED stays on otherwise
- **NEVER** create duplicate video producers — validate one video producer per user
- **NEVER** store video consumers in the same map as audio consumers without distinguishing them — use separate maps or include a `kind` field
- **NEVER** auto-enable video on voice join — video is always opt-in via toggle
- **NEVER** modify the voice join/leave flow — video is an overlay on top of existing voice

### Deferred / Not In Scope

- **Video Grid display**: Story 4.2 — this story only handles produce/consume, not the visual grid layout
- **Self-preview video**: Story 4.2 — `getLocalVideoStream()` is exposed here but the preview UI is in the grid
- **Screen sharing**: Not in current epics
- **Video resolution settings**: Not in current epics — use ideal 720p
- **Simulcast / SVC**: Not needed for ≤20 users on single Worker
- **Camera device selection**: Could be added in a later story (similar to audio device management in 3.4)
- **Video reconnection**: Story 6.1 — connection resilience
- **True E2E video encryption**: Post-MVP — WebRTC Encoded Transform

### Project Structure Notes

**Modified files:**
```
server/src/plugins/voice/mediasoupManager.ts     # Add VP8 codec, increase bitrate
server/src/plugins/voice/mediasoupManager.test.ts # Test VP8 codec, new bitrate
server/src/plugins/voice/voiceService.ts          # Add videoProducer to VoicePeer
server/src/plugins/voice/voiceService.test.ts     # Test video producer lifecycle
server/src/plugins/voice/voiceWsHandler.ts        # Support kind: 'video' in produce
server/src/plugins/voice/voiceWsHandler.test.ts   # Test video produce flow
shared/src/ws-messages.ts                         # Update kind types to 'audio' | 'video'
client/src/renderer/src/services/mediaService.ts           # Add produceVideo, stopVideo, consumeVideo
client/src/renderer/src/services/mediaService.test.ts      # Test video functions
client/src/renderer/src/services/wsClient.ts               # Update voice:new-producer handler for video
client/src/renderer/src/stores/useVoiceStore.ts            # Add isVideoEnabled, toggleVideo
client/src/renderer/src/stores/useVoiceStore.test.ts       # Test video state
client/src/renderer/src/features/voice/VoiceStatusBar.tsx  # Enable video button
client/src/renderer/src/features/voice/VoiceStatusBar.test.tsx  # Test enabled video button
client/src/renderer/src/features/layout/AppLayout.tsx      # Add Ctrl+Shift+V shortcut
```

**No new files needed** — video extends existing voice infrastructure.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-4-video-communication.md#Story-4.1] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#WebRTC-SFU] — mediasoup v3.19.x server, SFU architecture, video tracks extend voice
- [Source: _bmad-output/planning-artifacts/architecture.md#FR20-FR23] — Video maps to `features/voice/VideoGrid.tsx`, `services/mediaService.ts`, `plugins/voice/`
- [Source: _bmad-output/planning-artifacts/architecture.md#Voice/Video-Encryption] — DTLS/SRTP transport encryption for MVP
- [Source: _bmad-output/planning-artifacts/architecture.md#Performance] — Video latency <200ms
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#VoiceStatusBar] — Video toggle button, Video on state: "Video button highlighted, camera active"
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Keyboard-Shortcuts] — Voice control shortcuts pattern
- [Source: _bmad-output/project-context.md#Technology-Stack] — mediasoup v3.19.x server / v3.18.x client
- [Source: _bmad-output/project-context.md#Performance-Targets] — Video latency <200ms
- [Source: _bmad-output/project-context.md#Connection-Resilience] — WebRTC: no auto-reconnect
- [Source: _bmad-output/project-context.md#E2E-Encryption] — Voice/video MVP: transport encryption (DTLS/SRTP)
- [Source: _bmad-output/implementation-artifacts/3-1-voice-server-infrastructure.md] — mediasoupManager API, voiceService VoicePeer, signaling flow, testing patterns, mediasoup mock
- [Source: _bmad-output/implementation-artifacts/3-2-voice-channel-join-leave-and-presence.md] — mediaService client API, useVoiceStore, VoiceStatusBar (disabled video button), consumer management, WS event handlers
- [Source: server/src/plugins/voice/mediasoupManager.ts] — Router codec config (audio/opus only), createWebRtcTransport bitrate
- [Source: server/src/plugins/voice/voiceService.ts] — VoicePeer interface (producer: Producer | null)
- [Source: server/src/plugins/voice/voiceWsHandler.ts] — handleProduce (hardcoded kind: 'audio')
- [Source: client/src/renderer/src/services/mediaService.ts] — produceAudio, consumeAudio, cleanup
- [Source: client/src/renderer/src/stores/useVoiceStore.ts] — joinChannel, leaveChannel, toggleMute/Deafen
- [Source: client/src/renderer/src/features/voice/VoiceStatusBar.tsx] — Disabled video button (line ~86)
- [Source: client/src/renderer/src/features/layout/AppLayout.tsx] — Keyboard shortcut handler (M/D/E)
- [Source: shared/src/ws-messages.ts] — VoiceProducePayload, VoiceConsumeResponse, VoiceNewProducerPayload
- [Source: mediasoup.org/documentation/v3] — Transport multi-producer, VP8 codec config

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — no blocking issues encountered.

### Completion Notes List

- Task 1: Added VP8 video codec to mediasoup Router mediaCodecs array. Increased WebRtcTransport initialAvailableOutgoingBitrate from 600kbps to 3Mbps for video support.
- Task 2: Extended VoicePeer interface with `videoProducer: Producer | null`. Added `setPeerVideoProducer()` function. Updated cleanupPeer and findProducerOwner to handle video producers.
- Task 3: Updated handleProduce handler to accept `kind: 'audio' | 'video'`. Routes video producers to `setPeerVideoProducer`. Added duplicate video producer rejection. Includes `kind` in `voice:new-producer` broadcast.
- Task 4: Updated shared types — `VoiceProducePayload.kind`, `VoiceConsumeResponse.kind`, and `VoiceNewProducerPayload.kind` now support `'audio' | 'video'`.
- Task 5: Added `produceVideo()`, `stopVideo()`, `getLocalVideoStream()`, `consumeVideo()` to client mediaService. Added separate `videoConsumers` map. Updated cleanup.
- Task 6: Added `isVideoEnabled`, `videoParticipants` state to useVoiceStore. Implemented `toggleVideo()`, `addVideoParticipant()`, `removeVideoParticipant()`. Updated `leaveChannel()` and `localCleanup()` to reset video state.
- Task 7: Updated wsClient `handleNewProducer` to route video vs audio consumers. Updated `voice:producer-closed` to check video consumers. Updated `voice:peer-left` to remove from videoParticipants.
- Task 8: Enabled VoiceStatusBar video button with `toggleVideo()` click handler. Dynamic ARIA labels ("Turn on camera" / "Turn off camera"). Added Video/VideoOff icon toggle. Added Ctrl+Shift+V keyboard shortcut in AppLayout.
- Tasks 9-10: All tests written inline with implementation (TDD). Server: 288 tests, Client: 276 tests — all passing.
- Task 11: Lint clean. Shared + client builds pass. Server build has pre-existing TS errors unrelated to this story. Manual test items left for user verification.
- Added `getSendTransport()` and `getRecvTransport()` getters to mediaService for voiceService video wrapper functions.
- Added `startVideo()` and `stopVideo()` wrappers in voiceService to maintain the store → voiceService → mediaService abstraction pattern.
- Added `removeVideoConsumerByProducerId()` and `getVideoConsumers()` to mediaService for video consumer cleanup.

### File List

- `server/src/plugins/voice/mediasoupManager.ts` — Added VP8 codec, increased bitrate
- `server/src/plugins/voice/mediasoupManager.test.ts` — VP8 + bitrate tests
- `server/src/plugins/voice/voiceService.ts` — videoProducer field, setPeerVideoProducer, cleanup
- `server/src/plugins/voice/voiceService.test.ts` — Video producer lifecycle tests
- `server/src/plugins/voice/voiceWsHandler.ts` — Video produce support, kind in broadcast
- `server/src/plugins/voice/voiceWsHandler.test.ts` — Video produce/broadcast/reject tests
- `shared/src/ws-messages.ts` — Updated VoiceProducePayload, VoiceConsumeResponse, VoiceNewProducerPayload
- `client/src/renderer/src/services/mediaService.ts` — produceVideo, stopVideo, consumeVideo, video consumer management
- `client/src/renderer/src/services/mediaService.test.ts` — Video function tests
- `client/src/renderer/src/services/voiceService.ts` — startVideo, stopVideo wrappers
- `client/src/renderer/src/services/wsClient.ts` — Video event handling for new-producer, producer-closed, peer-left
- `client/src/renderer/src/stores/useVoiceStore.ts` — isVideoEnabled, videoParticipants, toggleVideo
- `client/src/renderer/src/stores/useVoiceStore.test.ts` — Video state tests
- `client/src/renderer/src/features/voice/VoiceStatusBar.tsx` — Enabled video button
- `client/src/renderer/src/features/voice/VoiceStatusBar.test.tsx` — Updated video button tests
- `client/src/renderer/src/features/layout/AppLayout.tsx` — Ctrl+Shift+V shortcut
