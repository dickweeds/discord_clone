import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { Writable } from 'stream';

/**
 * Pino Redaction: Verifies that sensitive fields are redacted in log output.
 * Uses the same redaction config as server/src/app.ts.
 */

const REDACT_CONFIG = {
  paths: [
    'req.headers.authorization',
    'req.body.password',
    'req.body.encryptedContent',
    'req.body.encrypted_content',
    'req.body.nonce',
    'encrypted_content',
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

function createLogCapture(): { stream: Writable; getOutput: () => string } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  return {
    stream,
    getOutput: () => Buffer.concat(chunks).toString('utf-8'),
  };
}

describe('Pino Log Redaction', () => {
  it('redacts password field from log output', async () => {
    const { stream, getOutput } = createLogCapture();
    const app = Fastify({
      logger: {
        level: 'info',
        redact: REDACT_CONFIG,
        stream,
      },
    });

    app.log.info({ password: 'super-secret-password' }, 'test log');
    await app.close();

    const output = getOutput();
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('super-secret-password');
  });

  it('redacts encrypted_content and nonce from log output', async () => {
    const { stream, getOutput } = createLogCapture();
    const app = Fastify({
      logger: {
        level: 'info',
        redact: REDACT_CONFIG,
        stream,
      },
    });

    app.log.info(
      { encrypted_content: 'base64-ciphertext-data', nonce: 'random-nonce-value' },
      'message received',
    );
    await app.close();

    const output = getOutput();
    expect(output).not.toContain('base64-ciphertext-data');
    expect(output).not.toContain('random-nonce-value');
    expect(output).toContain('[REDACTED]');
  });

  it('Fastify default request serializer does not leak authorization header', async () => {
    const { stream, getOutput } = createLogCapture();
    const app = Fastify({
      logger: {
        level: 'debug',
        redact: REDACT_CONFIG,
        stream,
      },
    });

    app.get('/test', async () => {
      return { data: { ok: true } };
    });

    await app.ready();
    await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer jwt-token-secret' },
    });
    await app.close();

    const output = getOutput();
    // Fastify's built-in req serializer strips headers from request logs.
    // The req.headers.authorization redaction path acts as an additional safety net.
    // Verify the authorization token never appears in any log line.
    expect(output).not.toContain('jwt-token-secret');
  });

  it('redacts token and key fields from log output', async () => {
    const { stream, getOutput } = createLogCapture();
    const app = Fastify({
      logger: {
        level: 'info',
        redact: REDACT_CONFIG,
        stream,
      },
    });

    app.log.info(
      {
        refreshToken: 'refresh-token-value',
        accessToken: 'access-token-value',
        groupEncryptionKey: 'encryption-key-value',
        privateKey: 'private-key-value',
        secret: 'secret-value',
      },
      'sensitive data test',
    );
    await app.close();

    const output = getOutput();
    expect(output).not.toContain('refresh-token-value');
    expect(output).not.toContain('access-token-value');
    expect(output).not.toContain('encryption-key-value');
    expect(output).not.toContain('private-key-value');
    expect(output).not.toContain('secret-value');
  });

  it('does not redact non-sensitive fields', async () => {
    const { stream, getOutput } = createLogCapture();
    const app = Fastify({
      logger: {
        level: 'info',
        redact: REDACT_CONFIG,
        stream,
      },
    });

    app.log.info({ channelId: 'channel-123', userId: 'user-456' }, 'normal log');
    await app.close();

    const output = getOutput();
    expect(output).toContain('channel-123');
    expect(output).toContain('user-456');
  });
});
