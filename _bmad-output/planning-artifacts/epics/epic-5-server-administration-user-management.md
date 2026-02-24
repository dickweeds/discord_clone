# Epic 5: Server Administration & User Management

The server owner can fully manage the platform — creating/deleting channels, viewing all users, kicking/banning/unbanning users, and resetting passwords. Admin controls are hidden from regular users.

## Story 5.1: Channel Management

As the server owner (Aiden),
I want to create and delete text and voice channels,
So that I can organize the server's communication spaces for the group.

**Acceptance Criteria:**

**Given** I am the server owner
**When** I click "Create Channel" via the server settings dropdown
**Then** a modal appears with: channel name input, text/voice type toggle, and "Create" button

**Given** I fill in a channel name and select a type
**When** I click "Create"
**Then** the channel is created on the server
**And** it appears immediately in the channel sidebar for all connected users
**And** a `channel:created` WebSocket message notifies all clients

**Given** I right-click on a channel in the sidebar
**When** I see the context menu (admin only)
**Then** a "Delete Channel" option is available

**Given** I select "Delete Channel"
**When** the confirmation dialog appears
**Then** it shows: "Delete #channel-name?" with a warning that messages will be permanently lost
**And** offers "Cancel" (secondary) and "Delete" (danger) buttons

**Given** I confirm channel deletion
**When** the channel is deleted
**Then** it is removed from the sidebar for all connected users
**And** a `channel:deleted` WebSocket message notifies all clients
**And** all associated messages are permanently removed

**Given** I am a regular user
**When** I view the sidebar
**Then** no channel creation or deletion options are visible — admin controls are hidden, not greyed out

## Story 5.2: User Management & Administration

As the server owner (Aiden),
I want to view all users and manage membership (kick, ban, unban, reset passwords),
So that I can maintain the server and help friends who get locked out.

**Acceptance Criteria:**

**Given** I am the server owner
**When** I access user management via server settings or right-click on a member
**Then** I can view a list of all registered users with their status

**Given** I right-click on a member in the member list
**When** the context menu appears (admin only)
**Then** I see options: "Kick", "Ban", "Reset Password"

**Given** I select "Kick" on a user
**When** a confirmation dialog appears and I confirm
**Then** the user is removed from the server
**And** their active sessions are invalidated
**And** they receive a `user:kicked` WebSocket notification
**And** they can rejoin via a new invite link

**Given** I select "Ban" on a user
**When** a confirmation dialog appears and I confirm
**Then** the user is removed from the server
**And** their account is banned
**And** they cannot log in or create new accounts
**And** they receive a `user:banned` WebSocket notification

**Given** I access the banned users list
**When** I select "Unban" on a previously banned user
**Then** their ban is lifted
**And** they can register a new account or log in again via invite

**Given** I select "Reset Password" on a user
**When** the action is executed
**Then** a new temporary password is generated
**And** displayed to me (the admin) for sharing with the user directly
**And** the user's existing sessions are invalidated

**Given** I am a regular user
**When** I right-click on a member
**Then** no admin options (kick, ban, reset password) are visible
