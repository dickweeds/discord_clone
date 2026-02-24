# Epic 3: Voice Communication

Users can join voice channels, talk with friends in real-time, see who's in each channel, and manage their audio devices.

## Story 3.1: Voice Server Infrastructure

As a developer,
I want the mediasoup SFU and coturn TURN/STUN server configured,
So that the platform has the server-side infrastructure to support group voice calls with NAT traversal.

**Acceptance Criteria:**

**Given** the server starts
**When** mediasoup is initialized
**Then** a mediasoup Worker is created with appropriate settings
**And** a Router is created for media routing

**Given** the server configuration
**When** coturn is configured
**Then** STUN/TURN services are available for WebRTC NAT traversal
**And** credentials are configured securely

**Given** a client needs to establish a WebRTC connection
**When** the client requests transport creation via WebSocket
**Then** the server creates a mediasoup WebRtcTransport with coturn ICE servers
**And** returns the transport parameters to the client

**Given** the WebSocket signaling protocol
**When** voice-related messages are exchanged
**Then** they follow the namespace:action format (voice:join, voice:leave, rtc:offer, rtc:answer, rtc:ice)

## Story 3.2: Voice Channel Join, Leave & Presence

As a user,
I want to join and leave voice channels with one click and see who's in each channel,
So that I can hop in and talk with friends instantly.

**Acceptance Criteria:**

**Given** I am logged in and viewing the channel sidebar
**When** I look at voice channels
**Then** each voice channel shows a speaker icon and its name
**And** connected users are listed nested beneath the channel name with their avatars

**Given** I click a voice channel name
**When** I join the channel
**Then** a WebRTC connection is established via mediasoup within 3 seconds
**And** a connect sound plays
**And** my name appears in the voice channel participant list for all users
**And** the voice status bar appears at the bottom of the sidebar

**Given** I am in a voice channel
**When** I click the disconnect button in the voice status bar
**Then** I immediately leave the voice channel
**And** a disconnect sound plays
**And** my name is removed from the participant list for all users
**And** the voice status bar disappears

**Given** I am in a voice channel
**When** I navigate to different text channels
**Then** my voice connection persists — voice is a layer, not a destination

**Given** the voice status bar is visible
**When** I look at it
**Then** I see: connection status label, channel name, mute button, deafen button, video toggle, disconnect button
**And** it is 52px height, fixed to bottom of sidebar above user panel

**Given** another user joins or leaves a voice channel
**When** the presence update arrives via WebSocket
**Then** the voice channel participant list updates in real-time for all users

## Story 3.3: Real-Time Voice Audio & Speaking Indicators

As a user,
I want to speak and hear other participants with instant, clear audio and see who's talking,
So that voice feels as natural as being in the same room.

**Acceptance Criteria:**

**Given** I am in a voice channel with other participants
**When** I speak into my microphone
**Then** all other participants hear my audio in real-time with less than 100ms latency

**Given** other participants are speaking
**When** their audio is transmitted
**Then** I hear them clearly with no echo, no clipping, and no perceptible delay

**Given** a voice channel
**When** up to 20 users are connected
**Then** all participants can speak and hear each other
**And** voice quality remains stable

**Given** voice audio is transmitted
**When** data flows between clients and the SFU
**Then** DTLS/SRTP encryption secures the audio in transit

**Given** I am speaking
**When** my voice is detected
**Then** a green speaking indicator (ring/glow) appears around my avatar in the participant list
**And** the indicator updates in real-time with zero perceptible delay
**And** the animation uses a subtle pulse, not a flash

**Given** the user has prefers-reduced-motion enabled
**When** speaking indicators are displayed
**Then** a static green ring is used instead of the pulse animation

**Given** another participant is speaking
**When** their voice is detected
**Then** a green speaking indicator appears around their avatar in the participant list

## Story 3.4: Audio Device Management & Voice Controls

As a user,
I want to select my audio devices and control my microphone and speaker during voice calls,
So that I can use the right hardware and manage my audio without leaving the call.

**Acceptance Criteria:**

**Given** I am in app settings or voice settings
**When** I open audio device selection
**Then** I see a list of available audio output devices (speakers/headphones)
**And** a list of available microphone input devices

**Given** I select a different audio output device
**When** the selection is applied
**Then** audio plays through the newly selected device
**And** I am NOT disconnected from voice

**Given** I select a different microphone input device
**When** the selection is applied
**Then** my voice is captured from the newly selected device
**And** I am NOT disconnected from voice

**Given** I am in a voice channel
**When** I click the mute button in the voice status bar
**Then** my microphone is muted — I stop transmitting audio
**And** the mute button shows a crossed-out mic icon
**And** a mute sound cue plays

**Given** I am muted
**When** I click the mute button again
**Then** my microphone is unmuted — I resume transmitting audio

**Given** I am in a voice channel
**When** I click the deafen button
**Then** all incoming audio is silenced AND my microphone is muted
**And** the deafen button shows a crossed-out headphone icon

**Given** I am in a voice channel
**When** I press Ctrl/Cmd+Shift+M
**Then** mute is toggled

**Given** I am in a voice channel
**When** I press Ctrl/Cmd+Shift+D
**Then** deafen is toggled

**Given** I am in a voice channel
**When** I press Ctrl/Cmd+Shift+E
**Then** I disconnect from voice

**Given** I am muted in a voice channel
**When** other users look at my participant entry
**Then** a small mute icon overlay appears on my avatar
