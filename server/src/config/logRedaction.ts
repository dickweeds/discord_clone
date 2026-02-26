import type { LoggerOptions } from 'pino';

export const LOG_REDACT_CONFIG: LoggerOptions['redact'] = {
  paths: [
    'req.headers.authorization',
    'req.body.password',
    'req.body.encryptedContent',
    'req.body.encrypted_content',
    'req.body.nonce',
    'encrypted_content',
    'encryptedContent',
    'nonce',
    'password',
    'passwordHash',
    'password_hash',
    'refreshToken',
    'refresh_token',
    'accessToken',
    'access_token',
    'groupEncryptionKey',
    'privateKey',
    'secret',
  ],
  censor: '[REDACTED]',
};
