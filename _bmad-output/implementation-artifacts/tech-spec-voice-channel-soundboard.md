---
title: 'Voice Channel Soundboard'
slug: 'voice-channel-soundboard'
created: '2026-03-02'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript 5.x', 'Fastify v5.7.x', 'React 18+', 'Zustand v5.0.x', 'Drizzle ORM v0.45.x', 'mediasoup v3.19.x (server) / v3.18.x (client)', 'Terraform (AWS S3)', 'Vitest', 'React Testing Library', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner']
files_to_modify: ['infrastructure/main.tf', 'infrastructure/variables.tf', 'infrastructure/outputs.tf', 'server/src/db/schema.ts', 'server/drizzle/ (new migration)', 'server/src/plugins/voice/voiceService.ts', 'server/src/plugins/voice/voiceWsHandler.ts', 'shared/src/ws-messages.ts', 'shared/src/types.ts', 'shared/src/index.ts', 'client/src/renderer/src/services/mediaService.ts', 'client/src/renderer/src/services/voiceService.ts', 'client/src/renderer/src/services/wsClient.ts', 'client/src/renderer/src/services/soundboardApi.ts', 'server/src/app.ts', '.env.example']
code_patterns: ['Fastify plugin: default async function export taking FastifyInstance', 'Service functions take db: AppDatabase as first param', 'Custom error classes per domain (e.g., SoundNotFoundError)', 'Auth via getAuthenticatedUser(request) / requireOwner()', 'REST envelope: { data } / { error: { code, message } }', 'WS envelope: { type: "namespace:action", payload }', 'Drizzle: pgTable() with uuid PK, timestamp with timezone, .enableRLS()', 'Terraform: aws_s3_bucket + versioning + lifecycle as separate resources', 'Feature-based frontend: features/{domain}/ with Zustand stores']
test_patterns: ['Co-located tests: {SourceFile}.test.{ts,tsx}', 'Vitest as test runner', 'Fastify inject() for route testing', 'React Testing Library for component tests', 'PGlite for test database', 'Mock WebSocket in unit tests']
---

# Tech-Spec: Voice Channel Soundboard

**Created:** 2026-03-02

## Overview

### Problem Statement

Users in voice channels have no way to play shared audio clips to other participants, and no mechanism for uploading or managing a shared sound library.

### Solution

Add a global soundboard feature where users upload audio files to AWS S3, play them in voice channels via a separate mediasoup audio producer (independent from their voice mic), and allow per-user soundboard muting without affecting voice audio.

### Scope

