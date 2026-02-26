import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { sql } from 'drizzle-orm';
import dbPlugin from './plugins/db.js';
import authMiddleware from './plugins/auth/authMiddleware.js';
import authRoutes from './plugins/auth/authRoutes.js';
import inviteRoutes from './plugins/invites/inviteRoutes.js';
import channelRoutes from './plugins/channels/channelRoutes.js';
import userRoutes from './plugins/users/userRoutes.js';
import messageRoutes from './plugins/messages/messageRoutes.js';
import adminRoutes from './plugins/admin/adminRoutes.js';
import wsServer from './ws/wsServer.js';
import { initMediasoup, setLogger, closeMediasoup } from './plugins/voice/mediasoupManager.js';
import { registerVoiceHandlers } from './plugins/voice/voiceWsHandler.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
      redact: {
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
      },
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // --- Infrastructure Plugins (register BEFORE domain plugins) ---
  await app.register(cors, {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });
  await app.register(dbPlugin);

  // --- mediasoup Worker + Router ---
  setLogger(app.log);
  await initMediasoup();

  // --- Auth & Domain Plugins ---
  await app.register(authMiddleware);
  await app.register(authRoutes);
  await app.register(inviteRoutes);
  await app.register(channelRoutes, { prefix: '/api/channels' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(messageRoutes, { prefix: '/api/channels' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(wsServer);

  // --- Voice WS Handlers (after wsServer registers the WebSocket endpoint) ---
  registerVoiceHandlers(app.db, app.log);

  // Graceful shutdown: close mediasoup
  app.addHook('onClose', async () => {
    await closeMediasoup();
  });

  app.get('/api/health', async (_request, reply) => {
    try {
      app.db.get(sql`SELECT 1 as result`);
      return { data: { status: 'ok', database: 'connected' } };
    } catch {
      return reply.status(503).send({
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unreachable' },
      });
    }
  });

  return app;
}
