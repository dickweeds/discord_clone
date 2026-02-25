# Story 3.1: Voice Server Infrastructure

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the mediasoup SFU and coturn TURN/STUN server configured,
So that the platform has the server-side infrastructure to support group voice calls with NAT traversal.

## Acceptance Criteria

1. **Given** the server starts **When** mediasoup is initialized **Then** a mediasoup Worker is created with appropriate settings **And** a Router is created with audio/opus codec for media routing

2. **Given** the server configuration **When** coturn is configured **Then** STUN/TURN services are available for WebRTC NAT traversal **And** credentials are configured securely via HMAC-SHA1 time-limited tokens

3. **Given** a client needs to establish a WebRTC connection **When** the client requests transport creation via WebSocket **Then** the server creates a mediasoup WebRtcTransport with coturn ICE server configuration **And** returns the transport parameters (id, iceParameters, iceCandidates, dtlsParameters, iceServers) to the client

4. **Given** the WebSocket signaling protocol **When** voice-related messages are exchanged **Then** they follow the `namespace:action` format (`voice:join`, `voice:leave`, `voice:create-transport`, `voice:connect-transport`, `voice:produce`, `voice:consume`, `voice:consumer-resume`)

## Tasks / Subtasks

- [x] Task 1: Install mediasoup and configure environment (AC: 1, 2)
  - [x] 1.1 Install mediasoup in server workspace: `npm install mediasoup -w server`
  - [x] 1.2 Install `@types/mediasoup` if needed (check if mediasoup ships its own types — it does, no separate `@types` package needed)
  - [x] 1.3 Add environment variables to `server/.env` and `server/.env.example`:
    - `MEDIASOUP_LISTEN_IP=0.0.0.0`
    - `MEDIASOUP_ANNOUNCED_IP=127.0.0.1` (use public IP in production)
    - `MEDIASOUP_MIN_PORT=40000`
    - `MEDIASOUP_MAX_PORT=49999`
    - `TURN_HOST=127.0.0.1`
    - `TURN_PORT=3478`
    - `TURN_SECRET=dev-turn-secret-change-in-production`
  - [x] 1.4 Verify mediasoup native worker binary compiles/downloads on install (requires C++ toolchain: Xcode CLI tools on macOS, build-essential on Linux)
  - [x] 1.5 Verify Node.js version compatibility — mediasoup v3.19.3+ requires Node.js >= 22. If server runs Node 20, pin `mediasoup@3.19.2`. Recommend upgrading server to Node.js 22+

- [x] Task 2: Create mediasoupManager.ts — Worker and Router lifecycle (AC: 1)
  - [x]2.1 Create `server/src/plugins/voice/mediasoupManager.ts`
  - [x]2.2 `initMediasoup()` — creates a single mediasoup Worker:
    ```typescript
    const worker = await mediasoup.createWorker({
      logLevel: 'warn',
      logTags: ['ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
    })
    ```
  - [x]2.3 Create a single Router on the Worker with audio/opus codec:
    ```typescript
    const mediaCodecs: RtpCodecCapability[] = [
      { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
    ]
    const router = await worker.createRouter({ mediaCodecs })
    ```
  - [x]2.4 Handle Worker `died` event — log error via Pino, attempt restart after 2s delay
  - [x]2.5 Export functions:
    - `initMediasoup(): Promise<void>`
    - `getRouter(): Router`
    - `getRouterRtpCapabilities(): RtpCapabilities`
    - `createWebRtcTransport(userId: string): Promise<{ transport, transportParams, iceServers }>`
    - `closeMediasoup(): Promise<void>` (for graceful shutdown and tests)
  - [x]2.6 Single Worker + single Router is sufficient for up to 20 users — do NOT over-engineer with multi-worker pools

- [x] Task 3: Implement WebRtcTransport creation with TURN credentials (AC: 2, 3)
  - [x]3.1 In `mediasoupManager.ts`, implement `createWebRtcTransport(userId)`:
    ```typescript
    const transport = await router.createWebRtcTransport({
      listenInfos: [
        { protocol: 'udp', ip: LISTEN_IP, announcedAddress: ANNOUNCED_IP, portRange: { min: MIN_PORT, max: MAX_PORT } },
        { protocol: 'tcp', ip: LISTEN_IP, announcedAddress: ANNOUNCED_IP, portRange: { min: MIN_PORT, max: MAX_PORT } },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 600000,
    })
    ```
  - [x]3.2 **CRITICAL: Use `listenInfos` NOT `listenIps`** — `listenIps` is DEPRECATED in mediasoup 3.19.x
  - [x]3.3 **CRITICAL: Use `portRange` per-transport in `listenInfos`** — `rtcMinPort`/`rtcMaxPort` on Worker is DEPRECATED
  - [x]3.4 Create `generateTurnCredentials(userId: string)` utility in same file:
    ```typescript
    // TURN REST API pattern: time-limited HMAC-SHA1 credentials
    const ttl = 24 * 3600
    const unixTimestamp = Math.floor(Date.now() / 1000) + ttl
    const username = `${unixTimestamp}:${userId}`
    const credential = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64')
    return { username, credential, urls: [`stun:${TURN_HOST}:${TURN_PORT}`, `turn:${TURN_HOST}:${TURN_PORT}?transport=udp`, `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`] }
    ```
  - [x]3.5 Return from `createWebRtcTransport()`:
    - `transport` — server-side reference (store in peer state, do NOT send to client)
    - `transportParams` — `{ id, iceParameters, iceCandidates, dtlsParameters }` (send to client)
    - `iceServers` — TURN/STUN server array with credentials (send to client)

