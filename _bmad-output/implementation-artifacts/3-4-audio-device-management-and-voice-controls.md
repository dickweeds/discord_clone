# Story 3.4: Audio Device Management & Voice Controls

Status: done

## Story

As a user,
I want to select my audio devices and control my microphone and speaker during voice calls,
So that I can use the right hardware and manage my audio without leaving the call.

## Acceptance Criteria

1. **Given** I am in app settings or voice settings **When** I open audio device selection **Then** I see a list of available audio output devices (speakers/headphones) **And** a list of available microphone input devices

2. **Given** I select a different audio output device **When** the selection is applied **Then** audio plays through the newly selected device **And** I am NOT disconnected from voice

3. **Given** I select a different microphone input device **When** the selection is applied **Then** my voice is captured from the newly selected device **And** I am NOT disconnected from voice

4. **Given** I am in a voice channel **When** I click the mute button in the voice status bar **Then** my microphone is muted — I stop transmitting audio **And** the mute button shows a crossed-out mic icon **And** a mute sound cue plays

5. **Given** I am muted **When** I click the mute button again **Then** my microphone is unmuted — I resume transmitting audio (ALREADY DONE in 3-3)

6. **Given** I am in a voice channel **When** I click the deafen button **Then** all incoming audio is silenced AND my microphone is muted **And** the deafen button shows a crossed-out headphone icon (ALREADY DONE in 3-3)

7. **Given** I am in a voice channel **When** I press Ctrl/Cmd+Shift+M **Then** mute is toggled (ALREADY DONE in AppLayout.tsx)

8. **Given** I am in a voice channel **When** I press Ctrl/Cmd+Shift+D **Then** deafen is toggled (ALREADY DONE in AppLayout.tsx)

9. **Given** I am in a voice channel **When** I press Ctrl/Cmd+Shift+E **Then** I disconnect from voice (ALREADY DONE in AppLayout.tsx)

10. **Given** I am muted in a voice channel **When** other users look at my participant entry **Then** a small mute icon overlay appears on my avatar

## New Work Required (ACs 5-9 are already satisfied)

- **AC 1, 2, 3:** Audio device enumeration, selection UI, hot-swap without disconnect
- **AC 4:** Add mute sound cue (mute works, but sound cue is missing)
- **AC 10:** Broadcast mute/deafen state to other users via WebSocket (currently only local user sees mute icon)

## Tasks / Subtasks

- [x] Task 1: Add `useMediaDevices` hook for device enumeration (AC: 1)
  - [x] 1.1 Create `client/src/renderer/src/hooks/useMediaDevices.ts`
  - [x] 1.2 Call `navigator.mediaDevices.enumerateDevices()` to list `audioinput` and `audiooutput` devices
  - [x] 1.3 Listen for `devicechange` event to auto-update device list when devices are plugged/unplugged
  - [x] 1.4 Return `{ audioInputs: MediaDeviceInfo[], audioOutputs: MediaDeviceInfo[], isLoading: boolean }`
  - [x] 1.5 Handle permission: if `enumerateDevices()` returns empty labels, the user hasn't granted mic permission yet — return devices with fallback labels ("Microphone 1", "Speaker 1")
  - [x] 1.6 Cleanup: remove `devicechange` event listener on unmount

- [x] Task 2: Add device selection state to `useVoiceStore` (AC: 1, 2, 3)
  - [x] 2.1 Add `selectedAudioInputId: string | null` to VoiceState (null = system default)
  - [x] 2.2 Add `selectedAudioOutputId: string | null` to VoiceState (null = system default)
  - [x] 2.3 Add `setAudioInputDevice(deviceId: string | null): void` action
  - [x] 2.4 Add `setAudioOutputDevice(deviceId: string | null): void` action
  - [x] 2.5 `setAudioInputDevice`: calls `mediaService.switchAudioInput(deviceId)` if currently in voice channel
  - [x] 2.6 `setAudioOutputDevice`: calls `mediaService.switchAudioOutput(deviceId)` if currently in voice channel
  - [x] 2.7 Persist selections to `localStorage` under keys `voiceInputDeviceId` and `voiceOutputDeviceId`
  - [x] 2.8 Load persisted selections on store initialization

