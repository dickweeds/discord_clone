// Voice limits
export const MAX_PARTICIPANTS = 25;

// WebSocket
export const WS_RECONNECT_DELAY = 1000;
export const WS_MAX_RECONNECT_DELAY = 30000;
export const WS_HEARTBEAT_INTERVAL = 30000;

// JWT
export const JWT_ACCESS_EXPIRY = '15m';
export const JWT_REFRESH_EXPIRY = '7d';
export const JWT_ACCESS_EXPIRY_MS = 15 * 60 * 1000;
export const JWT_REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Messages
export const MAX_MESSAGE_LENGTH = 2000;

// Server
export const MAX_CHANNELS_PER_SERVER = 50;
export const MAX_MEMBERS_PER_SERVER = 100;

// Rate limiting
export const RATE_LIMIT_MESSAGES_PER_MINUTE = 30;
export const RATE_LIMIT_API_PER_MINUTE = 60;

// Soundboard
export const SOUNDBOARD_MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const SOUNDBOARD_MAX_DURATION_MS = 20_000; // 20s
export const SOUNDBOARD_MAX_DURATION_S = 20;
export const SOUNDBOARD_ALLOWED_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/webm',
] as const;

// Encryption (libsodium constants)
export const NACL_SECRETBOX_KEY_BYTES = 32;
export const NACL_SECRETBOX_NONCE_BYTES = 24;
export const NACL_SECRETBOX_MAC_BYTES = 16;
export const X25519_PUBLIC_KEY_BYTES = 32;
export const X25519_SECRET_KEY_BYTES = 32;
export const NACL_SEALEDBOX_OVERHEAD = 48;
