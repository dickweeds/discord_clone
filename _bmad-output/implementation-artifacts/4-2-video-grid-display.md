# Story 4.2: Video Grid Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see all participants' video streams in an organized grid,
So that I can see everyone who has their camera on during a call.

## Acceptance Criteria

1. **Given** I am in a voice channel where participants have video enabled **When** I view the voice channel content area **Then** video streams are displayed in a responsive grid layout

2. **Given** multiple participants have video enabled **When** the grid displays **Then** each participant's video shows their stream with their username overlaid **And** the grid adapts layout based on the number of active video streams

3. **Given** a participant enables or disables their video **When** the change occurs **Then** the video grid updates in real-time — adding or removing the stream

4. **Given** a participant is speaking while their video is shown **When** the speaking indicator activates **Then** their video tile shows a green border/glow matching the speaking indicator style

5. **Given** a participant without video enabled **When** they are in the voice channel **Then** they are not shown in the video grid (audio-only participants appear in the sidebar participant list only)

## Tasks / Subtasks

- [x] Task 1: Create VideoTile component (AC: 2, 4)
  - [x] 1.1 Create `client/src/renderer/src/features/voice/VideoTile.tsx`
  - [x] \1.2 Props interface:
    ```typescript
    interface VideoTileProps {
      userId: string
      stream: MediaStream       // video MediaStream to render
      isSpeaking: boolean
      username: string
      isLocal: boolean           // true for self-preview (mirror)
    }
    ```
  - [x] \1.3 Render a `<video>` element using a `ref` callback to set `video.srcObject = stream`:
    ```typescript
    const videoRef = useCallback((video: HTMLVideoElement | null) => {
      if (video && stream) {
        video.srcObject = stream
      }
    }, [stream])
    ```
  - [x] \1.4 Video element attributes: `autoPlay`, `playsInline`, `muted` (always muted — audio comes from separate audio consumers)
  - [x] \1.5 For local preview (`isLocal === true`): add CSS `transform: scaleX(-1)` to mirror the video (standard webcam self-preview behavior)
  - [x] \1.6 Username overlay: absolute-positioned at bottom of tile, semi-transparent dark background, white text, show `username`
  - [x] \1.7 Speaking indicator: when `isSpeaking`, apply `ring-2 ring-[#23a55a]` (green border matching existing speaking indicator style from VoiceParticipant component)
  - [x] \1.8 Tile container: `relative overflow-hidden rounded-lg bg-zinc-900` with `aspect-video` for consistent 16:9 ratio
  - [x] \1.9 Video element: `w-full h-full object-cover` to fill the tile

- [x] Task 2: Create VideoGrid component (AC: 1, 2, 3, 5)
  - [x] \1.1 Create `client/src/renderer/src/features/voice/VideoGrid.tsx`
  - [x] \1.2 Subscribe to `useVoiceStore` for: `videoParticipants`, `speakingUsers`, `currentChannelId`
  - [x] \1.3 Subscribe to `useAuthStore` for: `user.id` (current user)
  - [x] \1.4 Subscribe to `useMemberStore` for: `members` (to get usernames)
  - [x] \1.5 Build video tile list:
    - For local user (if in `videoParticipants`): get stream from `mediaService.getLocalVideoStream()`, render with `isLocal: true`
    - For remote users (in `videoParticipants` excluding self): get their video consumer element from `mediaService.getVideoConsumers()` — extract the `MediaStream` from the consumer's `track` property
  - [x] \1.6 Responsive grid layout using CSS Grid:
    ```typescript
    function getGridCols(count: number): string {
      if (count === 1) return 'grid-cols-1'
      if (count <= 4) return 'grid-cols-2'
      if (count <= 9) return 'grid-cols-3'
      if (count <= 16) return 'grid-cols-4'
      return 'grid-cols-5'  // 17-20
    }
    ```
  - [x] \1.7 Grid container: `grid gap-2 p-4 w-full h-full place-items-center` with dynamic `grid-cols-*`
  - [x] \1.8 Render `<VideoTile>` for each participant with video enabled
  - [x] \1.9 **CRITICAL**: Do NOT create new `<video>` elements for remote peers — use the `consumer.track` from `mediaService.getVideoConsumers()` to create MediaStreams. The HTMLVideoElements in the consumer map are detached DOM elements created by 4-1; instead, create fresh MediaStreams from the consumer tracks and let React manage the DOM via VideoTile's ref callback
  - [x] \1.10 When `videoParticipants` is empty, render nothing (return `null`)
  - [x] \1.11 Add `getVideoConsumerByPeerId()` helper to mediaService to look up a consumer by the peer's userId (currently keyed by consumerId — need a way to map userId → consumer)