**In Scope:**
- New S3 bucket provisioned via Terraform for soundboard audio storage
- Fastify API endpoints for upload (presigned URLs), metadata CRUD, and deletion
- New `sounds` database table for metadata (name, uploader, S3 path, duration, etc.)
- Separate mediasoup audio producer per user for soundboard playback
- Per-user soundboard mute (mute a user's soundboard but still hear their voice)
- Soundboard UI accessible from voice channels
- Upload validation: 20MB max size, 20s max duration, common formats (MP3, WAV, OGG, FLAC, AAC, WEBM)
- Users delete their own uploads; admins can delete any sound
- No cap on total sounds in the library

**Out of Scope:**
- Server-side rate limiting / cooldown on plays
- Per-server or per-channel sound libraries (global only)
- Sound categories, tags, or search functionality
- Supabase Storage (using AWS S3)

## Context for Development

### Codebase Patterns

**Voice System (Server):**
- `VoicePeer` interface has single `producer: Producer | null` and `videoProducer: Producer | null` fields — not a Map
- `handleProduce` in `voiceWsHandler.ts` explicitly rejects duplicate audio producers: `if (kind === 'audio' && peer.producer) { respondError(...) }`
- `findProducerOwner(producerId)` only checks `peer.producer?.id` and `peer.videoProducer?.id`
- On join, server broadcasts `VOICE_NEW_PRODUCER` for each existing peer's `producer` and `videoProducer`
- Consumers stored as `Map<string, Consumer>` on each peer, keyed by consumer ID
- Voice state is entirely in-memory (`voicePeers = new Map<string, VoicePeer>()`)

**Voice System (Client):**
- `mediaService.ts` uses module-level `let producer: types.Producer | null` — single global variable, overwritten on each `produceAudio()` call
- Consumer entries (`AudioConsumerEntry`) include `peerId`, `GainNode`, and `HTMLAudioElement` — supports per-peer volume control
- Send transport CAN produce multiple tracks — each `transport.produce()` fires the 'produce' event independently
- Mute toggles `producer.track.enabled`, Deafen mutes all consumer `audio.muted`
- `useVoiceStore` tracks `isMuted`, `isDeafened`, `remoteMuteState`, `peerVolumes`

**Fastify Plugin Pattern:**
- Routes: `default async function pluginRoutes(fastify: FastifyInstance)` — NOT wrapped with `fp()`
- Services: functions take `db: AppDatabase` as first param, return typed objects
- Custom error classes: `ChannelValidationError`, `ChannelNotFoundError`, etc.
- Auth: `getAuthenticatedUser(request)` returns `{ userId, role }`, `requireOwner()` for admin-only routes
- Schema validation inline with route definitions
- REST responses: `{ data }` for success, `{ error: { code, message } }` for errors

**Terraform/S3 Pattern:**
- Three separate resources per bucket: `aws_s3_bucket`, `aws_s3_bucket_versioning`, `aws_s3_bucket_lifecycle_configuration`
- IAM policies use `jsonencode()` with two-resource ARN pattern: bucket ARN + `${arn}/*`
- EC2 role gets read access, GitHub Actions deploy role gets write access
- Variables marked `sensitive = true` for bucket names

**Database Pattern (Drizzle):**
- `pgTable('table_name', { columns }, (table) => [indexes]).enableRLS()`
- IDs: `uuid('id').primaryKey().defaultRandom()`
- Timestamps: `timestamp('name', { withTimezone: true }).notNull().defaultNow()`
- Foreign keys: `.references(() => table.id, { onDelete: 'cascade' })`
- Indexes: `index('idx_table_column').on(table.column)`
- Type exports: `InferSelectModel<typeof table>` and `InferInsertModel<typeof table>`
- Migrations in `server/drizzle/` as raw SQL files

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `server/src/plugins/voice/voiceService.ts` | VoicePeer interface, peer/producer/consumer management — needs `soundboardProducer` field |
| `server/src/plugins/voice/voiceWsHandler.ts` | WS handlers for voice:produce, voice:consume, new-producer broadcast — needs soundboard producer support |
| `server/src/plugins/voice/mediasoupManager.ts` | Mediasoup Router config (Opus codec), WebRTC transport creation |
| `shared/src/ws-messages.ts` | WS_TYPES constants — needs new soundboard message types |
| `client/src/renderer/src/services/mediaService.ts` | Audio producer/consumer creation, mute/deafen, volume control — needs multi-producer support |
| `client/src/renderer/src/services/voiceService.ts` | Voice join flow, producer setup — needs soundboard producer creation |
| `client/src/renderer/src/services/wsClient.ts` | WS message handling, pending producers, handleNewProducer — needs soundboard-aware consumption |
| `client/src/renderer/src/stores/useVoiceStore.ts` | Voice state (mute, deafen, participants, volumes) — needs soundboard mute state |
| `server/src/db/schema.ts` | All table definitions — needs `sounds` table |
| `server/src/plugins/channels/channelRoutes.ts` | Reference for Fastify route pattern (schema, auth, error handling) |
| `server/src/plugins/channels/channelService.ts` | Reference for service pattern (db param, transactions, error classes) |
| `server/src/plugins/auth/authMiddleware.ts` | Auth middleware pattern, `getAuthenticatedUser()`, `requireOwner()` |
| `infrastructure/main.tf` | Existing S3 bucket + IAM policy pattern to replicate |
| `infrastructure/variables.tf` | Variable definition pattern |
| `server/src/app.ts` | Plugin registration order — new soundboard plugin registers here |
| `.env.example` | Environment variable documentation |
| `client/src/renderer/src/features/voice/VoiceStatusBar.tsx` | Voice control buttons UI — reference for soundboard button placement |
| `client/src/renderer/src/utils/soundPlayer.ts` | Existing oscillator-based sound effects — NOT related to soundboard feature |

### Technical Decisions

- **AWS S3 over Supabase Storage**: Project already has Terraform-managed S3 buckets and IAM roles; adding another bucket is consistent with existing infra
- **Separate mediasoup producer**: Soundboard audio must be independently mutable per-user, so it cannot share the voice mic producer. Add `soundboardProducer: Producer | null` to `VoicePeer` rather than refactoring to a generic Map — keeps the change minimal and explicit
- **Presigned URLs**: Audio files upload/download directly to/from S3, keeping the Fastify server as a metadata-only coordinator. Server generates presigned upload URLs (PUT) and presigned download URLs (GET)
- **Soundboard audio flow**: Client decodes audio file locally via Web Audio API `decodeAudioData()` → creates an `AudioContext` with `MediaStreamDestination` → plays the `AudioBuffer` through the destination → captures the output `MediaStream` → produces via mediasoup send transport as a second audio producer. Server broadcasts `VOICE_NEW_PRODUCER` with `kind: 'audio'` and a new `source: 'soundboard'` field so consumers can distinguish mic from soundboard
- **Per-user soundboard mute**: Client-side only. Consumer entries already track `peerId` — filter consumers by `peerId` + `source: 'soundboard'` to mute/unmute specific users' soundboard audio without affecting their voice consumers
- **Global sound library**: Single-server model makes per-server scoping unnecessary
- **No upload cap**: Users can upload unlimited sounds; 20MB/20s per-file limits provide natural constraint
- **No server-side rate limiting**: Per-user soundboard muting is sufficient spam control
- **New AWS SDK dependency**: Server needs `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` for generating presigned URLs. These are lightweight and standard

## Implementation Plan

### Tasks

#### Phase 1: Infrastructure & Data Layer

- [x] Task 1: Provision S3 bucket via Terraform
  - File: `infrastructure/main.tf`
  - Action: Add `aws_s3_bucket.soundboard`, `aws_s3_bucket_versioning.soundboard`, and `aws_s3_bucket_lifecycle_configuration.soundboard` resources. Follow the existing `assets` bucket pattern. Set lifecycle expiration to a long TTL (e.g., 365 days) or omit expiration since sounds are meant to persist. Add CORS configuration on the bucket to allow PUT uploads from the client origin
  - File: `infrastructure/variables.tf`
  - Action: Add `variable "soundboard_bucket_name"` with `sensitive = true` and a description
  - File: `infrastructure/outputs.tf`
  - Action: Add `output "soundboard_bucket_name"` referencing `aws_s3_bucket.soundboard.id`
  - Notes: The EC2 instance IAM policy (`aws_iam_role_policy.ec2_s3_assets`) must be updated to include the soundboard bucket ARNs for both read and write access (the server needs to generate presigned PUT and GET URLs). Also update `aws_iam_role_policy.deploy_s3` if CI/CD needs access

- [x] Task 2: Add `sounds` table to database schema
  - File: `server/src/db/schema.ts`
  - Action: Add a `sounds` table definition following existing patterns:
    ```typescript
    export const sounds = pgTable('sounds', {
      id: uuid('id').primaryKey().defaultRandom(),
      name: text('name').notNull(),
      s3_key: text('s3_key').notNull().unique(),
      file_size: integer('file_size').notNull(),
      duration_ms: integer('duration_ms').notNull(),
      mime_type: text('mime_type').notNull(),
      uploaded_by: uuid('uploaded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    }, (table) => [
      index('idx_sounds_uploaded_by').on(table.uploaded_by),
    ]).enableRLS();
    ```
    Add type exports: `export type Sound = InferSelectModel<typeof sounds>;` and `export type NewSound = InferInsertModel<typeof sounds>;`
  - Notes: `s3_key` stores the object key within the bucket (e.g., `sounds/{uuid}.mp3`). `duration_ms` is validated client-side before upload and stored for UI display. `uploaded_by` cascades on user delete so orphaned sounds are cleaned up

- [x] Task 3: Generate database migration
  - File: `server/drizzle/` (new SQL migration file)
  - Action: Run `npx drizzle-kit generate` to create the migration SQL from the schema change. Verify the generated SQL includes: CREATE TABLE with all columns, foreign key constraint, index creation, ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY, and REVOKE statements matching the pattern in `0000_classy_lenny_balinger.sql`
  - Notes: If drizzle-kit doesn't generate the RLS/REVOKE statements, add them manually to the migration file

- [x] Task 4: Add shared types and WS message constants
  - File: `shared/src/ws-messages.ts`
  - Action: Add new WebSocket message type constants:
    ```typescript
    // Soundboard
    SOUNDBOARD_PLAY: 'soundboard:play',
    SOUNDBOARD_STOP: 'soundboard:stop',
    ```
  - File: `shared/src/types.ts`
  - Action: Add the `Sound` API response type (camelCase for API layer):
    ```typescript
    export interface SoundResponse {
      id: string;
      name: string;
      s3Key: string;
      fileSize: number;
      durationMs: number;
      mimeType: string;
      uploadedBy: string;
      uploadedByUsername: string;
      createdAt: string;
    }
    ```
    Add `AudioProducerSource` type:
    ```typescript
    export type AudioProducerSource = 'microphone' | 'soundboard';
    ```
  - Notes: `SOUNDBOARD_PLAY` is broadcast via WS to notify other clients in the voice channel that a user is playing a sound (for UI indicator purposes). The actual audio flows through mediasoup, not WS

#### Phase 2: Server — S3 Service & Soundboard Plugin

- [x] Task 5: Install AWS SDK dependencies
  - File: `server/package.json`
  - Action: Run `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` in the `server/` directory
  - Notes: These packages use the AWS credential chain automatically — on EC2, they pick up IAM instance role credentials without any access keys

- [x] Task 6: Create S3 service for presigned URL generation
  - File: `server/src/services/s3Service.ts` (new file)
  - Action: Create a service that initializes an S3Client and exposes functions:
    - `getUploadUrl(s3Key: string, contentType: string, maxSizeBytes: number): Promise<string>` — generates a presigned PUT URL with content-type and content-length constraints, 15-minute expiry
    - `getDownloadUrl(s3Key: string): Promise<string>` — generates a presigned GET URL, 1-hour expiry
    - `deleteObject(s3Key: string): Promise<void>` — deletes an object from the bucket
  - Notes: Read `SOUNDBOARD_BUCKET_NAME` and `SOUNDBOARD_BUCKET_REGION` (or `AWS_REGION`) from environment. Use `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand` from `@aws-sdk/client-s3` and `getSignedUrl` from `@aws-sdk/s3-request-presigner`

- [x] Task 7: Create soundboard service (business logic)
  - File: `server/src/plugins/soundboard/soundboardService.ts` (new file)
  - Action: Create service functions following existing patterns (e.g., `channelService.ts`):
    - `getAllSounds(db: AppDatabase): Promise<SoundRow[]>` — select all sounds joined with users table to get `uploadedByUsername`
    - `getSoundById(db: AppDatabase, soundId: string): Promise<SoundRow | null>` — single sound lookup
    - `createSoundMetadata(db: AppDatabase, data: NewSoundInput): Promise<SoundRow>` — insert sound metadata after successful upload
    - `deleteSoundMetadata(db: AppDatabase, soundId: string): Promise<void>` — delete sound row
    - `requestUploadUrl(db: AppDatabase, userId: string, fileName: string, contentType: string, fileSize: number, durationMs: number): Promise<{ uploadUrl: string; s3Key: string; soundId: string }>` — validates inputs (mime type in allowed list, fileSize <= 20MB, durationMs <= 20000), generates UUID-based s3Key (`sounds/{uuid}.{ext}`), generates presigned upload URL, inserts metadata row, returns all three
    - `getDownloadUrl(s3Key: string): Promise<string>` — delegates to s3Service
  - Action: Add custom error classes: `SoundNotFoundError`, `SoundValidationError`, `SoundPermissionError`
  - Action: Add constant `ALLOWED_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/webm']` and `MAX_FILE_SIZE = 20 * 1024 * 1024` (20MB) and `MAX_DURATION_MS = 20_000` (20s)
  - Notes: The `requestUploadUrl` function creates the metadata row optimistically. If the client never completes the upload, the row will reference a non-existent S3 object. This is acceptable — the download URL will simply 404. A future cleanup job could prune orphaned rows, but that's out of scope

- [x] Task 8: Create soundboard routes (REST API)
  - File: `server/src/plugins/soundboard/soundboardRoutes.ts` (new file)
  - Action: Create Fastify route plugin following `channelRoutes.ts` pattern:
    - `GET /` — List all sounds. Response: `{ data: SoundResponse[], count: number }`. Auth required
    - `POST /upload-url` — Request a presigned upload URL. Body: `{ fileName: string, contentType: string, fileSize: number, durationMs: number }`. Response: `{ data: { uploadUrl: string, s3Key: string, soundId: string } }`. Validates mime type, file size, duration. Auth required
    - `POST /:soundId/confirm` — Confirm upload completed (optional — only if we want to track upload completion). Could be deferred
    - `GET /:soundId/download-url` — Get presigned download URL for a sound. Response: `{ data: { downloadUrl: string } }`. Auth required
    - `DELETE /:soundId` — Delete a sound. Auth required. Only the uploader OR an admin (role === 'owner') can delete. Deletes both the S3 object and the DB row. Response: 204 No Content
  - Action: Include JSON schema definitions for request validation (body, params) and response shapes
  - Notes: All routes require authentication (not in PUBLIC_ROUTES). Admin delete check uses `request.user.role === 'owner' || sound.uploaded_by === request.user.userId`

- [x] Task 9: Register soundboard plugin and update environment config
  - File: `server/src/app.ts`
  - Action: Import and register the soundboard routes plugin: `await app.register(soundboardRoutes, { prefix: '/api/soundboard' });`. Place after `adminRoutes` registration and before `wsServer`
  - File: `.env.example`
  - Action: Add new environment variables with comments:
    ```
    # Soundboard S3 Storage
    SOUNDBOARD_BUCKET_NAME=your-soundboard-bucket
    SOUNDBOARD_BUCKET_REGION=us-east-1
    ```

#### Phase 3: Server — Voice System Changes for Multi-Producer

- [x] Task 10: Extend VoicePeer to support soundboard producer
  - File: `server/src/plugins/voice/voiceService.ts`
  - Action: Add `soundboardProducer: Producer | null` to the `VoicePeer` interface. Initialize it to `null` in `joinVoiceChannel`. Add `setPeerSoundboardProducer(userId: string, producer: Producer): void` function following the pattern of `setPeerProducer`. Update `findProducerOwner(producerId)` to also check `peer.soundboardProducer?.id`. Update cleanup in `leaveVoiceChannel` to close `peer.soundboardProducer` if it exists
  - Notes: Keep `producer` field as-is for mic — don't rename it. This minimizes diff

- [x] Task 11: Update voice WebSocket handlers for soundboard producer
  - File: `server/src/plugins/voice/voiceWsHandler.ts`
  - Action: Modify `handleProduce`:
    - Accept an optional `source` field in the payload: `const { transportId, kind, rtpParameters, source } = message.payload;`
    - Default `source` to `'microphone'` if not provided (backward compat)
    - When `kind === 'audio'` and `source === 'soundboard'`: reject if `peer.soundboardProducer` already exists, otherwise store via `setPeerSoundboardProducer`
    - When `kind === 'audio'` and `source === 'microphone'` (or undefined): keep existing behavior (reject if `peer.producer` exists, store via `setPeerProducer`)
    - Include `source` in the `VOICE_NEW_PRODUCER` broadcast payload: `{ producerId, peerId, kind, source }`
  - Action: Modify the join flow (where existing producers are sent to new peer):
    - When iterating existing peers, also check `existingPeer.soundboardProducer` and send a `VOICE_NEW_PRODUCER` with `source: 'soundboard'` for it
  - Action: Modify producer close handling to work with soundboard producers
  - Notes: The `source` field is the key discriminator. Consumers don't need to change server-side — they just consume a producerId regardless of source. The `source` is purely metadata passed through to clients via `VOICE_NEW_PRODUCER`

- [x] Task 12: Add soundboard WS handlers for play notifications
  - File: `server/src/plugins/voice/voiceWsHandler.ts`
  - Action: Register handlers for `SOUNDBOARD_PLAY` and `SOUNDBOARD_STOP`:
    - `handleSoundboardPlay`: Receives `{ soundId, soundName }` from client. Broadcasts `soundboard:play` to all peers in the channel with payload `{ userId, soundId, soundName }`. This is a notification only — actual audio goes through mediasoup
    - `handleSoundboardStop`: Receives `{}`. Broadcasts `soundboard:stop` to all peers with payload `{ userId }`. Used when a sound finishes playing
  - Notes: These handlers are lightweight notifications for UI purposes (e.g., showing a "User1 is playing: airhorn.mp3" indicator). The audio stream itself flows through the soundboard mediasoup producer

#### Phase 4: Client — Media & Voice Service Changes

- [x] Task 13: Add soundboard producer support to mediaService
  - File: `client/src/renderer/src/services/mediaService.ts`
  - Action: Add module-level variables for the soundboard producer:
    ```typescript
    let soundboardProducer: types.Producer | null = null;
    let soundboardAudioContext: AudioContext | null = null;
    let soundboardSource: AudioBufferSourceNode | null = null;
    let soundboardDestination: MediaStreamAudioDestinationNode | null = null;
    ```
  - Action: Add `produceSoundboardAudio(transport: types.Transport): Promise<types.Producer>` function:
    - Creates an `AudioContext` for soundboard
    - Creates a `MediaStreamAudioDestinationNode` — this produces a `MediaStream` from Web Audio API output
    - Creates a silent `AudioBuffer` and plays it briefly to initialize the stream (required for mediasoup to get a valid track)
    - Calls `transport.produce({ track: soundboardDestination.stream.getAudioTracks()[0] })` to create the mediasoup producer
    - Stores the producer in `soundboardProducer`
    - Returns the producer
  - Action: Add `playSoundboardAudio(audioBuffer: AudioBuffer): void` function:
    - Stops any currently playing source (`soundboardSource?.stop()`)
    - Creates a new `AudioBufferSourceNode` from the `soundboardAudioContext`
    - Connects source → `soundboardDestination`
    - Calls `source.start()` and sets up `source.onended` callback
    - Stores source in `soundboardSource`
  - Action: Add `stopSoundboardAudio(): void` function:
    - Calls `soundboardSource?.stop()` and sets `soundboardSource = null`
  - Action: Add `muteSoundboardConsumer(peerId: string, muted: boolean): void` function:
    - Iterates `consumers` Map, finds entries where `entry.peerId === peerId && entry.source === 'soundboard'`
    - Sets `entry.audio.muted = muted`
  - Action: Extend `AudioConsumerEntry` interface with `source: AudioProducerSource` field (import from shared types)
  - Action: Update `consumeAudio` to accept and store a `source` parameter
  - Action: Update `deafenAudio`/`undeafenAudio` to also mute/unmute soundboard consumers
  - Action: Update `cleanup()` to close `soundboardProducer`, stop `soundboardSource`, close `soundboardAudioContext`
  - Notes: The key insight is that `MediaStreamAudioDestinationNode` bridges Web Audio API → MediaStream → mediasoup producer. The soundboard producer stays active for the duration of the voice session; individual sounds are played by creating new `AudioBufferSourceNode` instances and connecting them to the persistent destination node

- [x] Task 14: Update voice service join flow for soundboard producer
  - File: `client/src/renderer/src/services/voiceService.ts`
  - Action: After the mic producer is created (step 8 in current flow), add soundboard producer creation:
    - Call `mediaService.produceSoundboardAudio(sendTransport)` to create the soundboard producer
    - The soundboard producer is created with `source: 'soundboard'` in the produce payload so the server routes it correctly
  - Action: Update the `transport.produce()` event handler (in `mediaService.createSendTransport`) to include a `source` appData field. When the 'produce' event fires, pass `source` from `appData` to the server's `voice:produce` message payload
  - Notes: The send transport's 'produce' event already fires for each `transport.produce()` call. We need the `source` to flow from `produce({ appData: { source: 'soundboard' } })` → 'produce' event → WS `voice:produce` payload → server `handleProduce`

- [x] Task 15: Update wsClient for soundboard-aware consumer creation
  - File: `client/src/renderer/src/services/wsClient.ts`
  - Action: Update `handleNewProducer` to pass the `source` field from the `VOICE_NEW_PRODUCER` payload through to `mediaService.consumeAudio()`:
    - Extract `source` from payload (default to `'microphone'` if not present for backward compat)
    - Pass `source` as parameter to `consumeAudio`
  - Action: Register handlers for `SOUNDBOARD_PLAY` and `SOUNDBOARD_STOP` messages:
    - On `soundboard:play`: dispatch to store (e.g., `useSoundboardStore.getState().setSoundPlaying(userId, soundName)`)
    - On `soundboard:stop`: dispatch to store (e.g., `useSoundboardStore.getState().setSoundStopped(userId)`)
  - Notes: The `source` field enables the client to tag consumers so per-user soundboard muting works correctly

#### Phase 5: Client — Soundboard Store & API

- [x] Task 16: Create soundboard API client
  - File: `client/src/renderer/src/services/soundboardApi.ts` (new file)
  - Action: Create API functions using the existing `apiClient` pattern:
    - `fetchSounds(): Promise<SoundResponse[]>` — `GET /api/soundboard`
    - `requestUploadUrl(data: { fileName, contentType, fileSize, durationMs }): Promise<{ uploadUrl, s3Key, soundId }>` — `POST /api/soundboard/upload-url`
    - `uploadToS3(uploadUrl: string, file: File): Promise<void>` — direct PUT to presigned URL with `Content-Type` header
    - `getDownloadUrl(soundId: string): Promise<string>` — `GET /api/soundboard/:soundId/download-url`
    - `deleteSound(soundId: string): Promise<void>` — `DELETE /api/soundboard/:soundId`
  - Notes: `uploadToS3` uses `fetch()` directly (not `apiClient`) since it's a direct S3 call, not going through Fastify

- [x] Task 17: Create soundboard Zustand store
  - File: `client/src/renderer/src/stores/useSoundboardStore.ts` (new file)
  - Action: Create Zustand store following `useVoiceStore` patterns:
    ```typescript
    interface SoundboardState {
      // Library state
      sounds: SoundResponse[];
      isLoading: boolean;
      error: string | null;

      // Playback state
      isPlaying: boolean;
      currentSoundId: string | null;

      // Per-user soundboard mute (persisted to localStorage)
      mutedSoundboardUsers: Set<string>;

      // UI indicators (who is playing what)
      activePlayers: Map<string, string>; // userId → soundName

      // Actions
      loadSounds: () => Promise<void>;
      uploadSound: (file: File, name: string, durationMs: number) => Promise<void>;
      deleteSound: (soundId: string) => Promise<void>;
      playSound: (soundId: string) => Promise<void>;
      stopSound: () => void;
      toggleUserSoundboardMute: (userId: string) => void;
      isUserSoundboardMuted: (userId: string) => boolean;
      setSoundPlaying: (userId: string, soundName: string) => void;
      setSoundStopped: (userId: string) => void;
    }
    ```
  - Action: Implement `playSound`:
    1. Call `getDownloadUrl(soundId)` to get presigned URL
    2. Fetch the audio file from the presigned URL
    3. Decode with `AudioContext.decodeAudioData()`
    4. Validate duration client-side (reject if > 20s)
    5. Call `mediaService.playSoundboardAudio(audioBuffer)`
    6. Send `SOUNDBOARD_PLAY` WS message with `{ soundId, soundName }`
    7. On audio end, send `SOUNDBOARD_STOP` WS message
  - Action: Implement `toggleUserSoundboardMute`:
    1. Toggle userId in `mutedSoundboardUsers` Set
    2. Call `mediaService.muteSoundboardConsumer(userId, muted)`
    3. Persist to localStorage
  - Action: Implement `uploadSound`:
    1. Call `requestUploadUrl({ fileName, contentType, fileSize, durationMs })`
    2. Call `uploadToS3(uploadUrl, file)`
    3. Reload sound list
  - Notes: Audio buffer caching could be a future optimization (cache decoded AudioBuffers by soundId) but is out of scope. Per-user mute state persists via localStorage so it survives page reloads

- [x] Task 18: Add soundboard mute state to voice store
  - File: `client/src/renderer/src/stores/useVoiceStore.ts`
  - Action: No new state fields needed — soundboard mute is managed in `useSoundboardStore`. However, update `leaveChannel` to call soundboard cleanup:
    - Stop any playing sound
    - The soundboard producer is cleaned up via `mediaService.cleanup()` which already runs on leave
  - Notes: Keep voice store and soundboard store independent (no cross-store imports per project conventions). Use the cleanup path through mediaService which both stores interact with independently

#### Phase 6: Client — Soundboard UI

- [x] Task 19: Create SoundboardPanel component
  - File: `client/src/renderer/src/features/soundboard/SoundboardPanel.tsx` (new file)
  - Action: Create the main soundboard UI panel:
    - **Sound grid/list**: Display all sounds from `useSoundboardStore.sounds` as clickable tiles/buttons showing sound name, duration, and uploader
    - **Play button per sound**: Clicking a sound tile calls `playSound(soundId)`. Show a visual indicator (pulsing border, progress bar) while playing
    - **Stop button**: Shown while a sound is playing, calls `stopSound()`
    - **Upload button**: Opens file picker, validates file type and size client-side, reads audio duration via Web Audio API `decodeAudioData`, then calls `uploadSound(file, name, durationMs)`
    - **Delete button**: Shown on sounds uploaded by the current user (or all sounds for admins). Calls `deleteSound(soundId)` with confirmation
    - **Loading/error states**: Show skeleton loader while `isLoading`, error message if `error`
  - Action: Style using Tailwind CSS matching the existing warm earthy theme. Use Radix UI primitives for interactive elements (buttons, dialogs)
  - Notes: The panel should be toggleable from the voice channel area. When not in a voice channel, the upload/manage functionality could still be accessible but play buttons should be disabled

- [x] Task 20: Integrate soundboard mute controls into VoiceParticipant
  - File: `client/src/renderer/src/features/voice/VoiceParticipant.tsx` (modified)
  - Action: Per-user soundboard mute controls integrated directly into VoiceParticipant component rather than a separate file:
    - For each non-local participant, show a soundboard mute/unmute toggle icon
    - Icon: Volume2/VolumeOff from lucide-react, shown on hover (always visible when muted)
    - Calls `useSoundboardStore.toggleUserSoundboardMute(userId)`
    - Visual state reflects `useSoundboardStore.isUserSoundboardMuted(userId)`
  - Notes: Inlining into VoiceParticipant avoids creating a trivial single-button wrapper component

- [x] Task 21: Create SoundboardUploadDialog component
  - File: `client/src/renderer/src/features/soundboard/SoundboardUploadDialog.tsx` (new file)
  - Action: Create an upload dialog using Radix UI Dialog:
    - File input accepting audio formats (`.mp3,.wav,.ogg,.flac,.aac,.webm`)
    - Name input (pre-filled from file name, editable)
    - Client-side validation: check file size <= 20MB, decode audio to check duration <= 20s
    - Upload progress indicator
    - Error display for validation failures
    - Success state with auto-close
  - Notes: Duration validation requires decoding the full audio file client-side with `AudioContext.decodeAudioData()` before uploading. This is a one-time decode — the decoded buffer is not reused

- [x] Task 22: Add soundboard toggle to voice UI
  - File: `client/src/renderer/src/features/voice/VoiceStatusBar.tsx`
  - Action: Add a soundboard toggle button to the control button row (between video and disconnect):
    - Icon: music note or soundboard icon (e.g., `Music` from lucide-react)
    - Click toggles visibility of the SoundboardPanel
    - Only visible when connected to a voice channel
  - Notes: The SoundboardPanel itself renders as a popover/panel above the status bar, or as a sidebar panel — follow the existing UI layout patterns

- [x] Task 23: Integrate soundboard mute into VoiceParticipant
  - File: `client/src/renderer/src/features/voice/VoiceParticipant.tsx`
  - Action: Add a small soundboard mute icon/button next to each participant. When clicked, toggles `useSoundboardStore.toggleUserSoundboardMute(userId)`. Show muted state visually (e.g., small speaker-off icon)
  - Action: Show "playing sound" indicator when `useSoundboardStore.activePlayers.has(userId)` — e.g., a small animated speaker icon or the sound name as a tooltip
  - Notes: Keep this subtle — a small icon is sufficient. Don't clutter the participant display

### Acceptance Criteria

#### Sound Library Management
- [x] AC 1: Given an authenticated user, when they request `GET /api/soundboard`, then they receive a list of all sounds with metadata (id, name, duration, uploader username, created date) in `{ data: [...], count: N }` format
- [x] AC 2: Given an authenticated user, when they request `POST /api/soundboard/upload-url` with valid fileName, contentType (audio/mpeg), fileSize (5MB), and durationMs (10000), then they receive a presigned S3 upload URL, s3Key, and soundId
- [x] AC 3: Given an authenticated user, when they request `POST /api/soundboard/upload-url` with an invalid contentType (e.g., `image/png`), then they receive a 400 error with code `VALIDATION_ERROR`
- [x] AC 4: Given an authenticated user, when they request `POST /api/soundboard/upload-url` with fileSize exceeding 20MB, then they receive a 400 error with code `VALIDATION_ERROR`
- [x] AC 5: Given an authenticated user, when they request `POST /api/soundboard/upload-url` with durationMs exceeding 20000, then they receive a 400 error with code `VALIDATION_ERROR`
- [x] AC 6: Given a valid presigned upload URL, when the client PUTs an audio file directly to S3, then the file is stored successfully and accessible via presigned download URL
- [x] AC 7: Given an authenticated user who uploaded a sound, when they request `DELETE /api/soundboard/:soundId`, then the sound metadata is deleted from the database AND the S3 object is deleted
- [x] AC 8: Given an authenticated user who did NOT upload a sound and is NOT an admin, when they request `DELETE /api/soundboard/:soundId`, then they receive a 403 error with code `FORBIDDEN`
- [x] AC 9: Given an authenticated admin (role === 'owner'), when they request `DELETE /api/soundboard/:soundId` for any sound, then the sound is deleted successfully regardless of who uploaded it

#### Soundboard Playback in Voice Channel
- [x] AC 10: Given User1 is in a voice channel, when User1 plays a sound from the soundboard, then all other users in the voice channel hear the sound through their speakers
- [x] AC 11: Given User1 is in a voice channel and plays a sound, when User1 is also speaking into their microphone simultaneously, then other users hear both the voice and the soundboard sound as separate audio streams
- [x] AC 12: Given User1 is playing a sound, when the sound finishes, then the soundboard producer remains active (silent) and ready for the next sound — no transport renegotiation needed
- [x] AC 13: Given User1 is in a voice channel, when User1 joins the channel, then a soundboard mediasoup producer is created alongside their mic producer, and both are broadcast to existing peers via `VOICE_NEW_PRODUCER` with distinct `source` fields

#### Per-User Soundboard Mute
- [x] AC 14: Given User2 has muted User3's soundboard, when User3 plays a sound, then User2 does NOT hear the sound but User1 (who has not muted User3) DOES hear the sound
- [x] AC 15: Given User2 has muted User3's soundboard, when User3 speaks into their microphone, then User2 STILL hears User3's voice — only the soundboard audio is muted
- [x] AC 16: Given User2 has muted User3's soundboard, when User2 leaves and rejoins the voice channel, then User3's soundboard remains muted (persisted via localStorage)
- [x] AC 17: Given User2 has muted User3's soundboard, when User2 unmutes User3's soundboard, then User2 hears User3's future soundboard plays

#### Edge Cases
- [x] AC 18: Given a user is NOT in a voice channel, when they view the soundboard panel, then play buttons are disabled but they can still browse, upload, and delete sounds
- [x] AC 19: Given a user is playing a sound and clicks play on another sound, then the first sound stops and the second sound starts playing
- [x] AC 20: Given a user is in a voice channel and is deafened, when another user plays a sound, then the deafened user does NOT hear the sound (deafen mutes all consumers including soundboard)
- [x] AC 21: Given a user uploads a file that is not a valid audio format, when the upload is attempted, then the client rejects it before making any API call, with a user-friendly error message
- [x] AC 22: Given a user is in a voice channel and disconnects unexpectedly, then the soundboard producer is cleaned up server-side along with the mic producer (existing cleanup path in `leaveVoiceChannel`/`cleanupPeer`)

## Additional Context

### Dependencies

**New NPM packages (server):**
- `@aws-sdk/client-s3` — S3 client for bucket operations (PutObject, GetObject, DeleteObject)
- `@aws-sdk/s3-request-presigner` — Presigned URL generation (`getSignedUrl`)

**New environment variables:**
- `SOUNDBOARD_BUCKET_NAME` — S3 bucket name for soundboard audio (required in production)
- `SOUNDBOARD_BUCKET_REGION` — S3 bucket region (defaults to `us-east-1`)

**Infrastructure provisioning (Terraform):**
- New S3 bucket must be created via `terraform apply` before the feature is usable
- IAM policies must grant the EC2 instance read/write access to the soundboard bucket
- The Fastify server generates presigned URLs using IAM instance credentials (no access keys needed)
- S3 bucket CORS configuration must allow PUT requests from the client origin

**Database migration:**
- New `sounds` table must be created via migration before the feature is usable
- Migration must include RLS statements matching existing pattern

### Testing Strategy

**Unit Tests:**
- `server/src/services/s3Service.test.ts` — Mock `@aws-sdk/client-s3` and test presigned URL generation, delete operations. Verify correct bucket name, key, and expiry are passed
- `server/src/plugins/soundboard/soundboardService.test.ts` — Test CRUD operations using PGlite test database. Test validation logic (mime type rejection, file size limits, duration limits). Test permission checks (user can only delete own sounds, admin can delete any)
- `client/src/renderer/src/stores/useSoundboardStore.test.ts` — Test store actions, mute state persistence, loading states
- `client/src/renderer/src/services/mediaService.test.ts` — Test soundboard producer creation and cleanup (mock mediasoup Device/Transport)

**Integration Tests:**
- `server/src/plugins/soundboard/soundboardRoutes.test.ts` — Test all REST endpoints via Fastify `inject()`:
  - GET /api/soundboard returns sound list
  - POST /api/soundboard/upload-url with valid/invalid inputs
  - DELETE /api/soundboard/:soundId with owner, non-owner, and admin users
  - Auth required on all routes (401 without token)
  - Proper error envelope format on all error responses

**Component Tests:**
- `client/src/renderer/src/features/soundboard/SoundboardPanel.test.tsx` — Test rendering sound list, play/stop interactions, upload flow
- `client/src/renderer/src/features/soundboard/SoundboardUploadDialog.test.tsx` — Test file validation, error display
- `client/src/renderer/src/features/soundboard/SoundboardMuteControls.test.tsx` — Test mute toggle per user

**Manual Testing:**
- End-to-end: Upload a sound → play it in a voice channel with 2+ users → verify all users hear it
- Mute scenario: 3 users in channel → User2 mutes User3's soundboard → User3 plays sound → verify User1 hears it, User2 does not, User2 still hears User3's voice
- Edge cases: Play while deafened, rapid play/stop, upload large file (near 20MB limit), upload file with > 20s duration (should reject)

### Notes

**Key refactoring required in existing code:**
1. **`VoicePeer` interface** (`voiceService.ts`) — Add `soundboardProducer: Producer | null` field
2. **`handleProduce`** (`voiceWsHandler.ts`) — Accept `source` field, route to correct producer slot
3. **`VOICE_NEW_PRODUCER` broadcast** — Add `source` to payload for consumer discrimination
4. **`findProducerOwner`** (`voiceService.ts`) — Also check `peer.soundboardProducer?.id`
5. **`mediaService.ts`** — Add `soundboardProducer`, `produceSoundboardAudio()`, `playSoundboardAudio()`, `muteSoundboardConsumer()`
6. **`AudioConsumerEntry`** (`mediaService.ts`) — Add `source` field
7. **`consumeAudio`** (`mediaService.ts`) — Accept and store `source` parameter
8. **`wsClient.ts` `handleNewProducer`** — Pass `source` through to consumer creation
9. **Send transport 'produce' event** (`mediaService.ts`) — Pass `source` from `appData` to WS `voice:produce` payload
10. **Cleanup paths** — Ensure soundboard producer closed on voice leave and disconnect

**High-risk items:**
- **Web Audio API → MediaStream → mediasoup pipeline**: This is the core technical challenge. The `MediaStreamAudioDestinationNode` approach is well-documented but may have browser-specific quirks in Electron's Chromium. Test early
- **Presigned URL CORS**: S3 bucket must have CORS configured to accept PUT requests from the Electron app's origin. Since Electron uses a custom protocol (`discord-clone://`), the CORS config may need `*` origin or a specific pattern. Test with actual Electron client
- **Audio format decoding**: `decodeAudioData` support varies by format. MP3 and WAV are universally supported in Chromium. OGG and FLAC should work but test. AAC may have licensing considerations in some builds

**Future considerations (out of scope):**
- Sound favorites / recently played
- Sound categories and search/filter
- Audio buffer caching (avoid re-downloading frequently played sounds)
- Server-side audio transcoding (normalize all uploads to Opus)
- Upload progress tracking via S3 multipart upload
- Orphaned S3 object cleanup (sounds where upload never completed)