- [x] Task 3: Implement hot-swap input device in `mediaService.ts` (AC: 3)
  - [x] 3.1 Add `switchAudioInput(deviceId: string | null): Promise<void>` export
  - [x] 3.2 Implementation: call `navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined } })` to get new stream
  - [x] 3.3 Get new audio track from the new stream
  - [x] 3.4 Call `producer.replaceTrack({ track: newTrack })` to hot-swap the track on the mediasoup producer (no disconnect, no renegotiation)
  - [x] 3.5 Stop the old `localStream` tracks (`oldTrack.stop()`)
  - [x] 3.6 Update the module-level `localStream` reference to the new stream
  - [x] 3.7 Restart local VAD with the new stream: `vadService.stopLocalVAD()` then `vadService.startLocalVAD(newStream, callback)`
  - [x] 3.8 If muted, set `newTrack.enabled = false` immediately after replaceTrack
  - [x] 3.9 Handle errors: if `getUserMedia` fails (device unplugged, permission denied), log warning and keep old stream active
  - [x] 3.10 Update `produceAudio()` to accept optional `deviceId` parameter and pass it to `getUserMedia` constraints

- [x] Task 4: Implement hot-swap output device in `mediaService.ts` (AC: 2)
  - [x] 4.1 Add `switchAudioOutput(deviceId: string | null): Promise<void>` export
  - [x] 4.2 Implementation: iterate all consumers in the `consumers` Map, call `audio.setSinkId(deviceId || '')` on each `HTMLAudioElement`
  - [x] 4.3 Store `currentOutputDeviceId` at module level so new consumers created after the switch also use the selected output device
  - [x] 4.4 Update `consumeAudio()` to call `audio.setSinkId(currentOutputDeviceId)` when creating new consumer audio elements
  - [x] 4.5 Handle errors: `setSinkId` may fail if device is unavailable — log warning, don't crash. Some browsers/Electron versions may not support `setSinkId`
  - [x] 4.6 Add TypeScript type assertion: `(audio as any).setSinkId(deviceId)` — `setSinkId` is not in the standard HTMLMediaElement type yet

- [x] Task 5: Add mute sound cue (AC: 4)
  - [x] 5.1 Add `playMuteSound(): void` export to `soundPlayer.ts`
  - [x] 5.2 Implementation: short single-tone downward blip — `playTone([330], 0.1)` (lower pitch, shorter duration than connect/disconnect)
  - [x] 5.3 Add `playUnmuteSound(): void` export — `playTone([440], 0.1)` (slightly higher pitch for unmute)
  - [x] 5.4 In `useVoiceStore.toggleMute()`: call `playMuteSound()` when muting, `playUnmuteSound()` when unmuting
  - [x] 5.5 Do NOT play mute sound when mute is caused by deafen toggle (deafen already implies mute — double sound is confusing)

- [x] Task 6: Broadcast mute/deafen state via WebSocket (AC: 10)
  - [x] 6.1 In `useVoiceStore.toggleMute()`: after toggling, send `voice:state` WS message with `{ userId, channelId, muted, deafened, speaking: false }`
  - [x] 6.2 In `useVoiceStore.toggleDeafen()`: after toggling, send `voice:state` WS message with current state
  - [x] 6.3 Use existing `WS_TYPES.VOICE_STATE` constant and `VoiceStatePayload` interface (both already defined in `shared/src/ws-messages.ts`)
  - [x] 6.4 In `wsClient.ts`: send voice:state by calling `sendMessage(WS_TYPES.VOICE_STATE, payload)` — NO need for request/response, this is fire-and-forget broadcast