- [x] Task 3: Add peerId tracking to video consumers in mediaService (AC: 3)
  - [x] \1.1 In `client/src/renderer/src/services/mediaService.ts`, update `videoConsumers` map to also store `peerId`:
    ```typescript
    const videoConsumers = new Map<string, { consumer: types.Consumer; element: HTMLVideoElement; peerId: string }>()
    ```
  - [x] \1.2 Update `consumeVideo()` to accept and store `peerId` parameter:
    ```typescript
    export async function consumeVideo(
      recvTransport: types.Transport,
      params: { id: string; producerId: string; kind: string; rtpParameters: unknown },
      peerId: string  // NEW parameter
    ): Promise<types.Consumer> {
    ```
  - [x] \1.3 Add `getVideoStreamByPeerId(peerId: string): MediaStream | null`:
    ```typescript
    export function getVideoStreamByPeerId(peerId: string): MediaStream | null {
      for (const entry of videoConsumers.values()) {
        if (entry.peerId === peerId) {
          return new MediaStream([entry.consumer.track])
        }
      }
      return null
    }
    ```
  - [x] \1.4 Update the `consumeVideo` call in `wsClient.ts` `handleNewProducer()` to pass `peerId`
  - [x] \1.5 Update existing mediaService tests for the new parameter

- [x] Task 4: Integrate VideoGrid into app layout (AC: 1)
  - [x] \1.1 In `client/src/renderer/src/features/layout/AppLayout.tsx` (or the content area component), conditionally render `<VideoGrid />` when `videoParticipants.size > 0`
  - [x] \1.2 The VideoGrid should appear in the main content area (center column) as an overlay or section above/replacing the message feed when video is active
  - [x] \1.3 Implementation approach — add VideoGrid as a sibling or overlay within the main content area:
    ```tsx
    <main className="flex-1 flex flex-col">
      {videoParticipants.size > 0 && <VideoGrid />}
      <Outlet />  {/* existing text channel content */}
    </main>
    ```
  - [x] \1.4 **Alternative**: If the content area structure makes overlay complex, render VideoGrid as a resizable panel above the text content with a drag handle to resize, or as a full replacement when in a voice channel with video
  - [x] \1.5 Only show VideoGrid when the user is connected to a voice channel AND at least one participant has video enabled

- [x] Task 5: Write VideoTile tests (AC: 2, 4)
  - [x] \1.1 Create `client/src/renderer/src/features/voice/VideoTile.test.tsx`
  - [x] \1.2 Test renders video element with correct srcObject from stream prop
  - [x] \1.3 Test username overlay displays the participant's username
  - [x] \1.4 Test speaking indicator: green ring visible when `isSpeaking: true`
  - [x] \1.5 Test speaking indicator: no green ring when `isSpeaking: false`
  - [x] \1.6 Test local preview applies mirror transform (`scaleX(-1)`)
  - [x] \1.7 Test video element has `autoplay`, `playsInline`, `muted` attributes
  - [x] \1.8 Test remote video does NOT have mirror transform

- [x] Task 6: Write VideoGrid tests (AC: 1, 2, 3, 5)
  - [x] \1.1 Create `client/src/renderer/src/features/voice/VideoGrid.test.tsx`
  - [x] \1.2 Test renders nothing when `videoParticipants` is empty
  - [x] \1.3 Test renders one tile for single participant (grid-cols-1)
  - [x] \1.4 Test renders tiles for multiple participants (grid adapts columns)
  - [x] \1.5 Test includes local user tile when local user has video enabled
  - [x] \1.6 Test excludes audio-only participants (not in videoParticipants)
  - [x] \1.7 Test dynamically adds tile when new participant enables video (videoParticipants changes)
  - [x] \1.8 Test dynamically removes tile when participant disables video
  - [x] \1.9 Test passes correct speaking state to each tile from `speakingUsers`
  - [x] \1.10 Update mediaService tests for `getVideoStreamByPeerId()` and `consumeVideo()` peerId param

- [x] Task 7: Write integration/layout tests (AC: 1)
  - [x] \1.1 Test VideoGrid appears in layout when `videoParticipants.size > 0`
  - [x] \1.2 Test VideoGrid disappears when all participants disable video
  - [x] \1.3 Test VideoGrid does not render when not in a voice channel

