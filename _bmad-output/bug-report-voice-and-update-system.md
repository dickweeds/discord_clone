# Production Bug Report: Voice System & Auto-Update

**Date:** 2026-03-01
**Branch:** fix/nginx-swarm-capabilities
**Reported Symptoms:** 4 bugs — voice presence visibility, audio not working, video not working for remote peers, auto-update check failure

---

## Bug 1: Voice Channel Participants Not Visible to Non-Members

**Symptom:** Users who are not in a voice channel cannot see which users are currently in the voice channel. They must join the channel themselves to see participants.

### Root Cause

`broadcastToChannel()` in `server/src/plugins/voice/voiceWsHandler.ts:366-381` sends `VOICE_PEER_JOINED` and `VOICE_PEER_LEFT` events **only to users already in the voice channel**, not to all connected users on the server.

```typescript
// voiceWsHandler.ts:366-381
function broadcastToChannel(channelId: string, excludeUserId: string, type: string, payload: unknown): void {
  const peers = getChannelPeers(channelId);  // Only users IN the voice channel
  // ...iterates only over voice channel peers
}
```

`getChannelPeers()` (`voiceService.ts:65-73`) returns only users who have called `joinVoiceChannel`.

### Contributing Factor

The `voice:presence-sync` handler **does not exist on the server**. The client requests it on reconnect (`wsClient.ts:460-463`) and even has a handler for the response (`wsClient.ts:353-359`), but no server-side handler is registered (`voiceWsHandler.ts:47-54`). The client acknowledges this: `"Server may not support presence-sync yet"`.

### Affected Files

| File | Lines | Issue |
|------|-------|-------|
| `server/src/plugins/voice/voiceWsHandler.ts` | 366-381 | `broadcastToChannel` scoped to voice peers only |
| `server/src/plugins/voice/voiceWsHandler.ts` | 96 | Join event only reaches voice peers |
| `server/src/plugins/voice/voiceWsHandler.ts` | 111, 361 | Leave event only reaches voice peers |
| `server/src/plugins/voice/voiceWsHandler.ts` | 47-54 | Missing `voice:presence-sync` handler |
| `client/src/renderer/src/stores/useVoiceStore.ts` | 80-92 | `channelParticipants` only populated on self-join |
| `client/src/renderer/src/features/channels/ChannelSidebar.tsx` | 67-79 | Renders empty list because store is empty |

### Recommended Fix

**Fix 1a — `broadcastToServer()` for presence events:**

Create a new function in `voiceWsHandler.ts` that broadcasts to ALL connected WS clients (not just voice channel peers). Use it for `VOICE_PEER_JOINED` and `VOICE_PEER_LEFT`. Keep `broadcastToChannel` for media-specific signaling.

```typescript
function broadcastToServer(excludeUserId: string, type: string, payload: unknown): void {
  const clients = getClients();
  for (const [userId, ws] of clients) {
    if (userId === excludeUserId) continue;
    if (ws && ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify({ type, payload })); }
      catch { /* log */ }
    }
  }
}
```

Update these call sites to use `broadcastToServer`:
- Line 96 (`handleVoiceJoin`)
- Line 111 (`handleVoiceLeave`)
- Line 41 (`onWorkerDied`)
- Line 361 (`handleVoiceDisconnect`)

**Fix 1b — Implement `voice:presence-sync` server handler:**

Register the handler and return all active voice peers mapped by channel:

```typescript
registerHandler(WS_TYPES.VOICE_PRESENCE_SYNC, handleVoicePresenceSync);

function handleVoicePresenceSync(ws: WebSocket, message: WsMessage, _userId: string): void {
  const allPeers = getAllPeers();
  const participants: { userId: string; channelId: string }[] = [];
  for (const [, peer] of allPeers) {
    participants.push({ userId: peer.userId, channelId: peer.channelId });
  }
  if (message.id) respond(ws, message.id, { participants });
}
```

**Fix 1c — Request presence sync on initial connect:**

In `wsClient.ts`, call `requestVoicePresenceSync()` in the `onopen` handler (not just on reconnect).

---

## Bug 2: No Audio From Other Users

**Symptom:** Users can join voice channels and see voice activity indicators (speaking animation) for other users, but no actual audio is heard. The mic is being detected — the VAD visualization works — but no sound plays.

### Root Cause #1: Missing `rtpCapabilities`

The client sends only `{ channelId }` in the `voice:join` request (`voiceService.ts:21`). The server destructures `rtpCapabilities` from the payload (`voiceWsHandler.ts:58`) — it's `undefined`. This gets stored in the peer record (`voiceService.ts:36`).

When any user tries to consume this peer's audio, `router.canConsume()` at `voiceWsHandler.ts:266` throws a `TypeError` because `peer.rtpCapabilities` is `undefined`. The `canConsume` call sits **outside** the try/catch block (which starts at line 271), so the error becomes an unhandled rejection. The client's request silently times out after 5 seconds.

```
Client sends: voice:join { channelId }          // No rtpCapabilities!
Server stores: peer.rtpCapabilities = undefined
Later: router.canConsume({ rtpCapabilities: undefined })  // TypeError!
```