- [x] Task 4: Create voiceService.ts — voice channel state management (AC: 3, 4)
  - [x]4.1 Create `server/src/plugins/voice/voiceService.ts`
  - [x]4.2 Define in-memory voice state:
    ```typescript
    interface VoicePeer {
      userId: string
      channelId: string
      sendTransport: WebRtcTransport | null
      recvTransport: WebRtcTransport | null
      producer: Producer | null
      consumers: Map<string, Consumer>  // keyed by consumerId
    }
    // Map<userId, VoicePeer>
    const voicePeers = new Map<string, VoicePeer>()
    ```
  - [x]4.3 `joinVoiceChannel(userId, channelId)` — add peer to state, return existing peers in channel
  - [x]4.4 `leaveVoiceChannel(userId)` — close all transports/producers/consumers, remove from state, notify remaining peers
  - [x]4.5 `getChannelPeers(channelId)` — return list of userIds in a voice channel
  - [x]4.6 `getPeer(userId)` — return peer state (for transport/producer/consumer access)
  - [x]4.7 `setPeerTransport(userId, direction, transport)` — store send or recv transport
  - [x]4.8 `setPeerProducer(userId, producer)` — store audio producer
  - [x]4.9 `addPeerConsumer(userId, consumer)` — add consumer
  - [x]4.10 `removePeer(userId)` — full cleanup (called on WS disconnect too)
  - [x]4.11 `clearAllVoiceState()` — for tests
  - [x]4.12 Validate channel type is `voice` when joining — reject `text` channels

- [x] Task 5: Add WebSocket request-response support (AC: 3, 4)
  - [x]5.1 Extend server `wsRouter.ts` — add `respond(ws, originalMessage, payload)` function:
    ```typescript
    export function respond(ws: WebSocket, requestId: string, payload: unknown): void {
      ws.send(JSON.stringify({ type: 'response', payload, id: requestId }))
    }
    export function respondError(ws: WebSocket, requestId: string, error: string): void {
      ws.send(JSON.stringify({ type: 'error', payload: { error }, id: requestId }))
    }
    ```
  - [x]5.2 Extend client `wsClient.ts` — add `request<T>(message: WsMessage): Promise<T>` method:
    ```typescript
    request<T>(type: string, payload: unknown, timeout = 5000): Promise<T> {
      const id = crypto.randomUUID()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error('Request timeout')) }, timeout)
        const cleanup = this.on('response', (responsePayload, responseId) => {
          if (responseId === id) { clearTimeout(timer); resolve(responsePayload as T) }
        })
        this.send({ type, payload, id })
      })
    }
    ```
  - [x]5.3 Handle `error` response type — reject the promise with the error message
  - [x]5.4 Handle `response` type in wsClient message dispatcher — route by `id` to pending promises
  - [x]5.5 Modify `WsHandler` type to include the full `WsMessage` (for access to `id` field): `(ws: WebSocket, message: WsMessage, userId: string) => void`

