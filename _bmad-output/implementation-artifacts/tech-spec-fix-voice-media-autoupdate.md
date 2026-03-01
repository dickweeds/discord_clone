---
title: 'Fix Voice Presence, Audio/Video Consumption, and Auto-Update'
slug: 'fix-voice-media-autoupdate'
created: '2026-03-01'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['mediasoup v3.19.x server / v3.18.x client', 'Fastify WebSocket (ws)', 'Zustand v5.0.x', 'React 18+', 'TypeScript 5.x strict', 'electron-updater', 'electron-builder', 'GitHub Actions', 'Vitest']
files_to_modify: ['server/src/plugins/voice/voiceWsHandler.ts', 'server/src/plugins/voice/voiceService.ts', 'server/src/plugins/voice/voiceWsHandler.test.ts', 'client/src/renderer/src/services/voiceService.ts', 'client/src/renderer/src/services/wsClient.ts', 'shared/src/ws-messages.ts', '.github/workflows/release.yml']
code_patterns: ['WS handlers registered via registerHandler(type, fn) in wsRouter.ts', 'respond(ws, requestId, payload) / respondError(ws, requestId, error) for request-response', 'broadcastToChannel sends to voice channel peers only — new broadcastToServer needed', 'getClients() from wsServer.ts returns Map<string, WebSocket> of all connected clients', 'voiceService.ts manages VoicePeer records in a Map<string, VoicePeer>', 'Client wsClient.request<T>(type, payload, timeout) for request-response over WS', 'Client handleNewProducer(payload) consumes audio/video via mediaService — private method on WsClient']
test_patterns: ['Co-located tests: voiceWsHandler.test.ts alongside voiceWsHandler.ts', 'Vitest with vi.mock for mediasoupManager, channelService, wsServer, wsRouter', 'registeredHandlers map captures handlers for direct invocation', 'mockClients map simulates connected WebSocket clients', 'createMockWs() and createMockTransport() helpers', 'Tests call handlers directly and assert on ws.send mock calls', 'canConsume mocked to return true — masks the rtpCapabilities bug']
---

# Tech-Spec: Fix Voice Presence, Audio/Video Consumption, and Auto-Update

**Created:** 2026-03-01

## Overview

### Problem Statement

Four production bugs degrade the voice/video and auto-update experience:

1. **Voice Presence Invisible** — Users not in a voice channel cannot see who is in the channel. `broadcastToChannel()` only sends `VOICE_PEER_JOINED`/`VOICE_PEER_LEFT` to users already in the voice channel. No `voice:presence-sync` handler exists on the server for initial/reconnect state.
2. **No Audio Between Peers** — Voice activity indicators work (via WS signaling) but no actual audio is heard. The client never sends `device.rtpCapabilities` to the server after device init, so `router.canConsume()` throws with `undefined`. Additionally, newly-joined peers cannot discover pre-existing producers.
3. **No Remote Video** — Same root cause as #2. Video consumption goes through the same broken `handleConsume` path. Local video preview works because it bypasses mediasoup.
4. **Auto-Update Check Fails** — The CI/CD release pipeline omits `latest.yml`/`latest-mac.yml`/`latest-linux.yml` metadata files from GitHub Release assets. `electron-updater` gets a 404 and shows an error banner.

### Solution

- Broadcast voice presence events to all connected WS clients (not just voice channel peers)
- Implement `voice:presence-sync` server handler for initial/reconnect state
- Send `device.rtpCapabilities` to the server after device initialization
- Re-send `VOICE_NEW_PRODUCER` events to newly-joined peers for existing producers
- Move `canConsume()` inside try/catch for proper error handling
- Add `*.yml` and `*.blockmap` to CI/CD artifact upload

### Scope

**In Scope:**
- F1a: `broadcastToServer()` function for voice presence events
- F1b: `voice:presence-sync` server handler
- F1c: Request presence sync on initial WS connect
- F2a: Send `device.rtpCapabilities` after init + server handler
- F2b: Re-send `VOICE_NEW_PRODUCER` to new joiners for existing producers
- F2c: Move `canConsume()` inside try/catch
- F4a: Add metadata files to CI/CD artifact upload
- Tests for all server-side changes

