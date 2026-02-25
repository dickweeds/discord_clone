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
import wsServer from './ws/wsServer.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // --- Infrastructure Plugins (register BEFORE domain plugins) ---
  await app.register(cors, { origin: true, credentials: true });
  await app.register(dbPlugin);

  // --- Auth & Domain Plugins ---
  await app.register(authMiddleware);
  await app.register(authRoutes);
  await app.register(inviteRoutes);
  await app.register(channelRoutes, { prefix: '/api/channels' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(messageRoutes, { prefix: '/api/channels' });
  await app.register(wsServer);

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