### Root Cause #2: No Consumption of Pre-Existing Producers

When User B joins a channel where User A is already producing audio, User B never receives `VOICE_NEW_PRODUCER` for User A's producer (that event was broadcast before User B joined). The `voice:join` response returns `existingPeers` (just user IDs) but **no producer information**. The client uses `existingPeers` only for the UI participant list — never to consume existing media.

### Why VAD Indicators Still Work

Speaking state is broadcast via `voice:state` WebSocket messages (`voiceWsHandler.ts:341-356`) — a plain WS broadcast completely independent of mediasoup. Local VAD runs on the user's own mic via `AudioContext.createAnalyser()`. So indicators work even though the mediasoup consume path is entirely broken.

### Affected Files

| File | Lines | Issue |
|------|-------|-------|
| `client/src/renderer/src/services/voiceService.ts` | 21 | No `rtpCapabilities` in join payload |
| `server/src/plugins/voice/voiceWsHandler.ts` | 58 | Destructures undefined `rtpCapabilities` |
| `server/src/plugins/voice/voiceService.ts` | 36 | Stores `undefined` in peer record |
| `server/src/plugins/voice/voiceWsHandler.ts` | 265-268 | `canConsume()` throws with undefined; outside try/catch |
| `server/src/plugins/voice/voiceWsHandler.ts` | 92 | Join response lacks producer info |
| `client/src/renderer/src/stores/useVoiceStore.ts` | 84-86 | `existingPeers` used only for UI |
| `client/src/renderer/src/services/wsClient.ts` | 203-204 | Consume failure logged as warning, silent to user |
| `server/src/plugins/voice/voiceWsHandler.test.ts` | 490 | Tests mock `canConsume` to `true`, masking the bug |

### Recommended Fix

**Fix 2a — Send `rtpCapabilities` after device init:**

In `voiceService.ts`, after `mediaService.initDevice()`, send the device's capabilities back:

```typescript
await mediaService.initDevice(routerRtpCapabilities);
const device = mediaService.getDevice();
if (device) {
  await wsClient.request('voice:set-rtp-capabilities', {
    rtpCapabilities: device.rtpCapabilities,
  });
}
```

Add a server handler that updates `peer.rtpCapabilities`.

**Fix 2b — Return existing producers in join response:**

In `handleVoiceJoin`, collect all active producers from existing peers:

```typescript
const existingProducers: { producerId: string; peerId: string; kind: string }[] = [];
for (const peerId of existingPeers) {
  const existingPeer = getPeer(peerId);
  if (existingPeer?.producer) {
    existingProducers.push({ producerId: existingPeer.producer.id, peerId, kind: 'audio' });
  }
  if (existingPeer?.videoProducer) {
    existingProducers.push({ producerId: existingPeer.videoProducer.id, peerId, kind: 'video' });
  }
}
respond(ws, requestId, { routerRtpCapabilities, existingPeers, existingProducers });
```

On the client, after transports are set up and the device is loaded, loop over `existingProducers` and consume each one.

**Fix 2c — Move `canConsume()` inside try/catch:**

Move lines 265-268 inside the existing try/catch at line 271 so failures produce a proper error response instead of an unhandled rejection and a 5-second client timeout.

---

## Bug 3: Video Only Works Locally, Not for Remote Users

**Symptom:** Users can turn on their camera and see their own video feed, but other users in the voice channel cannot see it. Only the local preview works.

### Root Cause

**Identical to Bug 2.** Video consumption goes through the exact same `handleConsume` handler (`voiceWsHandler.ts:252-313`) and fails at the same `canConsume` check with `undefined` rtpCapabilities. The `VOICE_NEW_PRODUCER` event for video is also only sent to peers already in the channel, so late joiners never learn about existing video producers.

The UI components (`VideoGrid.tsx:17-45`, `VideoTile.tsx:12-18`) are correctly implemented — they just never receive data because upstream consumption fails. Local video works because `getLocalVideoStream()` returns the camera feed directly, bypassing mediasoup.

### Affected Files

| File | Lines | Issue |
|------|-------|-------|
| `server/src/plugins/voice/voiceWsHandler.ts` | 266 | Same `canConsume` failure for video |
| `server/src/plugins/voice/voiceWsHandler.ts` | 244-248 | `VOICE_NEW_PRODUCER` only sent to current peers |
| `client/src/renderer/src/features/voice/VideoGrid.tsx` | 17-45 | Correctly implemented, never receives data |
| `client/src/renderer/src/features/voice/VideoTile.tsx` | 12-18 | Correctly implemented, never receives data |
| `client/src/renderer/src/services/mediaService.ts` | 267-288 | `consumeVideo()` never successfully called |

### Recommended Fix

**Same as Bug 2 — Fixes 2a, 2b, and 2c resolve both audio and video.**

---

## Bug 4: Auto-Update Check Fails on Login

**Symptom:** When a user logs in, an upper banner appears stating "Update check failed." with a Retry button. The banner auto-dismisses after 10 seconds.

### Root Cause