**Out of Scope:**
- macOS code signing / notarization
- Multi-server/guild scoping for broadcasts
- mediasoup version upgrades
- Refactoring the voice system architecture

## Context for Development

### Codebase Patterns

- WebSocket messages follow `{ type: string, payload: unknown, id?: string }` envelope
- WS types defined in `shared/src/ws-messages.ts` — all payloads as interfaces, constants in `WS_TYPES`
- Voice state managed via Zustand `useVoiceStore` — `channelParticipants: Map<string, string[]>`
- Server voice logic split: `voiceWsHandler.ts` (382 lines, WS handlers) + `voiceService.ts` (164 lines, state management)
- `wsClient` imports Zustand stores via dynamic `import()` to dispatch — stores never import `wsClient`
- `voiceService.ts` (client) orchestrates the join flow: join → initDevice → createTransports → produceAudio → startVAD
- `mediaService.ts` wraps mediasoup-client Device, exposes `getDevice()`, `initDevice()`, `produceAudio()`, `consumeAudio()`, `consumeVideo()`
- `wsRouter.ts` catches unhandled async handler errors and sends `TEXT_ERROR` — does NOT match request IDs, causing client timeouts
- Tests co-located with source files, Vitest with vi.mock

### Files to Modify

| File | Changes |
| ---- | ------- |
| `server/src/plugins/voice/voiceWsHandler.ts` | Add `broadcastToServer()`, `handleVoicePresenceSync()`, `handleSetRtpCapabilities()`, notify new joiner of existing producers, move `canConsume` inside try/catch, update join/leave/disconnect to use `broadcastToServer` |
| `server/src/plugins/voice/voiceService.ts` | Add `setPeerRtpCapabilities()` function |
| `server/src/plugins/voice/voiceWsHandler.test.ts` | Add tests for new handlers, update existing broadcast tests, test `canConsume` error handling |
| `client/src/renderer/src/services/voiceService.ts` | Send `device.rtpCapabilities` after `initDevice()` |
| `client/src/renderer/src/services/wsClient.ts` | Call `requestVoicePresenceSync()` on initial connect |
| `shared/src/ws-messages.ts` | Add `VOICE_SET_RTP_CAPABILITIES` to `WS_TYPES`, add `VoiceSetRtpCapabilitiesPayload` interface |
| `.github/workflows/release.yml` | Add `*.yml` and `*.blockmap` to artifact upload glob |

### Files to Reference (read-only)

| File | Purpose |
| ---- | ------- |
| `client/src/renderer/src/services/mediaService.ts` | `getDevice()` returns `Device | null`, `device.rtpCapabilities` is what client sends |
| `client/src/renderer/src/stores/useVoiceStore.ts` | `syncParticipants()` at line 334 already handles `VOICE_PRESENCE_SYNC` response |
| `client/src/renderer/src/features/channels/ChannelSidebar.tsx` | Renders `channelParticipants.get(channel.id)` — no changes needed |
| `server/src/ws/wsRouter.ts` | `registerHandler()`, `respond()`, `respondError()` — routing infrastructure |
| `server/src/ws/wsServer.ts` | `getClients()` returns `Map<string, WebSocket>` of all connected clients |

### Technical Decisions

- **Broadcast scope**: All connected WS clients via `getClients()` (single-server app, no guild filtering needed)
- **Existing producer discovery**: After `handleVoiceJoin` responds and broadcasts `VOICE_PEER_JOINED`, server directly sends `VOICE_NEW_PRODUCER` messages to the newly-joined peer's WS for each existing producer in the channel. Client's existing `handleNewProducer` in `wsClient.ts:155-206` consumes them unchanged.
- **rtpCapabilities delivery**: Dedicated `voice:set-rtp-capabilities` message type. Client sends after `mediaService.initDevice()` returns. Server handler updates `peer.rtpCapabilities`. This must complete before any `voice:consume` can succeed.
- **canConsume error handling**: Move lines 265-268 of `voiceWsHandler.ts` inside the existing try/catch at line 271. Prevents unhandled rejection → `TEXT_ERROR` → client timeout.
- **Auto-update fix**: Add `*.yml` and `*.blockmap` globs to `release.yml:142-145`. No other CI/CD changes needed.

