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
  tempId: string;
}

export interface TextReceivePayload {
  messageId: string;
  channelId: string;
  authorId: string;
  content: string;
  nonce: string;
  createdAt: string;
}

export interface TextErrorPayload {
  error: string;
  tempId: string;
}

// Voice
export interface VoiceJoinPayload {
  channelId: string;
}

export interface VoiceJoinResponse {
  routerRtpCapabilities: unknown;
  existingPeers: string[];
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

export interface VoiceCreateTransportPayload {
  direction: 'send' | 'recv';
}

export interface VoiceCreateTransportResponse {
  transportParams: {
    id: string;
    iceParameters: unknown;
    iceCandidates: unknown[];
    dtlsParameters: unknown;
  };
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

export interface VoiceConnectTransportPayload {
  transportId: string;
  dtlsParameters: unknown;
}

export interface VoiceProducePayload {
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: unknown;
}

export interface VoiceProduceResponse {
  producerId: string;
}

export interface VoiceConsumePayload {
  producerId: string;
}

export interface VoiceConsumeResponse {
  consumerId: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: unknown;
}

export interface VoiceConsumerResumePayload {
  consumerId: string;
}

export interface VoiceNewProducerPayload {
  producerId: string;
  peerId: string;
  kind: 'audio' | 'video';
}

export interface VoiceProducerClosedPayload {
  producerId: string;
  peerId: string;
  kind: 'audio' | 'video';
}

export interface VoicePeerJoinedPayload {
  userId: string;
  channelId: string;
}

export interface VoicePeerLeftPayload {
  userId: string;
  channelId: string;
}

export interface VoiceChannelPresencePayload {
  participants: { userId: string; channelId: string }[];
}

export interface VoiceSetRtpCapabilitiesPayload {
  rtpCapabilities: unknown;
}

// Presence
export interface PresenceUpdatePayload {
  userId: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}

export interface PresenceSyncPayload {
  users: PresenceUpdatePayload[];
}

// Channel events
export interface ChannelCreatedPayload {
  channel: {
    id: string;
    name: string;
    type: 'text' | 'voice';
    createdAt: string;
  };
}

export interface ChannelDeletedPayload {
  channelId: string;
}

// Reactions
export interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ReactionAddPayload {
  messageId: string;
  channelId: string;
  emoji: string;
}

export interface ReactionRemovePayload {
  messageId: string;
  channelId: string;
  emoji: string;
}

export interface ReactionAddedPayload {
  messageId: string;
  channelId: string;
  userId: string;
  emoji: string;
}

export interface ReactionRemovedPayload {
  messageId: string;
  channelId: string;
  userId: string;
  emoji: string;
}

// Admin action payloads
export interface UserKickedPayload {
  userId: string;
}

export interface UserBannedPayload {
  userId: string;
}

export interface MemberAddedPayload {
  id: string;
  username: string;
  role: 'owner' | 'user';
  createdAt: string;
}

export interface MemberRemovedPayload {
  userId: string;
}

// Type constants for namespace:action pattern
export const WS_TYPES = {
  TEXT_SEND: 'text:send',
  TEXT_RECEIVE: 'text:receive',
  TEXT_ERROR: 'text:error',
  TEXT_TYPING: 'text:typing',
  VOICE_JOIN: 'voice:join',
  VOICE_LEAVE: 'voice:leave',
  VOICE_STATE: 'voice:state',
  VOICE_SIGNAL: 'voice:signal',
  VOICE_CREATE_TRANSPORT: 'voice:create-transport',
  VOICE_CONNECT_TRANSPORT: 'voice:connect-transport',
  VOICE_PRODUCE: 'voice:produce',
  VOICE_CONSUME: 'voice:consume',
  VOICE_CONSUMER_RESUME: 'voice:consumer-resume',
  VOICE_NEW_PRODUCER: 'voice:new-producer',
  VOICE_PRODUCER_CLOSED: 'voice:producer-closed',
  VOICE_PEER_JOINED: 'voice:peer-joined',
  VOICE_PEER_LEFT: 'voice:peer-left',
  VOICE_PRESENCE_SYNC: 'voice:presence-sync',
  VOICE_SET_RTP_CAPABILITIES: 'voice:set-rtp-capabilities',
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_SYNC: 'presence:sync',
  CHANNEL_UPDATE: 'channel:update',
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_DELETED: 'channel:deleted',
  USER_UPDATE: 'user:update',
  USER_KICKED: 'user:kicked',
  USER_BANNED: 'user:banned',
  MEMBER_ADDED: 'member:added',
  MEMBER_REMOVED: 'member:removed',
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',
} as const;