The CI/CD release pipeline (`release.yml`) never includes the auto-update metadata files (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) in the GitHub Release assets. Without these files, `electron-updater` makes an HTTP request to `https://github.com/<owner>/<repo>/releases/latest/download/latest-mac.yml`, gets a **404 Not Found**, and fires the `error` event.

**The application code is correct.** The bug is entirely in the CI/CD pipeline.

### Three Pipeline Issues

**Issue 4.1 — `--publish never` flag:**

`release.yml:136` builds with `--publish never`:

```yaml
cd client && npx electron-builder --publish never -c.extraMetadata.version=$VERSION
```

Despite `--publish never`, electron-builder **does** still generate metadata files in the `dist/` directory — it just doesn't upload them. So this alone is not the bug, but it means the files must be explicitly collected.

**Issue 4.2 — Artifact upload omits metadata files:**

`release.yml:138-146` only captures installers:

```yaml
path: |
  client/dist/*.AppImage
  client/dist/*.dmg
  client/dist/*Setup*.exe
```

The `*.yml` and `*.blockmap` files are not included.

**Issue 4.3 — Release upload inherits the gap:**

`release.yml:239` uploads everything from the artifacts directory:

```yaml
gh release upload "$TAG" artifacts/* --clobber
```

Since the metadata files were never captured in step 4.2, they're not in the artifacts directory and never make it to the GitHub Release.

### The Error Flow

1. App starts → `initAutoUpdater(mainWindow)` called (`client/src/main/index.ts:141-143`)
2. After 5s delay → `autoUpdater.checkForUpdates()` fires (`client/src/main/updater.ts:74-76`)
3. HTTP GET to `https://github.com/.../releases/latest/download/latest-mac.yml` → **404**
4. `autoUpdater.on('error')` fires → sends IPC to renderer (`updater.ts:47-50`)
5. Zustand store sets `status: 'error'` (`useUpdateStore.ts:80-81`)
6. `UpdateNotification` renders error banner (`UpdateNotification.tsx:87-103`)
7. Banner auto-dismisses after 10s (`UpdateNotification.tsx:19-21`)

### Affected Files

| File | Lines | Issue |
|------|-------|-------|
| `.github/workflows/release.yml` | 136 | `--publish never` (metadata files generated but not uploaded) |
| `.github/workflows/release.yml` | 138-146 | Artifact upload omits `*.yml` and `*.blockmap` |
| `.github/workflows/release.yml` | 239 | Release upload inherits the gap |
| `client/src/main/updater.ts` | 47-50, 74-76 | Application code is correct — error handler works as designed |
| `client/src/renderer/src/components/UpdateNotification.tsx` | 87-103 | Banner UI is correct — displays the 404 error |
| `client/electron-builder.yml` | 28-31 | Publish config (provider: github) is correct |

### Recommended Fix

**Fix 4a — Add metadata files to artifact upload:**

In `.github/workflows/release.yml`, update the upload-artifact step:

```yaml
- name: Upload installer artifacts
  uses: actions/upload-artifact@v4
  with:
    name: electron-${{ matrix.os }}
    path: |
      client/dist/*.AppImage
      client/dist/*.dmg
      client/dist/*Setup*.exe
      client/dist/*.yml
      client/dist/*.blockmap
    if-no-files-found: error
```

This ensures `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and `.blockmap` files are captured alongside the installers. Since line 239 uploads `artifacts/*`, the metadata files will automatically land in the GitHub Release.

### Secondary Consideration: macOS Code Signing

`electron-updater` requires macOS apps to be code-signed for auto-updates to work. The `electron-builder.yml` has no signing identity configured. Even after fixing the metadata files, macOS auto-update may still fail silently without code signing. Windows and Linux should work with the metadata fix alone.

---

## Fix Summary

| Fix | Description | Scope | Resolves |
|-----|-------------|-------|----------|
| **F1a** | Create `broadcastToServer()` for presence events | Server | Bug 1 |
| **F1b** | Implement `voice:presence-sync` server handler | Server | Bug 1 |
| **F1c** | Request presence sync on initial connect | Client | Bug 1 |
| **F2a** | Send `device.rtpCapabilities` after init | Client + Server | Bug 2 + Bug 3 |
| **F2b** | Return `existingProducers` in join response; consume on client | Client + Server | Bug 2 + Bug 3 |
| **F2c** | Move `canConsume()` inside try/catch | Server | Bug 2 + Bug 3 |
| **F4a** | Add `*.yml` and `*.blockmap` to artifact upload | CI/CD | Bug 4 |

### Dependency Order

Fixes F2a and F2b are **both required** for audio/video to work. F2a alone fixes the `canConsume` crash but without F2b, late joiners still can't discover existing producers. F2b alone provides producer discovery but consumption still crashes without valid `rtpCapabilities`.

Recommended implementation order:
1. F2a + F2c (rtpCapabilities + error handling — unblocks all consumption)
2. F2b (existing producer discovery — completes the media flow)
3. F1a + F1b + F1c (voice presence visibility — independent of media)
4. F4a (auto-update metadata — independent CI/CD fix)