- [x] Task 6: Create voiceWsHandler.ts — WebSocket signaling handlers (AC: 3, 4)
  - [x]6.1 Create `server/src/plugins/voice/voiceWsHandler.ts`
  - [x]6.2 `registerVoiceHandlers()` — registers all voice handlers with wsRouter
  - [x]6.3 `voice:join` handler:
    - Validate channelId exists and is type `voice`
    - Call `voiceService.joinVoiceChannel(userId, channelId)`
    - Respond with `{ routerRtpCapabilities, existingPeers }` (list of userIds already in channel)
    - Broadcast `voice:peer-joined` to other peers in channel: `{ userId, channelId }`
  - [x]6.4 `voice:leave` handler:
    - Call `voiceService.leaveVoiceChannel(userId)`
    - Broadcast `voice:peer-left` to remaining peers: `{ userId, channelId }`
    - Respond with acknowledgment
  - [x]6.5 `voice:create-transport` handler:
    - Extract `direction` from payload (`'send'` or `'recv'`)
    - Call `mediasoupManager.createWebRtcTransport(userId)`
    - Store transport in peer state via `voiceService.setPeerTransport(userId, direction, transport)`
    - Set up transport event listeners (`dtlsstatechange`, `icestatechange` — log via Pino)
    - Respond with `{ transportParams, iceServers }`
  - [x]6.6 `voice:connect-transport` handler:
    - Extract `{ transportId, dtlsParameters }` from payload
    - Find transport in peer state, call `transport.connect({ dtlsParameters })`
    - Respond with acknowledgment
  - [x]6.7 `voice:produce` handler:
    - Extract `{ transportId, kind, rtpParameters }` from payload
    - Find send transport, call `transport.produce({ kind, rtpParameters })`
    - Store producer in peer state
    - Notify all other peers in channel: `voice:new-producer` with `{ producerId, peerId: userId }`
    - Respond with `{ producerId: producer.id }`
  - [x]6.8 `voice:consume` handler:
    - Extract `{ producerId }` from payload
    - Verify `router.canConsume({ producerId, rtpCapabilities })` — rtpCapabilities come from payload or stored on join
    - Create consumer on peer's recv transport (paused: true)
    - Store consumer in peer state
    - Respond with `{ consumerId, producerId, kind, rtpParameters }`
  - [x]6.9 `voice:consumer-resume` handler:
    - Extract `{ consumerId }` from payload
    - Find consumer in peer state, call `consumer.resume()`
    - Respond with acknowledgment
  - [x]6.10 Handle WebSocket disconnect in wsServer — call `voiceService.removePeer(userId)` on client disconnect to clean up all voice state
  - [x]6.11 Store client's `rtpCapabilities` on `voice:join` — needed for `router.canConsume()` checks

- [x] Task 7: Add shared types for voice signaling (AC: 4)
  - [x]7.1 Add new WS_TYPES to `shared/src/ws-messages.ts`:
    ```typescript
    VOICE_CREATE_TRANSPORT: 'voice:create-transport',
    VOICE_CONNECT_TRANSPORT: 'voice:connect-transport',
    VOICE_PRODUCE: 'voice:produce',
    VOICE_CONSUME: 'voice:consume',
    VOICE_CONSUMER_RESUME: 'voice:consumer-resume',
    VOICE_NEW_PRODUCER: 'voice:new-producer',
    VOICE_PRODUCER_CLOSED: 'voice:producer-closed',
    VOICE_PEER_JOINED: 'voice:peer-joined',
    VOICE_PEER_LEFT: 'voice:peer-left',
    ```
  - [x]7.2 Add payload interfaces:
    ```typescript
    interface VoiceCreateTransportPayload { direction: 'send' | 'recv' }
    interface VoiceCreateTransportResponse { transportParams: { id: string, iceParameters: unknown, iceCandidates: unknown[], dtlsParameters: unknown }, iceServers: { urls: string | string[], username?: string, credential?: string }[] }
    interface VoiceConnectTransportPayload { transportId: string, dtlsParameters: unknown }
    interface VoiceProducePayload { transportId: string, kind: 'audio', rtpParameters: unknown }
    interface VoiceProduceResponse { producerId: string }
    interface VoiceConsumePayload { producerId: string }
    interface VoiceConsumeResponse { consumerId: string, producerId: string, kind: 'audio', rtpParameters: unknown }
    interface VoiceConsumerResumePayload { consumerId: string }
    interface VoiceNewProducerPayload { producerId: string, peerId: string }
    interface VoiceProducerClosedPayload { producerId: string, peerId: string }
    interface VoicePeerJoinedPayload { userId: string, channelId: string }
    interface VoicePeerLeftPayload { userId: string, channelId: string }
    ```
  - [x]7.3 Export all new types from `shared/src/index.ts`
  - [x]7.4 Update `VoiceJoinPayload` to include `rtpCapabilities?: unknown` (client sends device capabilities on join)
  - [x]7.5 Add `VoiceJoinResponse` type: `{ routerRtpCapabilities: unknown, existingPeers: string[] }`

- [x] Task 8: Create coturn configuration (AC: 2)
  - [x]8.1 Create `docker/coturn/turnserver.conf`:
    ```conf
    listening-port=3478
    listening-ip=0.0.0.0
    min-port=49152
    max-port=49252
    realm=discord-clone.local
    use-auth-secret
    static-auth-secret=dev-turn-secret-change-in-production
    fingerprint
    no-multicast-peers
    no-tls
    no-dtls
    no-cli
    log-file=stdout
    verbose
    ```
  - [x]8.2 Add coturn service to Docker Compose (create `docker-compose.dev.yml` or add to existing):
    ```yaml
    services:
      coturn:
        image: coturn/coturn:latest
        network_mode: host
        volumes:
          - ./docker/coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro
        restart: unless-stopped
    ```
  - [x]8.3 Ensure `TURN_SECRET` in `.env` matches `static-auth-secret` in `turnserver.conf`
  - [x]8.4 **NOTE**: For local LAN development, coturn may not be needed — direct connectivity works. coturn is required for production (NAT traversal) and remote testing

