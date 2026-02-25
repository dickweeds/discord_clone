export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
  id?: string;
}

// Text messaging
export interface TextSendPayload {
  channelId: string;
  content: string;
  nonce: string;
}

export interface TextReceivePayload {
  messageId: string;
  channelId: string;
  authorId: string;
  content: string;
  nonce: string;
  createdAt: string;
}

// Voice
export interface VoiceJoinPayload {
  channelId: string;
}

export interface VoiceLeavePayload {
  channelId: string;
}

export interface VoiceStatePayload {
  userId: string;
  channelId: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
}

// Presence
export interface PresenceUpdatePayload {
  userId: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}

export interface PresenceSyncPayload {
  users: PresenceUpdatePayload[];
}

// Type constants for namespace:action pattern
export const WS_TYPES = {
  TEXT_SEND: 'text:send',
  TEXT_RECEIVE: 'text:receive',
  TEXT_TYPING: 'text:typing',
  VOICE_JOIN: 'voice:join',
  VOICE_LEAVE: 'voice:leave',
  VOICE_STATE: 'voice:state',
  VOICE_SIGNAL: 'voice:signal',
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_SYNC: 'presence:sync',
  CHANNEL_UPDATE: 'channel:update',
  USER_UPDATE: 'user:update',
} as const;