## Implementation Plan

### Tasks

Tasks are ordered by dependency — shared types first, then server state, then server handlers, then client, then CI/CD.

- [x] Task 1: Add shared WS types for `voice:set-rtp-capabilities`
  - File: `shared/src/ws-messages.ts`
  - Action: Add `VOICE_SET_RTP_CAPABILITIES: 'voice:set-rtp-capabilities'` to the `WS_TYPES` constant object (after line 185, alongside other voice types). Add a new payload interface:
    ```typescript
    export interface VoiceSetRtpCapabilitiesPayload {
      rtpCapabilities: unknown;
    }
    ```
  - Notes: The `rtpCapabilities` type is `unknown` to match the existing convention used by `VoiceJoinPayload.rtpCapabilities` and `VoicePeer.rtpCapabilities`.

- [x] Task 2: Add `setPeerRtpCapabilities()` to server voice service
  - File: `server/src/plugins/voice/voiceService.ts`
  - Action: Add a new exported function after `setPeerVideoProducer()` (after line 104):
    ```typescript
    export function setPeerRtpCapabilities(userId: string, rtpCapabilities: unknown): void {
      const peer = voicePeers.get(userId);
      if (!peer) throw new Error(`Voice peer not found: ${userId}`);
      peer.rtpCapabilities = rtpCapabilities;
    }
    ```
  - Notes: Follows the same pattern as `setPeerTransport()`, `setPeerProducer()`, etc.

- [x] Task 3: Add `broadcastToServer()` function to voice WS handler
  - File: `server/src/plugins/voice/voiceWsHandler.ts`
  - Action: Add a new function after `broadcastToChannel()` (after line 381):
    ```typescript
    function broadcastToServer(excludeUserId: string, type: string, payload: unknown): void {
      const clients = getClients();
      for (const [userId, ws] of clients) {
        if (userId === excludeUserId) continue;
        if (ws && ws.readyState === ws.OPEN) {
          try {
            ws.send(JSON.stringify({ type, payload }));
          } catch {
            log.debug({ userId, type }, 'Failed to broadcast to client');
          }
        }
      }
    }
    ```
  - Notes: Same signature and error handling pattern as `broadcastToChannel` but iterates all WS clients instead of just voice peers.

- [x] Task 4: Switch voice presence events to use `broadcastToServer()`
  - File: `server/src/plugins/voice/voiceWsHandler.ts`
  - Action: Replace `broadcastToChannel` with `broadcastToServer` at these 4 call sites where `VOICE_PEER_JOINED` or `VOICE_PEER_LEFT` is the event type:
    - Line 41 (Worker death): `broadcastToServer(userId, WS_TYPES.VOICE_PEER_LEFT, { userId, channelId: peer.channelId });`
    - Line 96 (join): `broadcastToServer(userId, WS_TYPES.VOICE_PEER_JOINED, { userId, channelId });`
    - Line 111 (leave): `broadcastToServer(userId, WS_TYPES.VOICE_PEER_LEFT, { userId, channelId });`
    - Line 361 (disconnect): `broadcastToServer(userId, WS_TYPES.VOICE_PEER_LEFT, { userId, channelId });`
  - Notes: `broadcastToServer` takes `(excludeUserId, type, payload)` — no `channelId` first param since it broadcasts to all. `broadcastToChannel` remains unchanged for media signaling events (`VOICE_NEW_PRODUCER`, `VOICE_STATE`, etc.).