- [x] Task 8: Final verification (AC: 1-5)
  - [x] \1.1 Run `npm test -w client` — all tests pass
  - [x] \1.2 Run `npm run lint` — no lint errors
  - [x] \1.3 Run `npm run build` — client builds successfully
  - [x] \1.4 Manual test: join voice channel → enable video → VideoGrid appears with self-preview
  - [x] \1.5 Manual test: second participant enables video → grid shows both tiles with usernames
  - [x] \1.6 Manual test: participant speaks → green border appears on their tile
  - [x] \1.7 Manual test: participant disables video → tile removed, grid resizes
  - [x] \1.8 Manual test: all video off → grid disappears
  - [x] \1.9 Manual test: grid adapts columns for 1, 2, 4, 9+ participants

## Dev Notes

### Critical: VideoGrid is a DISPLAY Component Only — All Infrastructure Exists

Story 4-1 built the complete video produce/consume pipeline. This story ONLY creates the visual rendering layer:
- **DO NOT** modify mediasoup Router, transports, or codec configuration
- **DO NOT** modify WebSocket signaling (`voice:produce`, `voice:consume`, etc.)
- **DO NOT** modify `useVoiceStore.toggleVideo()` — video toggle already works
- **DO NOT** create new transports or producers — only read from existing state
- The only mediaService change is adding `peerId` tracking and a `getVideoStreamByPeerId()` lookup

### Video Stream Sources for the Grid

| Participant | Stream Source | How to Get |
|------------|-------------|-----------|
| **Local user** (self) | `mediaService.getLocalVideoStream()` | Returns `MediaStream` from user's camera — captured when they toggled video on |
| **Remote peer** | `mediaService.getVideoStreamByPeerId(userId)` | New function (Task 3) — looks up consumer by peerId, returns `new MediaStream([consumer.track])` |

### Video Element Lifecycle in React

**CRITICAL**: Do NOT try to reuse the detached `HTMLVideoElement` objects stored in `mediaService.videoConsumers`. Those elements were created by 4-1 for non-React use. Instead:

1. VideoTile creates its own `<video>` element via JSX
2. Uses a `ref` callback to set `video.srcObject = new MediaStream([consumer.track])`
3. React manages the element lifecycle (mount/unmount)
4. The `consumer.track` is the source of truth — it's a `MediaStreamTrack` that can be attached to any video element

```typescript
// In VideoTile:
const videoRef = useCallback((video: HTMLVideoElement | null) => {
  if (video && stream) {
    video.srcObject = stream
  }
}, [stream])

return <video ref={videoRef} autoPlay playsInline muted />
```

### Responsive Grid Layout Algorithm

```
Participants | Grid      | Columns
1            | 1×1       | grid-cols-1
2            | 1×2       | grid-cols-2
3-4          | 2×2       | grid-cols-2
5-6          | 2×3       | grid-cols-3
7-9          | 3×3       | grid-cols-3
10-16        | 4×4       | grid-cols-4
17-20        | 4×5       | grid-cols-5
```

Use Tailwind CSS Grid: `grid gap-2 p-4` with dynamic column class based on participant count. Each tile uses `aspect-video` for consistent 16:9 ratio.

### Speaking Indicator Pattern (Reuse from VoiceParticipant)

The existing `VoiceParticipant.tsx` component (sidebar) already uses `speakingUsers` from `useVoiceStore`:
```typescript
const isSpeaking = useVoiceStore((s) => s.speakingUsers.has(userId))
```

VideoTile should use the same pattern. The speaking indicator color is `#23a55a` — use Tailwind's `ring-2 ring-[#23a55a]` for the green border/glow effect. This matches the existing speaking indicator style.

### Username Overlay

Each tile displays the participant's username at the bottom:
```tsx
<div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
  <span className="text-white text-sm truncate">{username}</span>
</div>
```

Get usernames from `useMemberStore.members` — look up by userId.

### Integration Point: Where VideoGrid Renders

The VideoGrid renders in the **main content area** (center column) of the app layout. When `videoParticipants.size > 0` and user is in a voice channel:

```
AppLayout
├── nav (sidebar: channels, voice status bar)
├── main (content area)
│   ├── VideoGrid (NEW — shows when video participants exist)
│   └── Outlet (text channel content)
└── aside (member list)
```