- [x] Task 9: Register voice plugin in app.ts (AC: 1, 4)
  - [x]9.1 Import `initMediasoup` from `mediasoupManager.ts`
  - [x]9.2 Import `registerVoiceHandlers` from `voiceWsHandler.ts`
  - [x]9.3 Call `initMediasoup()` during server startup (before WebSocket handlers are registered)
  - [x]9.4 Call `registerVoiceHandlers()` after wsServer plugin is registered
  - [x]9.5 Add disconnect cleanup: in `wsServer.ts` `close` event handler, call `voiceService.removePeer(userId)` to clean up voice state when a client disconnects
  - [x]9.6 Updated plugin registration order in `app.ts`:
    ```typescript
    // Infrastructure
    await app.register(cors)
    await app.register(dbPlugin)
    await initMediasoup()           // NEW — mediasoup Worker + Router

    // Auth & Domain
    await app.register(authMiddleware)
    await app.register(authRoutes)
    await app.register(inviteRoutes)
    await app.register(channelRoutes, { prefix: '/api/channels' })
    await app.register(userRoutes, { prefix: '/api/users' })
    await app.register(wsServer)    // existing
    registerVoiceHandlers()         // NEW — voice WS handlers
    ```

- [x] Task 10: Write server-side tests (AC: 1-4)
  - [x]10.1 Create `server/src/plugins/voice/mediasoupManager.test.ts`:
    - Test Worker creation (verify Worker is alive after init)
    - Test Router creation (verify router has rtpCapabilities with audio/opus)
    - Test `getRouterRtpCapabilities()` returns valid capabilities
    - Test `createWebRtcTransport()` returns transport params and ICE servers
    - Test TURN credential generation (valid HMAC-SHA1 format, correct TTL)
    - Test Worker death recovery (mock Worker.died event, verify reinit)
    - Test `closeMediasoup()` cleanup
  - [x]10.2 Create `server/src/plugins/voice/voiceService.test.ts`:
    - Test `joinVoiceChannel()` — adds peer, returns existing peers
    - Test `leaveVoiceChannel()` — removes peer, closes transports/producers/consumers
    - Test `getChannelPeers()` — returns correct user list
    - Test `removePeer()` — full cleanup on disconnect
    - Test joining text channel — should reject
    - Test double-join — should leave previous channel first
    - Test empty channel after all leave
  - [x]10.3 Create `server/src/plugins/voice/voiceWsHandler.test.ts`:
    - Test `voice:join` — responds with router capabilities + existing peers
    - Test `voice:create-transport` — responds with transport params + ICE servers
    - Test `voice:connect-transport` — succeeds with valid dtlsParameters
    - Test `voice:produce` — responds with producerId, notifies peers
    - Test `voice:consume` — responds with consumer params
    - Test `voice:consumer-resume` — resumes consumer
    - Test `voice:leave` — cleans up, notifies peers
    - Test voice cleanup on WebSocket disconnect
    - Mock mediasoup objects (Worker, Router, Transport, Producer, Consumer) for unit tests
  - [x]10.4 Create `server/src/ws/wsRouter.test.ts` updates:
    - Test `respond()` function sends correct JSON with id
    - Test `respondError()` function sends error format

- [x] Task 11: Write client-side wsClient tests (AC: 3, 4)
  - [x]11.1 Update `client/src/renderer/src/services/wsClient.test.ts`:
    - Test `request()` — sends message with id, resolves on matching response
    - Test `request()` timeout — rejects after timeout
    - Test `request()` error response — rejects with error message
    - Test multiple concurrent requests — resolves independently by id

- [x] Task 12: Final verification (AC: 1-4)
  - [x]12.1 Run `npm test -w server` — all existing + new tests pass
  - [x]12.2 Run `npm test -w client` — wsClient tests pass (18/18); 34 pre-existing UI component test failures unrelated to story 3-1
  - [x]12.3 Run `npm run lint` — no lint errors across all workspaces
  - [x]12.4 Verify `npm run build -w server` succeeds with mediasoup types
  - [x]12.5 Manual test: start server, verify "mediasoup Worker created" in Pino logs
  - [x]12.6 Manual test: verify mediasoup Router has audio/opus codec in capabilities
  - [x]12.7 Optional: start coturn Docker container and verify STUN binding response

