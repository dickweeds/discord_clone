# Epic 2: Real-Time Text Communication

Users can send and receive end-to-end encrypted text messages in channels with persistent history.

## Story 2.1: WebSocket Connection & Real-Time Transport

As a user,
I want a persistent WebSocket connection to the server,
So that I can send and receive messages in real-time without page refreshes.

**Acceptance Criteria:**

**Given** I am logged in
**When** the app initializes
**Then** a WebSocket connection is established to the server at /ws
**And** the connection is authenticated with my JWT access token

**Given** the WebSocket connection is active
**When** the server sends a message
**Then** the wsClient dispatches it to the appropriate Zustand store based on message type

**Given** the WebSocket connection drops unexpectedly
**When** the client detects the disconnection
**Then** automatic reconnection attempts begin with exponential backoff (1s, 2s, 4s, 8s, max 30s)
**And** a connection state indicator is visible to the user

**Given** the WebSocket connection is re-established
**When** the reconnection succeeds
**Then** the client resumes normal operation
**And** any missed messages are synced

**Given** the WebSocket message protocol
**When** any message is sent or received
**Then** it follows the `{ type: "namespace:action", payload: {...}, id?: string }` envelope format

## Story 2.2: Encrypted Text Messaging

As a user,
I want to send and receive end-to-end encrypted text messages in a channel,
So that I can communicate with my friends knowing the server cannot read our messages.

**Acceptance Criteria:**

**Given** I am in a text channel
**When** I type a message and press Enter
**Then** the message is encrypted client-side using the group key (XSalsa20-Poly1305) with a unique nonce
**And** the encrypted content and nonce are sent via WebSocket as a `text:send` message
**And** the input field clears immediately

**Given** another user sends a message in my active channel
**When** I receive a `text:receive` WebSocket message
**Then** the encrypted content is decrypted client-side using the group key and nonce
**And** the plaintext message appears in the message feed in real-time

**Given** the server receives an encrypted message
**When** it stores the message in SQLite
**Then** only the encrypted content blob and nonce are persisted — plaintext is never written to disk

**Given** I press Shift+Enter while typing
**When** the input processes the key combination
**Then** a newline is inserted instead of sending the message

**Given** a message fails to send
**When** the WebSocket delivery fails
**Then** I am clearly notified that the message was not delivered
**And** the message is visually marked as failed

## Story 2.3: Message Feed & Channel Navigation UI

As a user,
I want to see messages displayed in a clean, chronological feed with Discord-familiar grouping,
So that I can follow conversations naturally and know who said what.

**Acceptance Criteria:**

**Given** I am viewing a text channel
**When** messages are displayed
**Then** they appear in chronological order in the content area
**And** the content header shows the channel name with # prefix

**Given** consecutive messages are from the same author within 5 minutes
**When** the messages render
**Then** they are grouped under a single header showing avatar (32px), username (semibold), and timestamp (muted, 12px)
**And** subsequent messages in the group have 4px vertical spacing

**Given** a new author sends a message or more than 5 minutes pass
**When** the next message renders
**Then** a new message group starts with its own header
**And** 16px gap separates it from the previous group

**Given** the message input bar
**When** I look at the bottom of the content area
**Then** I see a text input with placeholder "Message #channel-name"
**And** it has 12px border radius, bg-tertiary background, and 44px minimum height

**Given** I click a different text channel in the sidebar
**When** the channel switches
**Then** the content area instantly swaps to show that channel's messages
**And** the previously active channel loses its selected state
**And** the new channel shows the active/selected state

**Given** the message feed content
**When** messages are displayed on a wide window (>1400px)
**Then** message content width is capped at ~720px and centered in the content area

**Given** a text channel with no messages
**When** I view the empty channel
**Then** I see centered text: channel name + "This is the beginning of #channel-name. Send the first message!"

## Story 2.4: Persistent Message History & Scrollback

As a user,
I want to see previous message history when I open a channel and scroll through past conversations,
So that I never lose context from earlier discussions.

**Acceptance Criteria:**

**Given** I open the app and navigate to a text channel
**When** the channel loads
**Then** the most recent messages are fetched from the server via GET /api/channels/:channelId/messages
**And** the encrypted messages are decrypted client-side and displayed

**Given** the message feed is loaded
**When** I am at the bottom of the feed
**Then** new incoming messages auto-scroll the feed to show the latest message

**Given** I have scrolled up in the message feed
**When** a new message arrives
**Then** the feed does NOT auto-scroll
**And** a "New messages" indicator appears to let me jump to the latest

**Given** I am viewing a channel with extensive history
**When** I scroll to the top of the loaded messages
**Then** older messages are fetched from the server (paginated)
**And** decrypted and prepended to the feed without losing scroll position

**Given** the server restarts
**When** I reconnect and view a text channel
**Then** all previously stored messages are still available and decryptable
**And** zero messages are lost