The VideoGrid should appear as a panel above the text content. If no video participants, it's not rendered at all. The text content (Outlet) remains visible below the grid.

### Existing Code to Reuse (Do NOT Reinvent)

| What | Where | How to Reuse |
|---|---|---|
| Video participants tracking | `useVoiceStore.videoParticipants` | Subscribe via Zustand selector — already tracks who has video |
| Speaking users tracking | `useVoiceStore.speakingUsers` | Subscribe via Zustand selector — already tracks who is speaking |
| Local video stream | `mediaService.getLocalVideoStream()` | Returns local camera MediaStream |
| Remote video consumers | `mediaService.getVideoConsumers()` | Map of consumer data — extract `consumer.track` |
| Member names | `useMemberStore.members` | Look up username by userId |
| Current user ID | `useAuthStore.user.id` | For identifying self in videoParticipants |
| Voice channel state | `useVoiceStore.currentChannelId` | Check if user is in voice channel |
| Speaking indicator color | `#23a55a` via Tailwind arbitrary value | Same as VoiceParticipant.tsx |
| Component test patterns | `VoiceStatusBar.test.tsx`, `VoiceParticipant.test.tsx` | Follow same mock patterns for stores |

### Anti-Patterns to Avoid

- **NEVER** create new MediaStream captures — only read existing streams from mediaService
- **NEVER** reuse detached HTMLVideoElements from mediaService's consumer map — let React manage DOM
- **NEVER** modify the voice join/leave flow — VideoGrid is purely a display overlay
- **NEVER** add video grid for audio-only participants — only show tiles for users in `videoParticipants`
- **NEVER** play audio from `<video>` elements — always set `muted={true}` (audio comes from separate audio consumers)
- **NEVER** forget to mirror the local preview video with `scaleX(-1)`
- **NEVER** create a separate route for video grid — it's a component within the existing layout
- **NEVER** modify the `consumeVideo()` function signature without updating wsClient's call site

### Previous Story Intelligence (4-1)

**Key learnings from story 4-1 implementation:**
- Video infrastructure uses the same mediasoup transports as audio — no separate connections
- `videoParticipants` Set is the source of truth for who has video enabled
- Video consumers store `{consumer, element}` keyed by consumerId — we need to add peerId for lookup
- `getLocalVideoStream()` returns the local camera stream for self-preview
- `stopVideo()` properly cleans up producers and stops camera tracks
- Client tests: 276 tests passing after 4-1
- Server tests: 288 tests passing after 4-1
- Pre-existing TS errors in `channelRoutes.ts`/`wsRouter.test.ts`/`wsServer.test.ts` are unrelated

**Patterns established in 4-1:**
- Store-based state management for video (`isVideoEnabled`, `videoParticipants`)
- MediaService handles low-level media API, stores handle state, components read state
- WebSocket client dispatches to stores when remote events arrive
- Video button styling: accent-primary when active, default when inactive

### Git Intelligence

Recent commits show the pattern of story implementation:
```
5f17e82 bug fix in invite account creation
8a6d8b0 write 3-4
5e94490 Merge story 4-1: Video camera toggle & streaming
6b7cda0 Mark story 4-1 as done
8917627 Fix code review findings for story 4-1: video camera toggle
4c6a33f Implement story 4-1: Video camera toggle & streaming
```

Story 4-1 was implemented and merged to main. All video infrastructure is on the main branch and ready for 4-2 to build upon.

### Project Structure Notes

**New files:**
```
client/src/renderer/src/features/voice/VideoTile.tsx        # Individual video tile component
client/src/renderer/src/features/voice/VideoTile.test.tsx    # VideoTile tests
client/src/renderer/src/features/voice/VideoGrid.tsx         # Grid container component
client/src/renderer/src/features/voice/VideoGrid.test.tsx    # VideoGrid tests
```