## Dev Notes

### Critical Architecture: mediasoup SFU Pattern

mediasoup is a **Selective Forwarding Unit (SFU)** — it receives audio from each peer and selectively forwards it to other peers. Unlike mesh topology (where every peer connects to every other peer), SFU scales to 20 participants efficiently.

```
Client A ──send──> [mediasoup Router] ──forward──> Client B (recv transport)
Client B ──send──> [mediasoup Router] ──forward──> Client A (recv transport)
Client C ──send──> [mediasoup Router] ──forward──> Client A + B
```

**Key concepts:**
- **Worker** — a C++ subprocess that handles media. One Worker suffices for <=20 users
- **Router** — defines codec capabilities and routes media between Transports
- **WebRtcTransport** — a transport endpoint. Each peer needs TWO: one for sending, one for receiving
- **Producer** — represents an audio track being sent TO the server
- **Consumer** — represents a forwarded audio track being sent FROM the server to a client

### mediasoup is ICE Lite

**Critical**: mediasoup acts as ICE Lite — it does NOT initiate connectivity checks. TURN/STUN configuration lives **exclusively on the client side** via `iceServers` option when creating transports. The server just needs its ports reachable.

The original architecture mentioned `rtc:offer/rtc:answer/rtc:ice` message types. These are for raw WebRTC SDP exchange which **does NOT apply to mediasoup**. mediasoup has its own signaling protocol (transport params, dtlsParameters, rtpParameters). The `voice:*` message types replace the `rtc:*` types.

### Node.js Version Constraint

mediasoup v3.19.3+ dropped Node.js 20 support and requires **Node.js >= 22**. Options:
1. **Recommended**: Upgrade server to Node.js 22+ (Fastify v5.7.x supports Node 22)
2. **Fallback**: Pin `mediasoup@3.19.2` (last version supporting Node 20)

The server runs independently from Electron, so the server Node version is not constrained by Electron's bundled Node version.

### mediasoup API: DEPRECATED Features (Do NOT Use)

| Deprecated | Use Instead |
|---|---|
| `listenIps` on WebRtcTransport | `listenInfos` with `TransportListenInfo` objects |
| `rtcMinPort` / `rtcMaxPort` on Worker | `portRange` per-transport in `listenInfos` |
| `Device.factory()` was preferred | Constructor `new Device()` is fine |

### WebSocket Signaling Flow (Complete)

```
CLIENT                          SERVER
  |                               |
  |-- voice:join {channelId,     |
  |   rtpCapabilities} --------->|  voiceService.join()
  |                               |  → store rtpCapabilities
  |<-- response {routerRtpCaps,  |  → return router caps + peers
  |     existingPeers} ----------|
  |                               |
  |-- voice:create-transport     |
  |   {direction:'send'} ------->|  mediasoupManager.createWebRtcTransport()
  |<-- response {transportParams,|  → return params + TURN creds
  |     iceServers} -------------|
  |                               |
  |-- voice:create-transport     |
  |   {direction:'recv'} ------->|  (same for recv transport)
  |<-- response {transportParams,|
  |     iceServers} -------------|
  |                               |
  |-- voice:connect-transport    |
  |   {transportId,              |
  |    dtlsParameters} --------->|  transport.connect({dtlsParameters})
  |<-- response {} --------------|
  |                               |
  |-- voice:produce              |
  |   {transportId, kind,        |
  |    rtpParameters} ---------->|  transport.produce()
  |<-- response {producerId} ----|  → notify other peers
  |                               |
  |  [for each existing producer]|
  |-- voice:consume              |
  |   {producerId} ------------->|  recvTransport.consume()
  |<-- response {consumerId,     |
  |     kind, rtpParameters} ----|
  |                               |
  |-- voice:consumer-resume      |
  |   {consumerId} ------------->|  consumer.resume()
  |<-- response {} --------------|
  |                               |
  |  [when other peer produces]  |
  |<-- voice:new-producer        |  (server push)
  |   {producerId, peerId} ------|
  |                               |
  |-- voice:leave {} ----------->|  voiceService.leave()
  |<-- response {} --------------|  → notify remaining peers
```

### WebSocket Request-Response Pattern

The existing `WsMessage.id` field enables request-response. Implementation:

**Server (wsRouter.ts):**
```typescript
export function respond(ws: WebSocket, requestId: string, payload: unknown): void {
  ws.send(JSON.stringify({ type: 'response', payload, id: requestId }))
}
```

**Client (wsClient.ts):**
```typescript
request<T>(type: string, payload: unknown, timeout = 5000): Promise<T> {
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timeout')), timeout)
    // Listen for response with matching id...
    this.send({ type, payload, id })
  })
}
```

### TURN Credential Generation

