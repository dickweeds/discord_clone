export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: 'owner' | 'user';
  status: 'online' | 'idle' | 'dnd' | 'offline';
  publicKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  encrypted: boolean;
  nonce?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  refreshToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface Invite {
  id: string;
  token: string;
  createdBy: string;
  revoked: boolean;
  createdAt: string;
}

export interface Ban {
  id: string;
  serverId: string;
  userId: string;
  reason?: string;
  bannedById: string;
  createdAt: string;
}

/** Safe user representation for member lists — excludes sensitive fields */
export interface UserPublic {
  id: string;
  username: string;
  role: 'owner' | 'user';
  createdAt: string;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiList<T> {
  data: T[];
  count: number;
}

export interface ApiPaginatedList<T> {
  data: T[];
  cursor: string | null;
  count: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Base64-encoded sealed box containing the group encryption key encrypted for a specific user */
export type EncryptedGroupKeyBlob = string;

export type AudioProducerSource = 'microphone' | 'soundboard';

export interface SoundResponse {
  id: string;
  name: string;
  fileSize: number;
  durationMs: number;
  mimeType: string;
  uploadedBy: string;
  uploadedByUsername: string;
  createdAt: string;
}