- [x] Task 5: Implement `voice:presence-sync` server handler
  - File: `server/src/plugins/voice/voiceWsHandler.ts`
  - Action:
    1. Add import for `setPeerRtpCapabilities` from `./voiceService.js` (line 8 import block)
    2. Register handler in `registerVoiceHandlers()` (after line 54): `registerHandler(WS_TYPES.VOICE_PRESENCE_SYNC, handleVoicePresenceSync);`
    3. Add handler function:
       ```typescript
       function handleVoicePresenceSync(ws: WebSocket, message: WsMessage, _userId: string): void {
         const requestId = message.id;
         const allPeers = getAllPeers();
         const participants: { userId: string; channelId: string }[] = [];
         for (const [, peer] of allPeers) {
           participants.push({ userId: peer.userId, channelId: peer.channelId });
         }
         if (requestId) {
           respond(ws, requestId, { participants });
         }
       }
       ```
  - Notes: Returns `VoiceChannelPresencePayload` shape which the client already handles at `wsClient.ts:353-359` via `useVoiceStore.syncParticipants()`. The `requestId` check follows the existing handler pattern.

- [x] Task 6: Implement `voice:set-rtp-capabilities` server handler
  - File: `server/src/plugins/voice/voiceWsHandler.ts`
  - Action:
    1. Register handler in `registerVoiceHandlers()` (after the presence-sync registration): `registerHandler(WS_TYPES.VOICE_SET_RTP_CAPABILITIES, handleSetRtpCapabilities);`
    2. Add handler function:
       ```typescript
       function handleSetRtpCapabilities(ws: WebSocket, message: WsMessage, userId: string): void {
         const { rtpCapabilities } = message.payload as { rtpCapabilities: unknown };
         const requestId = message.id;

         const peer = getPeer(userId);
         if (!peer) {
           if (requestId) respondError(ws, requestId, 'Not in a voice channel');
           return;
         }

         setPeerRtpCapabilities(userId, rtpCapabilities);
         if (requestId) respond(ws, requestId, {});
       }
       ```
  - Notes: Must complete before any `voice:consume` call. The client orchestrates this ordering in the join flow.

- [x] Task 7: Notify newly-joined peers of existing producers
  - File: `server/src/plugins/voice/voiceWsHandler.ts`
  - Action: In `handleVoiceJoin()`, after the `broadcastToServer` call at line 96 (now broadcasting `VOICE_PEER_JOINED`), add logic to send `VOICE_NEW_PRODUCER` for each existing producer directly to the joining peer's WS:
    ```typescript
    // Send existing producers to the newly-joined peer
    for (const peerId of existingPeers) {
      const existingPeer = getPeer(peerId);
      if (!existingPeer) continue;
      if (existingPeer.producer) {
        try {
          ws.send(JSON.stringify({
            type: WS_TYPES.VOICE_NEW_PRODUCER,
            payload: { producerId: existingPeer.producer.id, peerId, kind: 'audio' },
          }));
        } catch {
          log.debug({ userId, peerId }, 'Failed to send existing audio producer');
        }
      }
      if (existingPeer.videoProducer) {
        try {
          ws.send(JSON.stringify({
            type: WS_TYPES.VOICE_NEW_PRODUCER,
            payload: { producerId: existingPeer.videoProducer.id, peerId, kind: 'video' },
          }));
        } catch {
          log.debug({ userId, peerId }, 'Failed to send existing video producer');
        }
      }
    }
    ```
  - Notes: These are sent directly to the joining peer's `ws` (not broadcast). The client's existing `handleNewProducer` at `wsClient.ts:155-206` will process them. The client will attempt `voice:consume` for each, which will succeed once `voice:set-rtp-capabilities` has been sent (Task 9 ensures correct ordering). Even if consume is called before rtpCapabilities are set, the `canConsume` check in Task 8 will now return a proper error instead of crashing.