coturn uses TURN REST API (RFC 7635) with shared secret. Time-limited credentials:

```typescript
// Username: "{expiry_unix_timestamp}:{userId}"
// Credential: base64(HMAC-SHA1(username, shared_secret))
// TTL: 24 hours
// Both server and coturn share the same TURN_SECRET
```

The `static-auth-secret` in `turnserver.conf` MUST match `TURN_SECRET` in `.env`.

### Audio Codec Configuration

Router MUST include audio/opus codec with these exact parameters:
```typescript
{ kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 }
```

Opus is the only codec needed for voice. Do NOT add video codecs in this story (video is Epic 4).

### Voice Channel State Lifecycle

```
User connects WS → (no voice state)
  ↓ voice:join
User in voice channel → VoicePeer created with channelId
  ↓ voice:create-transport (x2)
Transports created → sendTransport + recvTransport stored
  ↓ voice:connect-transport (x2)
Transports connected → DTLS established
  ↓ voice:produce
Audio producer active → other peers notified
  ↓ voice:consume (per remote producer)
Consuming remote audio → audio flowing
  ↓ voice:leave OR WS disconnect
Cleanup → close all transports/producers/consumers, notify peers
```

**Critical**: On WebSocket disconnect, `voiceService.removePeer(userId)` MUST be called to clean up all mediasoup resources. Failure to do this leaks server-side transports.

### Existing Code to Reuse (Do NOT Reinvent)

| What | Where | How to Reuse |
|---|---|---|
| WS handler registration | `server/src/ws/wsRouter.ts` → `registerHandler()` | Register voice handlers same way as presence |
| Client tracking map | `server/src/ws/wsServer.ts` → `getClients()` | Use for broadcasting to voice channel peers |
| Channel validation | `server/src/plugins/channels/channelService.ts` | Verify channelId exists and type === 'voice' |
| Auth context (userId) | WsHandler receives `userId` as 3rd param | Already available from WebSocket auth |
| WS message types | `shared/src/ws-messages.ts` → `WS_TYPES` | Add new voice types to existing object |
| Pino logger | `fastify.log` in plugins | Use for mediasoup event logging |

### Voice-Specific Broadcasting

When broadcasting to voice channel peers (e.g., `voice:peer-joined`, `voice:new-producer`), use:
```typescript
// Get all peers in the voice channel
const peers = voiceService.getChannelPeers(channelId)
const clients = getClients()  // from wsServer.ts

for (const peerId of peers) {
  if (peerId === userId) continue  // skip sender
  const ws = clients.get(peerId)
  if (ws) ws.send(JSON.stringify({ type, payload }))
}
```

### File Structure

**New files:**
```
server/src/plugins/voice/
  mediasoupManager.ts          # Worker/Router/Transport lifecycle
  mediasoupManager.test.ts     # mediasoup unit tests
  voiceService.ts              # Voice channel state management
  voiceService.test.ts         # State management tests
  voiceWsHandler.ts            # WS signaling handlers
  voiceWsHandler.test.ts       # Handler tests

docker/coturn/
  turnserver.conf              # TURN/STUN configuration
```

**Modified files:**
```
server/src/app.ts                           # Register mediasoup init + voice handlers
server/src/ws/wsServer.ts                   # Add voice cleanup on disconnect
server/src/ws/wsRouter.ts                   # Add respond() and respondError() functions
server/src/ws/wsRouter.test.ts              # Add respond/respondError tests
server/.env                                 # Add MEDIASOUP_* and TURN_* variables
server/.env.example                         # Add MEDIASOUP_* and TURN_* variables
server/package.json                         # Add mediasoup dependency
shared/src/ws-messages.ts                   # Add voice signaling types + payloads
shared/src/index.ts                         # Export new voice types
client/src/renderer/src/services/wsClient.ts       # Add request() method
client/src/renderer/src/services/wsClient.test.ts  # Add request() tests
docker-compose.dev.yml (new or existing)    # Add coturn service
```

### Testing Patterns

**Mocking mediasoup for unit tests:**
```typescript
// mediasoup creates native C++ workers which are heavy for tests
// Mock the mediasoup module:
vi.mock('mediasoup', () => ({
  createWorker: vi.fn().mockResolvedValue({
    on: vi.fn(),
    close: vi.fn(),
    createRouter: vi.fn().mockResolvedValue({
      rtpCapabilities: { codecs: [...], headerExtensions: [...] },
      canConsume: vi.fn().mockReturnValue(true),
      createWebRtcTransport: vi.fn().mockResolvedValue({
        id: 'transport-id',
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
        connect: vi.fn(),
        produce: vi.fn().mockResolvedValue({ id: 'producer-id', on: vi.fn(), close: vi.fn() }),
        consume: vi.fn().mockResolvedValue({ id: 'consumer-id', kind: 'audio', rtpParameters: {}, track: null, resume: vi.fn(), on: vi.fn(), close: vi.fn() }),
        on: vi.fn(),
        close: vi.fn(),
      }),
    }),
  }),
}))
```