- [x] Task 7: Server relay for voice:state messages (AC: 10)
  - [x] 7.1 In `server/src/plugins/voice/voiceWsHandler.ts`: add handler for `WS_TYPES.VOICE_STATE`
  - [x] 7.2 Handler: receive `VoiceStatePayload`, validate userId matches authenticated user
  - [x] 7.3 Broadcast `voice:state` to all other peers in the same channel using existing `broadcastToChannel()` helper
  - [x] 7.4 Do NOT store mute/deafen state on the server — this is a transient relay only (privacy-first: server doesn't track user state)

- [x] Task 8: Handle incoming voice:state on client (AC: 10)
  - [x] 8.1 Add `remoteMuteState: Map<string, { muted: boolean, deafened: boolean }>` to useVoiceStore
  - [x] 8.2 Add `setRemoteMuteState(userId: string, muted: boolean, deafened: boolean): void` action
  - [x] 8.3 Clear `remoteMuteState` in `leaveChannel()` and `localCleanup()`
  - [x] 8.4 Clear individual user from `remoteMuteState` in `removePeer()`
  - [x] 8.5 In `wsClient.ts`: register handler for `WS_TYPES.VOICE_STATE` — call `useVoiceStore.getState().setRemoteMuteState(payload.userId, payload.muted, payload.deafened)`

- [x] Task 9: Display remote mute/deafen icons in VoiceParticipant (AC: 10)
  - [x] 9.1 In `VoiceParticipant.tsx`: read `remoteMuteState` from `useVoiceStore`
  - [x] 9.2 For non-local users: check `remoteMuteState.get(userId)` for muted/deafened state
  - [x] 9.3 If remote user is muted: show `MicOff` icon overlay on avatar (same style as local user mute icon — `absolute -bottom-0.5 -right-0.5 bg-bg-primary rounded-full p-0.5`)
  - [x] 9.4 If remote user is deafened: show `HeadphoneOff` icon overlay instead (deafen implies mute, so show deafen icon, not both)
  - [x] 9.5 Update ARIA label: include "(muted)" or "(deafened)" for remote users when applicable

- [x] Task 10: Create AudioSettings UI component (AC: 1)
  - [x] 10.1 Create `client/src/renderer/src/features/settings/AudioSettings.tsx`
  - [x] 10.2 Use `useMediaDevices` hook to get device lists
  - [x] 10.3 Render two `<select>` dropdowns: "Input Device" (microphones) and "Output Device" (speakers/headphones)
  - [x] 10.4 Include "System Default" as the first option in each dropdown (value = `""`)
  - [x] 10.5 Selected values come from `useVoiceStore.selectedAudioInputId` / `selectedAudioOutputId`
  - [x] 10.6 On change: call `useVoiceStore.getState().setAudioInputDevice(deviceId)` / `setAudioOutputDevice(deviceId)`
  - [x] 10.7 Style with Tailwind: match the dark theme, use `bg-bg-secondary`, `text-text-primary`, `border-border-primary` tokens
  - [x] 10.8 Show section heading "Voice & Audio" with device dropdowns
  - [x] 10.9 No additional settings needed for MVP (no volume sliders, no noise suppression toggle, no VAD sensitivity)

- [x] Task 11: Wire AudioSettings into Settings page routing (AC: 1)
  - [x] 11.1 Create `client/src/renderer/src/features/settings/SettingsPage.tsx` — a settings view that replaces the content area (center column)
  - [x] 11.2 Per UX spec: settings views replace the content area, sidebar remains visible
  - [x] 11.3 Add settings route or state toggle: clicking the Settings gear icon in `UserPanel.tsx` → shows `SettingsPage` in the content area
  - [x] 11.4 Settings page includes: "Voice & Audio" section with `AudioSettings` component, and a "Close" / back button (or Escape key) to return to channel view
  - [x] 11.5 Add `isSettingsOpen: boolean` and `setSettingsOpen(open: boolean)` to a UI state mechanism (can be in a local component state in AppLayout, or a simple `useSettingsStore` — prefer simplest approach)
  - [x] 11.6 Wire UserPanel settings button `onClick` to open settings
  - [x] 11.7 Ensure voice connection persists when settings are open (voice is a layer, not a destination)

- [x] Task 12: Write tests (AC: 1-10)
  - [x] 12.1 Create `client/src/renderer/src/hooks/useMediaDevices.test.ts`:
    - Test returns audio input and output device lists
    - Test updates device list on `devicechange` event
    - Test handles empty labels gracefully
    - Test cleanup removes event listener
    - Mock `navigator.mediaDevices.enumerateDevices`
  - [x] 12.2 Update `client/src/renderer/src/stores/useVoiceStore.test.ts`:
    - Test `setAudioInputDevice()` calls `mediaService.switchAudioInput()` when in voice
    - Test `setAudioOutputDevice()` calls `mediaService.switchAudioOutput()` when in voice
    - Test `setAudioInputDevice()` does NOT call mediaService when not in voice
    - Test device selection persists to localStorage
    - Test device selection loads from localStorage on init
    - Test `setRemoteMuteState()` adds/updates remote user mute state
    - Test `removePeer()` clears remote mute state for that user
    - Test `leaveChannel()` clears all remote mute state
    - Test `toggleMute()` sends voice:state WS message
    - Test `toggleDeafen()` sends voice:state WS message
    - Test `toggleMute()` plays mute/unmute sound
    - Test deafen does NOT play mute sound separately
  - [x] 12.3 Update `client/src/renderer/src/services/mediaService.test.ts`:
    - Test `switchAudioInput()` calls getUserMedia with deviceId constraint
    - Test `switchAudioInput()` calls producer.replaceTrack
    - Test `switchAudioInput()` stops old tracks
    - Test `switchAudioInput()` restarts local VAD
    - Test `switchAudioInput()` preserves muted state
    - Test `switchAudioInput()` error handling keeps old stream
    - Test `switchAudioOutput()` calls setSinkId on all consumer audio elements
    - Test `switchAudioOutput()` stores deviceId for new consumers
    - Test `consumeAudio()` uses stored output device
  - [x] 12.4 Create `client/src/renderer/src/features/settings/AudioSettings.test.tsx`:
    - Test renders input and output device dropdowns
    - Test shows "System Default" option
    - Test selecting input device calls setAudioInputDevice
    - Test selecting output device calls setAudioOutputDevice
    - Test shows current selected devices
  - [x] 12.5 Update `client/src/renderer/src/features/voice/VoiceParticipant.test.tsx`:
    - Test shows mute icon for remote muted user
    - Test shows deafen icon for remote deafened user
    - Test deafen icon takes priority over mute icon
    - Test ARIA label includes "(muted)" for remote muted users
    - Test ARIA label includes "(deafened)" for remote deafened users
  - [x] 12.6 Create `server/src/plugins/voice/voiceWsHandler.test.ts` (or update existing):
    - Test VOICE_STATE handler broadcasts to channel peers
    - Test VOICE_STATE handler validates userId
    - Test VOICE_STATE handler excludes sender from broadcast

- [x] Task 13: Final verification (AC: 1-10)
  - [x] 13.1 Run `npm test -w client` — all new + existing tests pass (406 tests, 39 files)
  - [x] 13.2 Run `npm test -w server` — all server tests pass (293 tests, 23 files)
  - [x] 13.3 Run `npm run lint` — no lint errors
  - [x] 13.4 Run `npm run build -w client` — builds successfully
  - [ ] 13.5 Manual test: open settings → see audio device dropdowns
  - [ ] 13.6 Manual test: select different microphone → audio switches without disconnecting
  - [ ] 13.7 Manual test: select different speaker → audio plays from new device without disconnecting
  - [ ] 13.8 Manual test: mute → hear short mute sound cue, mic stops transmitting
  - [ ] 13.9 Manual test: two users in channel → mute one → other user sees mute icon on their avatar
  - [ ] 13.10 Manual test: deafen → other users see deafen icon
  - [ ] 13.11 Manual test: close and reopen app → device selections persist

## Dev Notes

### Critical: Audio Device Hot-Swap — `producer.replaceTrack()`

The key to hot-swapping the microphone without disconnecting from voice is `producer.replaceTrack({ track: newTrack })`. This replaces the audio track on the existing mediasoup producer without renegotiating the WebRTC connection. The server never knows the device changed — it just receives audio from a different source.

```typescript
// mediaService.ts — switchAudioInput implementation
export async function switchAudioInput(deviceId: string | null): Promise<void> {
  if (!producer) return;

  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true
  };

  const newStream = await navigator.mediaDevices.getUserMedia(constraints);
  const newTrack = newStream.getAudioTracks()[0];

  // Preserve muted state
  if (producer.track) {
    newTrack.enabled = producer.track.enabled;
  }

  // Hot-swap the track — no disconnect, no renegotiation
  await producer.replaceTrack({ track: newTrack });

  // Cleanup old stream
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  localStream = newStream;
}
```

**CRITICAL:** `producer.replaceTrack()` is a mediasoup-client method (NOT the native WebRTC `replaceTrack`). It handles the RTP parameter negotiation internally. The method signature is `producer.replaceTrack({ track: MediaStreamTrack })`.

### Critical: Output Device — `HTMLAudioElement.setSinkId()`

Output device selection uses `setSinkId()` on `HTMLAudioElement`. This is a Chromium API that's well-supported in Electron but has type issues in TypeScript (not in standard `HTMLMediaElement` interface).

```typescript
// mediaService.ts — switchAudioOutput implementation
export async function switchAudioOutput(deviceId: string | null): Promise<void> {
  currentOutputDeviceId = deviceId || '';

  for (const { audio } of consumers.values()) {
    try {
      await (audio as any).setSinkId(currentOutputDeviceId);
    } catch (err) {
      console.warn('Failed to set audio output device:', err);
    }
  }
}
```

**NOTE:** `setSinkId()` returns a Promise. It can fail if the device becomes unavailable between enumeration and selection. Always handle the error gracefully — don't crash the voice connection.

### Critical: Device Enumeration Requires Permission

`navigator.mediaDevices.enumerateDevices()` returns device objects, but **labels are empty strings** until the user grants microphone permission. Since our app already calls `getUserMedia({ audio: true })` when joining voice (in `produceAudio()`), labels will be populated after the first voice join. Before that, the hook should handle empty labels gracefully by showing fallback labels.

### Critical: Mute State Broadcasting — Use Existing Infrastructure

`VoiceStatePayload` and `WS_TYPES.VOICE_STATE` are **already defined** in `shared/src/ws-messages.ts`:

```typescript
export interface VoiceStatePayload {
  userId: string;
  channelId: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
}
```

The constant `VOICE_STATE: 'voice:state'` is already in `WS_TYPES`. What's missing:
1. **Client sending** — `useVoiceStore.toggleMute/toggleDeafen` must send `voice:state` after toggling
2. **Server relaying** — `voiceWsHandler.ts` must handle `voice:state` and broadcast to channel peers
3. **Client receiving** — `wsClient.ts` must handle incoming `voice:state` and update store

This is a **fire-and-forget broadcast** pattern (like presence updates), NOT a request/response pattern. The server simply relays the payload to other peers in the channel. No acknowledgment needed. The server does NOT store this state (privacy-first — server is a blind relay).

### Critical: VAD Restart on Device Switch

When switching input devices, local VAD must be restarted with the new stream:

```typescript
// In switchAudioInput after track replacement:
vadService.stopLocalVAD();
// Only restart if not muted
if (newTrack.enabled) {
  vadService.startLocalVAD(newStream, (speaking) => {
    useVoiceStore.getState().setSpeaking(userId, speaking);
  });
}
```

Without this, the VAD would continue analyzing the old (stopped) stream and never detect speaking.

### Existing Code to Reuse (Do NOT Reinvent)

| What | Where | How to Reuse |
|---|---|---|
| `producer` + `replaceTrack` | `mediaService.ts` module-level var | Direct access in `switchAudioInput()` — `producer.replaceTrack({ track })` |
| `consumers` Map | `mediaService.ts` → `Map<string, { consumer, audio }>` | Iterate for `switchAudioOutput()` — `audio.setSinkId(deviceId)` |
| `localStream` | `mediaService.ts` module-level var | Stop old tracks, replace with new stream |
| `VoiceStatePayload` | `shared/src/ws-messages.ts` | Already defined — import and use as-is |
| `WS_TYPES.VOICE_STATE` | `shared/src/ws-messages.ts` | Already defined — import and use as-is |
| `broadcastToChannel()` | `server/src/plugins/voice/voiceWsHandler.ts` | Use for server relay of voice:state |
| `sendMessage()` | `client wsClient.ts` | Fire-and-forget message sending for voice:state |
| `vadService.startLocalVAD` / `stopLocalVAD` | `vadService.ts` | Restart VAD after input device switch |
| `soundPlayer.playTone()` | `utils/soundPlayer.ts` (internal function) | Add `playMuteSound()` / `playUnmuteSound()` using same `playTone` pattern |
| `MicOff` / `HeadphoneOff` icons | `lucide-react` | Already installed, used in VoiceStatusBar |
| `getAvatarColor` | `utils/avatarColor.ts` | Already used in VoiceParticipant |
| `useAuthStore` | `stores/useAuthStore.ts` | Get current userId to distinguish local vs remote user |
| Settings gear icon | `UserPanel.tsx` → `<Settings />` icon | Wire onClick to open settings page |
| Voice status bar buttons | `VoiceStatusBar.tsx` | Mute/deafen buttons already work — just add sound cue |
| Keyboard shortcuts | `AppLayout.tsx` → `handleVoiceShortcuts` | Already implemented for Ctrl/Cmd+Shift+M/D/E — no changes needed |

### VoiceParticipant Remote Mute/Deafen Display

The mute icon overlay was already added for the **local user** in story 3-3. This story extends it to **remote users** by reading from `remoteMuteState` in the store:

```
Remote user NOT muted:
┌──────────────────────────┐
│  [avatar] Username       │  ← No overlay
└──────────────────────────┘

Remote user muted:
┌──────────────────────────┐
│  [avatar🔇] Username     │  ← MicOff icon bottom-right (same style as local)
└──────────────────────────┘

Remote user deafened:
┌──────────────────────────┐
│  [avatar🎧✕] Username    │  ← HeadphoneOff icon bottom-right (deafen > mute priority)
└──────────────────────────┘
```

**Logic priority:** deafened icon > muted icon > no icon. Don't show both mute and deafen icons simultaneously.

### Settings Page Layout

Per UX spec, settings views replace the content area (center column) while the sidebar remains visible. The simplest implementation:

```
┌──────────────────────────────────────────────────────┐
│ ┌──────────┐ ┌─────────────────────────────────────┐ │
│ │ Sidebar  │ │ Settings Page                        │ │
│ │          │ │                                       │ │
│ │ channels │ │  Voice & Audio                       │ │
│ │          │ │  ┌──────────────────────────────────┐ │ │
│ │          │ │  │ Input Device  [▼ Select mic    ] │ │ │
│ │          │ │  │ Output Device [▼ Select speaker] │ │ │
│ │          │ │  └──────────────────────────────────┘ │ │
│ │          │ │                                       │ │
│ │ Voice    │ │          [✕ Close / ESC]              │ │
│ │ Status   │ │                                       │ │
│ │ Bar      │ │                                       │ │
│ │──────────│ │                                       │ │
│ │ User     │ │                                       │ │
│ │ Panel    │ │                                       │ │
│ └──────────┘ └─────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

Keep it minimal — just Voice & Audio for now. No volume sliders, no notifications settings, no appearance settings. Those are for future stories.

### Device Persistence — localStorage

Use `localStorage` (not Electron `safeStorage`) for device preferences. Device IDs are not sensitive data and localStorage is simpler. Electron `safeStorage` is for secrets (tokens, keys).

```typescript
// In useVoiceStore initialization:
const storedInputId = localStorage.getItem('voiceInputDeviceId');
const storedOutputId = localStorage.getItem('voiceOutputDeviceId');

// In setAudioInputDevice:
if (deviceId) {
  localStorage.setItem('voiceInputDeviceId', deviceId);
} else {
  localStorage.removeItem('voiceInputDeviceId');
}
```

**Edge case:** If a stored device ID refers to a device that's no longer available (unplugged), `getUserMedia` will fall back to the system default. The UI should reflect this by showing "System Default" when the stored device isn't in the enumerated list.

### Sound Cue for Mute — Minimal Approach

Following the existing `soundPlayer.ts` pattern (oscillator-based synthesis, no .mp3 files):

```typescript
export function playMuteSound(): void {
  playTone([330], 0.1);  // Lower pitch, very short — subtle "blip down"
}

export function playUnmuteSound(): void {
  playTone([440], 0.1);  // Slightly higher pitch — subtle "blip up"
}
```

**IMPORTANT:** Do NOT play the mute sound when mute is triggered by deafen. The deafen toggle already implies mute — playing both sounds would be confusing. The sound should only play for explicit mute/unmute toggle.

### Anti-Patterns to Avoid

- **NEVER** call `producer.pause()` / `producer.resume()` for mute — use `track.enabled`. This was established in story 3-3
- **NEVER** call `track.stop()` when switching devices — only stop the OLD track after the new one is attached. Stopping the current track before replacing it causes a gap in audio
- **NEVER** share the VAD AudioContext with `soundPlayer.ts` — they have separate AudioContext instances (established in 3-3)
- **NEVER** store mute/deafen state on the server — the server is a transient relay only. Privacy-first means no user state tracking
- **NEVER** use Electron `safeStorage` for device preferences — that's for secrets. Use `localStorage` for non-sensitive preferences
- **NEVER** import `useVoiceStore` in `mediaService.ts` — pass callbacks or return values. Keep services store-agnostic (established pattern)
- **NEVER** create a new WebSocket message type for voice state — `VOICE_STATE` and `VoiceStatePayload` already exist in `shared/src/ws-messages.ts`
- **NEVER** add volume sliders or noise suppression toggles — these are not in any acceptance criteria and add unnecessary scope
- **NEVER** block voice functionality if device enumeration fails — gracefully fall back to system defaults
- **NEVER** make `setSinkId` a hard requirement — some environments may not support it. Wrap in try/catch
- **NEVER** forget to stop old stream tracks when switching input device — this leaks the microphone permission and wastes resources

### Deferred / Not In Scope

- **Volume sliders** — not in acceptance criteria
- **Noise suppression toggle** — Chromium's built-in noise suppression is sufficient for MVP
- **VAD sensitivity control** — fixed threshold (15) from story 3-3 is fine
- **Video device selection** — Epic 4
- **Push-to-talk** — not in any requirement
- **Per-user volume control** — not in any requirement
- **Audio test / mic test** — not in acceptance criteria (could add later)
- **Notification settings** — separate concern
- **Appearance settings** — separate concern

### Project Structure Notes

**New files:**
```
client/src/renderer/src/
  hooks/useMediaDevices.ts               # Audio device enumeration hook
  hooks/useMediaDevices.test.ts          # Hook tests
  features/settings/AudioSettings.tsx    # Audio device selection dropdowns
  features/settings/AudioSettings.test.tsx # Component tests
  features/settings/SettingsPage.tsx      # Settings page container
```

**Modified files:**
```
client/src/renderer/src/
  services/mediaService.ts              # Add switchAudioInput, switchAudioOutput, update produceAudio/consumeAudio
  services/mediaService.test.ts         # Add tests for device switching
  stores/useVoiceStore.ts               # Add device selection state, remoteMuteState, voice:state sending
  stores/useVoiceStore.test.ts          # Add tests for new state/actions
  features/voice/VoiceParticipant.tsx   # Add remote mute/deafen icon display
  features/voice/VoiceParticipant.test.tsx # Add tests for remote mute icons
  features/layout/UserPanel.tsx         # Wire settings gear onClick
  utils/soundPlayer.ts                  # Add playMuteSound, playUnmuteSound
  services/wsClient.ts                  # Handle incoming voice:state messages

server/src/plugins/voice/
  voiceWsHandler.ts                     # Add voice:state relay handler
```

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-3-voice-communication.md#Story-3.4] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#Cross-Cutting-Concerns] — Audio/video device management via Chromium APIs, cross-platform
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend-Architecture] — useVoiceStore with device selection, hooks/useMediaDevices.ts, features/settings/AudioSettings.tsx
- [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure] — settings/ feature folder, hooks/ directory for useMediaDevices
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Platform-Strategy] — Native audio integration, in-app device selection and hot-switching
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UserPanel] — Settings button opens user settings view (audio device selection, account settings)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Navigation] — Settings views replace the content area, sidebar remains visible, voice persists
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Voice-Specific-Testing] — Audio device switching without disconnection, keyboard shortcut functionality
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility] — ARIA labels on mute/deafen buttons, prefers-reduced-motion
- [Source: _bmad-output/project-context.md#Framework-Rules] — Zustand store naming, feature-based organization, no cross-store imports
- [Source: _bmad-output/project-context.md#Testing-Rules] — Co-located tests, Vitest, React Testing Library
- [Source: _bmad-output/project-context.md#Anti-Patterns] — Never import one store inside another, never console.log on backend
- [Source: shared/src/ws-messages.ts] — VoiceStatePayload { userId, channelId, muted, deafened, speaking } and WS_TYPES.VOICE_STATE already defined
- [Source: _bmad-output/implementation-artifacts/3-3-real-time-voice-audio-and-speaking-indicators.md] — VAD service API, mute/deafen implementation, speaking indicators, code patterns established
- [Source: client/src/renderer/src/services/mediaService.ts] — producer, consumers Map, localStream, produceAudio, consumeAudio, muteAudio, unmuteAudio, deafenAudio, undeafenAudio
- [Source: client/src/renderer/src/stores/useVoiceStore.ts] — isMuted, isDeafened, wasMutedBeforeDeafen, toggleMute, toggleDeafen, speakingUsers
- [Source: client/src/renderer/src/services/vadService.ts] — startLocalVAD, stopLocalVAD, startRemoteVAD, stopRemoteVAD, stopAllVAD
- [Source: client/src/renderer/src/utils/soundPlayer.ts] — playTone helper, playConnectSound, playDisconnectSound pattern
- [Source: client/src/renderer/src/features/voice/VoiceParticipant.tsx] — Local mute icon overlay already exists, speaking ring logic
- [Source: client/src/renderer/src/features/voice/VoiceStatusBar.tsx] — Mute/deafen buttons already functional
- [Source: client/src/renderer/src/features/layout/AppLayout.tsx] — Keyboard shortcuts already wired for Ctrl/Cmd+Shift+M/D/E
- [Source: client/src/renderer/src/features/layout/UserPanel.tsx] — Settings gear icon (no onClick handler yet)
- [Source: server/src/plugins/voice/voiceWsHandler.ts] — broadcastToChannel helper, existing voice WS handler patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- Task 1: Created `useMediaDevices` hook with `enumerateDevices()`, `devicechange` listener, fallback labels for empty device labels, and cleanup on unmount.
- Task 2: Added `selectedAudioInputId`, `selectedAudioOutputId`, `remoteMuteState` to `useVoiceStore`. Added `setAudioInputDevice`, `setAudioOutputDevice`, `setRemoteMuteState` actions. Device selections persist to `localStorage` and load on init.
- Task 3: Added `switchAudioInput()` to `mediaService.ts` using `producer.replaceTrack()` for zero-disconnect hot-swap. Preserves muted state, restarts VAD, stops old tracks, handles errors gracefully. Updated `produceAudio()` to accept optional `deviceId`.
- Task 4: Added `switchAudioOutput()` to `mediaService.ts` using `setSinkId()` on all consumer audio elements. Stored `currentOutputDeviceId` at module level for new consumers. Updated `consumeAudio()` to apply `setSinkId` on creation.
- Task 5: Added `playMuteSound()` (330Hz, 0.1s) and `playUnmuteSound()` (440Hz, 0.1s) to `soundPlayer.ts`. Wired into `toggleMute()` only — deafen does NOT play mute sound.
- Task 6: `toggleMute()` and `toggleDeafen()` now send `voice:state` via `wsClient.send()` as fire-and-forget broadcast after state change.
- Task 7: Added `handleVoiceState` handler in `voiceWsHandler.ts` — validates `userId` matches authenticated user, broadcasts to channel peers via `broadcastToChannel()`. No server-side state storage (privacy-first).
- Task 8: Added `VOICE_STATE` handler in `wsClient.ts` that calls `setRemoteMuteState()`. `remoteMuteState` cleared on `leaveChannel()`, `localCleanup()`, and per-user in `removePeer()`.
- Task 9: Updated `VoiceParticipant.tsx` to show `MicOff` for remote muted users and `HeadphoneOff` for remote deafened users. Deafen icon takes priority. ARIA labels include "(muted)" or "(deafened)".
- Task 10: Created `AudioSettings.tsx` with Input/Output device `<select>` dropdowns, "System Default" option, Tailwind dark theme styling.
- Task 11: Created `SettingsPage.tsx` with close button + Escape key. Added `isSettingsOpen`/`setSettingsOpen` to `useUIStore`. Wired settings gear in `UserPanel.tsx`. Settings replace content area; sidebar + voice persist.
- Task 12: 37+ new tests across 6 test files covering all new functionality.
- Task 13: 406 client tests pass, 293 server tests pass, lint clean, build succeeds.

### Change Log

- 2026-02-25: Implemented story 3-4 — audio device management, mute sound cues, voice state broadcasting, remote mute/deafen icons, settings page with audio device selection.
- 2026-02-25: Code review — fixed 7 issues (3 HIGH, 2 MEDIUM, 2 LOW): H1 VAD callback missing in setAudioInputDevice, H2 selectedAudioInputId not passed on voice join, H3 useVoiceStore importing wsClient (moved to voiceService.broadcastVoiceState), M1 member list visible during settings, M2 story File List missing 4 files, L1 ARIA label mute/deafen priority, L2 empty catch blocks in wsClient.ts.

### File List

**New files:**
- `client/src/renderer/src/hooks/useMediaDevices.ts`
- `client/src/renderer/src/hooks/useMediaDevices.test.ts`
- `client/src/renderer/src/features/settings/AudioSettings.tsx`
- `client/src/renderer/src/features/settings/AudioSettings.test.tsx`
- `client/src/renderer/src/features/settings/SettingsPage.tsx`

**Modified files:**
- `client/src/renderer/src/services/mediaService.ts` — added `switchAudioInput`, `switchAudioOutput`, `currentOutputDeviceId`, updated `produceAudio`/`consumeAudio`
- `client/src/renderer/src/services/mediaService.test.ts` — added tests for switchAudioInput, switchAudioOutput
- `client/src/renderer/src/services/voiceService.ts` — added `broadcastVoiceState`, pass selected device to `produceAudio`
- `client/src/renderer/src/stores/useVoiceStore.ts` — added device selection state, remoteMuteState, mute sounds, voice:state via voiceService
- `client/src/renderer/src/stores/useVoiceStore.test.ts` — added tests for new state/actions
- `client/src/renderer/src/stores/useUIStore.ts` — added `isSettingsOpen`/`setSettingsOpen`
- `client/src/renderer/src/features/voice/VoiceParticipant.tsx` — added remote mute/deafen icon display
- `client/src/renderer/src/features/voice/VoiceParticipant.test.tsx` — added tests for remote mute/deafen icons
- `client/src/renderer/src/features/layout/UserPanel.tsx` — wired settings gear onClick
- `client/src/renderer/src/features/layout/AppLayout.tsx` — added settings page toggle, hide member list in settings
- `client/src/renderer/src/utils/soundPlayer.ts` — added playMuteSound, playUnmuteSound
- `client/src/renderer/src/services/wsClient.ts` — added VOICE_STATE handler, improved catch block logging
- `shared/src/ws-messages.ts` — VoiceStatePayload interface, WS_TYPES.VOICE_STATE constant
- `shared/src/index.ts` — re-export VoiceStatePayload
- `server/src/plugins/voice/voiceWsHandler.ts` — added voice:state relay handler
- `server/src/plugins/voice/voiceWsHandler.test.ts` — added VOICE_STATE handler tests
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — updated story status
- `_bmad-output/implementation-artifacts/3-4-audio-device-management-and-voice-controls.md` — updated tasks, status, dev record

**Unrelated changes on branch (from commit 5f17e82 — bug fix in invite account creation):**
- `server/src/plugins/auth/authRoutes.ts`
- `client/src/renderer/src/stores/useMemberStore.ts`