- [x] Task 8: Move `canConsume()` inside try/catch in `handleConsume`
  - File: `server/src/plugins/voice/voiceWsHandler.ts`
  - Action: In `handleConsume()`, move the `canConsume` check (lines 265-269) inside the existing try/catch block (line 271). The restructured code:
    ```typescript
    try {
      const router = getRouter();
      if (!router.canConsume({ producerId, rtpCapabilities: peer.rtpCapabilities as Parameters<typeof router.canConsume>[0]['rtpCapabilities'] })) {
        if (requestId) respondError(ws, requestId, 'Cannot consume this producer');
        return;
      }

      const consumer = await peer.recvTransport.consume({
        // ... existing consume code unchanged
      });
      // ... rest of consume handler unchanged
    } catch (err) {
      log.error({ userId, producerId, err: (err as Error).message }, 'Failed to consume');
      if (requestId) respondError(ws, requestId, 'Failed to consume');
    }
    ```
  - Notes: This ensures that if `canConsume` throws (e.g., when `rtpCapabilities` is undefined/malformed), the error is caught and a proper error response with the matching `requestId` is sent. Previously, the throw escaped the try/catch, became an unhandled rejection caught by `wsRouter.ts`, which sent a `TEXT_ERROR` without the request ID — causing a 5-second client timeout.

- [x] Task 9: Client — send `device.rtpCapabilities` after init
  - File: `client/src/renderer/src/services/voiceService.ts`
  - Action: After `mediaService.initDevice()` on line 25, add:
    ```typescript
    // Send device rtpCapabilities to server so it can validate consume requests
    const device = mediaService.getDevice();
    if (device) {
      await wsClient.request<void>('voice:set-rtp-capabilities', {
        rtpCapabilities: device.rtpCapabilities,
      });
    }
    ```
    This goes between line 25 (initDevice) and line 28 (create send transport). The `await` ensures rtpCapabilities are set on the server before any transport creation or produce/consume happens.
  - Notes: Uses the existing `wsClient.request()` pattern. The `VoiceSetRtpCapabilitiesPayload` type from Task 1 matches this shape. No import changes needed — `wsClient` and `mediaService` are already imported.

- [x] Task 10: Client — request voice presence sync on initial connect
  - File: `client/src/renderer/src/services/wsClient.ts`
  - Action: In the `onopen` handler at line 52-55, add a call to `requestVoicePresenceSync()` after the connection state is set:
    ```typescript
    this.socket.onopen = () => {
      this.reconnectDelay = WS_RECONNECT_DELAY;
      usePresenceStore.getState().setConnectionState('connected');
      this.requestVoicePresenceSync();
    };
    ```
  - Notes: `requestVoicePresenceSync()` already exists as a private method at line 460. It's already called on reconnect (line 426). This adds it to the initial connect path too. The method's `.catch(() => {})` means failure is non-blocking.