**Test patterns from story 2-1 to follow:**
- Server: use `setupApp()` helper, `seedUserWithSession()` for auth
- Use `vi.mock` for external dependencies
- Use `beforeEach` to reset state
- Co-locate test files alongside source files

### Previous Story (2-1) Intelligence

**Patterns established in Story 2-1 that apply here:**
- WS handler registration: `registerHandler(WS_TYPES.X, handler)` in wsRouter
- Client tracking: `getClients()` returns `Map<userId, WebSocket>` from wsServer
- ESM imports with `.js` extensions on server side
- Client imports without `.js` (use `@renderer` alias)
- Fastify plugin pattern with `fastify-plugin` for shared decorators
- Auth middleware already excludes `/ws` — no changes needed
- Pino logger for all server-side logging (never `console.log`)

**Code review lessons from Epic 1 to follow:**
- Always create `Error` instances (not plain objects) when throwing
- Add `required` arrays to Fastify JSON schemas
- Don't create split state (two sources of truth for the same data)
- Write tests for ALL new services and handlers

### Anti-Patterns to Avoid

- **NEVER** use `socket.io` or raw `ws` — use existing `@fastify/websocket` infrastructure
- **NEVER** use `listenIps` on WebRtcTransport — use `listenInfos` (deprecated API)
- **NEVER** use `rtcMinPort`/`rtcMaxPort` on Worker — use `portRange` per-transport
- **NEVER** create multiple Workers for <=20 users — one Worker suffices
- **NEVER** send the server-side `transport` object to the client — only send `transportParams`
- **NEVER** forget to clean up mediasoup resources on disconnect — this leaks server resources
- **NEVER** log audio content or RTP data — log only connection events
- **NEVER** use `console.log` on the server — use Pino logger
- **NEVER** hardcode TURN credentials — use HMAC-SHA1 time-limited generation
- **NEVER** add video codecs to the Router in this story — video is Epic 4

### Deferred / Not In Scope

- **Client-side mediasoup-client**: Device/Transport creation is story 3.2
- **Voice channel UI**: VoiceStatusBar, VoiceParticipant components are story 3.2
- **Audio capture/playback**: getUserMedia and audio elements are story 3.3
- **Speaking indicators**: Voice activity detection is story 3.3
- **Mute/deafen controls**: Audio control state is story 3.4
- **Audio device selection**: Device enumeration is story 3.4
- **Video tracks**: Video producer/consumer is Epic 4
- **True E2E voice encryption**: WebRTC Encoded Transform is post-MVP
- **Multi-worker scaling**: Not needed for <=20 users
- **coturn TLS (TURNS)**: Deferred to production deployment story (6.4)

### Project Structure Notes