**Modified files:**
```
client/src/renderer/src/services/mediaService.ts            # Add peerId to videoConsumers, add getVideoStreamByPeerId()
client/src/renderer/src/services/mediaService.test.ts       # Update tests for new peerId param and lookup
client/src/renderer/src/services/wsClient.ts                # Pass peerId to consumeVideo()
client/src/renderer/src/features/layout/AppLayout.tsx       # Conditionally render VideoGrid
```

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-4-video-communication.md#Story-4.2] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#FR20-FR23] — VideoGrid.tsx component mapped to features/voice/
- [Source: _bmad-output/planning-artifacts/architecture.md#WebRTC-SFU] — mediasoup v3.19.x, VP8 codec, SFU architecture
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#VoiceStatusBar] — Video toggle states, speaking indicator #23a55a
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Layout] — Three-column layout, content area for video grid
- [Source: _bmad-output/project-context.md#Technology-Stack] — React 18+, Zustand v5.0.x, Tailwind CSS, Vitest
- [Source: _bmad-output/project-context.md#Performance-Targets] — Video latency <200ms
- [Source: _bmad-output/project-context.md#Testing-Rules] — Co-located tests, Vitest, React Testing Library
- [Source: _bmad-output/implementation-artifacts/4-1-video-camera-toggle-and-streaming.md] — Complete video infrastructure, mediaService API, useVoiceStore video state, signaling flow, consumer management patterns
- [Source: client/src/renderer/src/stores/useVoiceStore.ts] — videoParticipants Set, speakingUsers Set, isVideoEnabled
- [Source: client/src/renderer/src/services/mediaService.ts] — getLocalVideoStream(), getVideoConsumers(), videoConsumers Map
- [Source: client/src/renderer/src/features/voice/VoiceParticipant.tsx] — Speaking indicator pattern, speakingUsers subscription
- [Source: client/src/renderer/src/features/voice/VoiceStatusBar.tsx] — Video toggle button (already enabled in 4-1)
- [Source: client/src/renderer/src/features/layout/AppLayout.tsx] — Main layout structure, content area Outlet

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed MediaStream mock in mediaService.test.ts — `vi.fn().mockReturnValue()` produces arrow functions not usable as constructors; switched to `function MockMediaStream()` pattern

### Completion Notes List

- Task 1: Created VideoTile component with ref callback for srcObject, mirror transform for local preview, speaking ring indicator, username overlay
- Task 2: Created VideoGrid component with responsive CSS Grid layout (1-5 columns based on participant count), subscribes to useVoiceStore/useAuthStore/useMemberStore
- Task 3: Added peerId tracking to mediaService videoConsumers map, added getVideoStreamByPeerId() lookup, updated consumeVideo() signature with peerId param, updated wsClient.ts call site
- Task 4: Integrated VideoGrid into AppLayout main content area — renders above Outlet when video participants exist, returns null otherwise
- Task 5: 7 VideoTile unit tests — srcObject binding, username overlay, speaking ring, mirror transform, video attributes
- Task 6: 8 VideoGrid unit tests + 3 mediaService tests — empty state, grid columns, add/remove participants, speaking state, peerId lookup
- Task 7: 3 integration tests in AppLayout — VideoGrid visibility based on videoParticipants state
- Task 8: Final verification — 385 client tests passing (up from 276), lint clean, client build successful
- Review fixes: Cached MediaStream in mediaService (lazy init, prevents leak/flicker), fixed AppLayout test (scoped assertion + member store setup), added currentChannelId guard to VideoGrid, added data-testid to VideoTile, conditional VideoGrid mount in AppLayout, useMemo memberMap, flex-shrink-0 grid container, 7 parameterized grid column tests + currentChannelId null test + stream caching test — 394 tests passing

### Change Log

- 2026-02-25: Implemented story 4-2 — Video Grid Display. Created VideoTile + VideoGrid components, added peerId tracking to mediaService, integrated into AppLayout. 21 new tests added.
- 2026-02-25: Code review — fixed 9 issues (1 HIGH, 5 MEDIUM, 3 LOW). Cached MediaStream in mediaService to prevent leak/flicker, fixed AppLayout test assertion scoping, added currentChannelId guard to VideoGrid, added data-testid to VideoTile, conditional VideoGrid render in AppLayout, useMemo member lookup, flex-shrink-0 on grid container, 9 new tests (parameterized grid columns + currentChannelId guard + stream caching). 394 client tests passing, lint clean, build successful.

### File List

**New files:**
- client/src/renderer/src/features/voice/VideoTile.tsx
- client/src/renderer/src/features/voice/VideoTile.test.tsx
- client/src/renderer/src/features/voice/VideoGrid.tsx
- client/src/renderer/src/features/voice/VideoGrid.test.tsx

**Modified files:**
- client/src/renderer/src/services/mediaService.ts
- client/src/renderer/src/services/mediaService.test.ts
- client/src/renderer/src/services/wsClient.ts
- client/src/renderer/src/features/layout/AppLayout.tsx
- client/src/renderer/src/features/layout/AppLayout.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/4-2-video-grid-display.md