- [x] Task 11: Add `*.yml` and `*.blockmap` to CI/CD artifact upload
  - File: `.github/workflows/release.yml`
  - Action: Update the upload-artifact step at lines 142-145 to include metadata files:
    ```yaml
    path: |
      client/dist/*.AppImage
      client/dist/*.dmg
      client/dist/*Setup*.exe
      client/dist/*.yml
      client/dist/*.blockmap
    ```
  - Notes: `electron-builder --publish never` still generates `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and `*.blockmap` in `client/dist/`. The existing `gh release upload "$TAG" artifacts/* --clobber` at line 239 will upload them to the GitHub Release automatically.

- [x] Task 12: Update tests for all server-side changes
  - File: `server/src/plugins/voice/voiceWsHandler.test.ts`
  - Action: Add the following test cases:
    1. **Handler registration** — Update the existing `'registers all voice handlers'` test (line 114) to also assert:
       ```typescript
       expect(registeredHandlers.has(WS_TYPES.VOICE_PRESENCE_SYNC)).toBe(true);
       expect(registeredHandlers.has(WS_TYPES.VOICE_SET_RTP_CAPABILITIES)).toBe(true);
       ```

    2. **`describe('voice:presence-sync')`** — New describe block:
       - `'returns all active voice peers'`: Join user-1 to voice-channel-1, join user-2 to voice-channel-1. Call handler with a requestId. Assert response contains `participants` array with both entries, each having `userId` and `channelId`.
       - `'returns empty list when no peers'`: Call handler with no peers joined. Assert response contains `{ participants: [] }`.

    3. **`describe('voice:set-rtp-capabilities')`** — New describe block:
       - `'updates peer rtpCapabilities'`: Join user-1 to voice-channel-1. Call handler with `{ rtpCapabilities: { codecs: [] } }`. Assert `getPeer('user-1')!.rtpCapabilities` equals `{ codecs: [] }`.
       - `'rejects if not in a voice channel'`: Call handler for user not in any channel. Assert error response.

    4. **`describe('voice:join')` — existing producer notification** — Add test:
       - `'sends VOICE_NEW_PRODUCER for existing audio and video producers to newly-joined peer'`: Join user-1 to voice-channel-1, set user-1's producer (using `setPeerProducer`) and videoProducer (using `setPeerVideoProducer`) with mock producers that have `.id` fields. Add user-1's WS to `mockClients`. Then join user-2 via the handler. Assert that user-2's `ws.send` was called with `VOICE_NEW_PRODUCER` payloads for both audio and video producers, with correct `producerId`, `peerId`, and `kind` fields.

    5. **`describe('voice:join')` — broadcastToServer** — Update the existing `'broadcasts peer-joined to other peers'` test (line 185) to also verify that a non-voice-channel client receives the broadcast. Add a third mock client (`user-3`) to `mockClients` that is NOT in the voice channel, and assert it also receives the `VOICE_PEER_JOINED` broadcast.

    6. **`describe('voice:consume')` — canConsume error handling** — Add test:
       - `'responds with error when canConsume throws'`: Join user-1 with `rtpCapabilities: undefined`. Set up recv transport. Mock `getRouter` to return `{ canConsume: vi.fn(() => { throw new Error('Invalid capabilities'); }) }`. Call consume handler. Assert error response with requestId (not a timeout).

    7. **`describe('voice:leave')` — broadcastToServer** — Update the existing `'cleans up and notifies peers'` test (line 545) to also add a non-voice-channel client to `mockClients` and assert it receives `VOICE_PEER_LEFT`.
  - Notes: Import `setPeerProducer` from `./voiceService.js` at the top of the test file (line 5) — it's already imported for other helpers. Also import `setPeerRtpCapabilities` if needed for the new tests. Follow existing test patterns: `createMockWs()`, `registeredHandlers.get(type)!`, `JSON.parse(ws.send.mock.calls[N][0])`.

### Acceptance Criteria

**Bug 1: Voice Presence Visibility**

- [x] AC-1: Given user-A is in voice-channel-1, when user-B connects to the WebSocket (not in any voice channel), then user-B's `channelParticipants` map contains user-A under voice-channel-1's entry.
- [x] AC-2: Given user-B is connected but not in a voice channel, when user-A joins voice-channel-1, then user-B receives `VOICE_PEER_JOINED` with `{ userId: user-A, channelId: voice-channel-1 }`.
- [x] AC-3: Given user-B is connected but not in a voice channel, when user-A leaves voice-channel-1, then user-B receives `VOICE_PEER_LEFT` with `{ userId: user-A, channelId: voice-channel-1 }`.
- [x] AC-4: Given user-B reconnects to the WebSocket, when the connection is established, then user-B receives a `voice:presence-sync` response containing all currently active voice participants across all channels.

**Bug 2 & 3: Audio/Video Consumption**

- [x] AC-5: Given user-A is in voice-channel-1 producing audio, when user-B joins voice-channel-1, then user-B receives `VOICE_NEW_PRODUCER` for user-A's audio producer and successfully consumes it (audio is audible).
- [x] AC-6: Given user-A is in voice-channel-1 producing video, when user-B joins voice-channel-1, then user-B receives `VOICE_NEW_PRODUCER` for user-A's video producer and successfully consumes it (video is visible in the grid).
- [x] AC-7: Given user-B joins voice-channel-1, when user-B's mediasoup Device is initialized, then user-B sends `voice:set-rtp-capabilities` with `device.rtpCapabilities` to the server, and the server stores them on the peer record.
- [x] AC-8: Given user-B's `rtpCapabilities` are set on the server, when user-A produces audio and user-B attempts to consume, then `router.canConsume()` succeeds and the consumer is created.
- [x] AC-9: Given user-B's `rtpCapabilities` are NOT set (undefined), when user-B attempts `voice:consume`, then the server responds with an error message (not a 5-second timeout).

**Bug 4: Auto-Update**

- [x] AC-10: Given a new release is created via the GitHub Actions release workflow, when the workflow completes, then the GitHub Release assets include `latest.yml` (Windows), `latest-mac.yml` (macOS), and `latest-linux.yml` (Linux) alongside the installer files.
- [x] AC-11: Given the release assets include the `*.yml` metadata files, when a user launches the app and `autoUpdater.checkForUpdates()` runs, then the update check succeeds (no error banner) and either reports "no update available" or shows the update notification.

## Additional Context

### Dependencies

- No new external libraries required — all changes use existing dependencies
- `shared/` package must be rebuilt (`npm run build -w shared`) before server/client can use the new WS type constant
- Tasks 1-2 must complete before Tasks 5-9 (shared types and service functions used by handlers and client)
- Task 9 (client sends rtpCapabilities) must execute in the join flow before any `voice:consume` attempt

### Testing Strategy

**Unit Tests (server):**
- All new server handlers (`voice:presence-sync`, `voice:set-rtp-capabilities`) tested via `voiceWsHandler.test.ts`
- Existing producer notification in `handleVoiceJoin` tested with mock producers
- `broadcastToServer` verified by asserting non-voice-channel clients receive presence events
- `canConsume` error handling verified by mocking `canConsume` to throw

**Manual Testing:**
1. Open two clients. Have user-A join a voice channel. Verify user-B (not in any channel) sees user-A in the channel sidebar.
2. Have user-B join the same voice channel. Verify user-B hears user-A's audio.
3. Have user-A enable video. Verify user-B sees user-A's video in the grid.
4. Have user-A join first, then user-B join. Verify user-B can hear user-A (existing producer consumption).
5. Disconnect and reconnect user-B's WebSocket. Verify voice channel participants are restored.
6. Build a release and verify `latest-mac.yml` (or platform equivalent) is present in the GitHub Release assets.

### Notes

- **Test mock masking the bug**: The existing test at line 490 mocks `canConsume: vi.fn().mockReturnValue(true)`, which masked the `undefined` rtpCapabilities bug in CI. The new test case for `canConsume` throwing ensures this failure path is covered.
- **Race condition mitigation**: The `VOICE_NEW_PRODUCER` notifications for existing producers are sent immediately after join, but the client can't consume until after transports are created and rtpCapabilities are sent. The client's `handleNewProducer` will attempt `voice:consume` which may fail if transports aren't ready yet. However, the existing `try/catch` in `handleNewProducer` (`wsClient.ts:203-204`) logs and swallows this error. The mediasoup produce/consume flow is inherently asynchronous and the client handles transient failures. If this race proves problematic in practice, a future improvement would be to queue the existing producer notifications and replay them after the client signals readiness, but that is out of scope.
- **`voice:state` remains on `broadcastToChannel`**: Speaking indicators, mute state, etc. are only relevant to users in the same voice channel, so `voice:state` correctly stays on `broadcastToChannel`. Only presence events (`VOICE_PEER_JOINED`/`VOICE_PEER_LEFT`) move to `broadcastToServer`.
- **macOS auto-update limitation**: Even with the metadata fix, macOS auto-updates require code signing. Without signing, macOS users will still see the error banner. This is a known limitation documented in the bug report and out of scope for this spec.
