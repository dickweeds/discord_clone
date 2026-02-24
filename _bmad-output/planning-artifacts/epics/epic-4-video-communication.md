# Epic 4: Video Communication

Users can enable video while in voice channels to see each other.

## Story 4.1: Video Camera Toggle & Streaming

As a user,
I want to enable and disable my video camera while in a voice channel,
So that I can see my friends and be seen during calls.

**Acceptance Criteria:**

**Given** I am in a voice channel
**When** I click the video toggle button in the voice status bar
**Then** my camera activates and begins streaming video to other participants
**And** the video toggle button shows an active/highlighted state

**Given** I have my video enabled
**When** I click the video toggle button again
**Then** my camera stops and video streaming ceases
**And** the video toggle button returns to its default state

**Given** I enable my video
**When** video is transmitted through the SFU
**Then** DTLS/SRTP encryption secures the video stream in transit

**Given** my video is enabled
**When** other participants view the voice channel
**Then** they can see my video stream

**Given** video is enabled in a voice channel
**When** up to 20 participants have video active
**Then** all video streams remain stable and viewable

## Story 4.2: Video Grid Display

As a user,
I want to see all participants' video streams in an organized grid,
So that I can see everyone who has their camera on during a call.

**Acceptance Criteria:**

**Given** I am in a voice channel where participants have video enabled
**When** I view the voice channel content area
**Then** video streams are displayed in a responsive grid layout

**Given** multiple participants have video enabled
**When** the grid displays
**Then** each participant's video shows their stream with their username overlaid
**And** the grid adapts layout based on the number of active video streams

**Given** a participant enables or disables their video
**When** the change occurs
**Then** the video grid updates in real-time — adding or removing the stream

**Given** a participant is speaking while their video is shown
**When** the speaking indicator activates
**Then** their video tile shows a green border/glow matching the speaking indicator style

**Given** a participant without video enabled
**When** they are in the voice channel
**Then** they are not shown in the video grid (audio-only participants appear in the sidebar participant list only)