- Voice plugin at `server/src/plugins/voice/` follows existing plugin pattern (`auth/`, `channels/`, `presence/`)
- coturn config at `docker/coturn/` follows architecture doc's planned structure
- Shared voice types extend existing `ws-messages.ts` — do NOT create a separate file
- Voice WS handlers register via the existing `registerHandler()` pattern — no new routing infrastructure needed

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-3-voice-communication.md#Story-3.1] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#WebRTC-SFU] — mediasoup v3.19.x server / v3.18.x client, SFU architecture
- [Source: _bmad-output/planning-artifacts/architecture.md#TURN/STUN] — coturn self-hosted on EC2
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Communication-Patterns] — WS namespace:action format, voice:join/leave
- [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure] — server/src/plugins/voice/ directory, docker/coturn/
- [Source: _bmad-output/planning-artifacts/architecture.md#Voice/Video-Encryption] — DTLS/SRTP transport encryption for MVP, true E2E deferred
- [Source: _bmad-output/planning-artifacts/architecture.md#Docker-Compose] — app + coturn + nginx container layout
- [Source: _bmad-output/project-context.md#Technology-Stack] — mediasoup v3.19.x server / v3.18.x client versions, coturn
- [Source: _bmad-output/project-context.md#WebSocket-Message-Envelope] — { type, payload, id? } format
- [Source: _bmad-output/project-context.md#Connection-Resilience] — WebRTC: no auto-reconnect, user manually rejoins
- [Source: _bmad-output/project-context.md#Performance-Targets] — Voice latency <100ms, voice join <3s
- [Source: _bmad-output/implementation-artifacts/2-1-websocket-connection-and-real-time-transport.md] — wsServer, wsRouter, handler registration, client tracking patterns
- [Source: shared/src/ws-messages.ts] — WS_TYPES (VOICE_JOIN, VOICE_LEAVE, VOICE_STATE, VOICE_SIGNAL), VoiceJoinPayload, VoiceStatePayload
- [Source: shared/src/constants.ts] — MAX_PARTICIPANTS = 25
- [Source: server/src/ws/wsRouter.ts] — registerHandler(), routeMessage(), WsHandler type
- [Source: server/src/ws/wsServer.ts] — getClients(), client Map, disconnect handling
- [Source: server/src/plugins/presence/presenceService.ts] — Broadcasting pattern reference
- [Source: server/src/plugins/channels/channelService.ts] — Channel validation (type: 'text' | 'voice')
- [Source: mediasoup.org/documentation/v3] — mediasoup server API, Worker/Router/Transport/Producer/Consumer
- [Source: mediasoup v3.19.x CHANGELOG] — Node.js >= 22 requirement (since 3.19.3), listenInfos replaces listenIps
- [Source: coturn/coturn GitHub] — TURN REST API, use-auth-secret, time-limited credentials

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed mediasoup type import: `mediasoup/node/lib/types.js` → `mediasoup/types` (package exports map)
- Used `RouterRtpCodecCapability` instead of `RtpCodecCapability` (latter requires `preferredPayloadType`)
- Fixed `vi.mock` hoisting issue in mediasoupManager.test.ts using `vi.hoisted()`
- .env files are at project root, not `server/` — adapted env var additions accordingly
- Added `getChannelById()` to `channelService.ts` for voice channel validation

### Completion Notes List

- Task 1: mediasoup v3.19.17 installed. Node v24.1.0 compatible (>= 22). Env vars added to `.env` and `.env.example`.
- Task 2: `mediasoupManager.ts` created with Worker + Router lifecycle, `setLogger()` for Pino integration.
- Task 3: `createWebRtcTransport()` uses `listenInfos` (not deprecated `listenIps`) with `portRange` per-transport. TURN credentials via HMAC-SHA1.
- Task 4: `voiceService.ts` with in-memory `VoicePeer` state, full lifecycle (join/leave/cleanup), channel type validation deferred to handler.
- Task 5: `respond()`/`respondError()` added to server wsRouter. `request<T>()` added to client wsClient with timeout and pending request map.
- Task 6: `voiceWsHandler.ts` with all 7 voice handlers + channel type validation via `getChannelById()`.
- Task 7: 11 new voice WS_TYPES and 13 payload/response interfaces added to `shared/src/ws-messages.ts` and exported from `index.ts`.
- Task 8: `docker/coturn/turnserver.conf` and `docker-compose.dev.yml` created.
- Task 9: `app.ts` updated with mediasoup init, voice handler registration, graceful shutdown. `wsServer.ts` calls `handleVoiceDisconnect` on close.
- Task 10: 3 server test files created (mediasoupManager: 8 tests, voiceService: 19 tests, voiceWsHandler: 17 tests). wsRouter tests extended with respond/respondError tests (+3).
- Task 11: wsClient tests extended with 4 new `request()` tests (send+resolve, error reject, timeout, concurrent requests).
- Task 12: All server tests pass (180/180). Client wsClient tests pass (18/18); 34 pre-existing UI component test failures unrelated to story 3-1. Server lint clean. Shared builds clean.

### Change Log

- 2026-02-24: Implemented story 3-1 — mediasoup SFU + coturn TURN/STUN infrastructure, voice WS signaling, shared types, server + client request-response pattern, comprehensive tests.
- 2026-02-24: Code review fixes (9 issues) — Worker death cleanup callback, TURN_SECRET STUN-only fallback, MAX_PARTICIPANTS enforcement, voice:producer-closed broadcast, duplicate transport rejection, ws readyState guard, broadcast debug logging. Tests: 180 → 191.

### File List

**New files:**
- server/src/plugins/voice/mediasoupManager.ts
- server/src/plugins/voice/mediasoupManager.test.ts
- server/src/plugins/voice/voiceService.ts
- server/src/plugins/voice/voiceService.test.ts
- server/src/plugins/voice/voiceWsHandler.ts
- server/src/plugins/voice/voiceWsHandler.test.ts
- docker/coturn/turnserver.conf
- docker-compose.dev.yml

**Modified files:**
- server/src/app.ts
- server/src/ws/wsServer.ts
- server/src/ws/wsRouter.ts
- server/src/ws/wsRouter.test.ts
- server/src/plugins/channels/channelService.ts
- server/package.json
- shared/src/ws-messages.ts
- shared/src/index.ts
- client/src/renderer/src/services/wsClient.ts
- client/src/renderer/src/services/wsClient.test.ts
- package-lock.json
- .env
- .env.example
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/3-1-voice-server-infrastructure.md
