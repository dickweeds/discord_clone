import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WS_TYPES } from 'discord-clone-shared';
import { requireOwner } from '../auth/authMiddleware.js';
import {
  kickUser, banUser, unbanUser, resetPassword, getBannedUsers,
  UserNotFoundError, BanNotFoundError, UserAlreadyBannedError,
} from './adminService.js';
import { getClients, getClientByUserId, removeClientByUserId } from '../../ws/wsServer.js';
import { broadcastPresenceUpdate, broadcastMemberRemoved } from '../presence/presenceService.js';

interface UserIdParams {
  userId: string;
}

const userIdParamsSchema = {
  type: 'object' as const,
  required: ['userId'],
  properties: {
    userId: { type: 'string' as const },
  },
};

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireOwner);

  // POST /kick/:userId
  fastify.post<{ Params: UserIdParams }>('/kick/:userId', {
    schema: { params: userIdParamsSchema },
  }, async (request: FastifyRequest<{ Params: UserIdParams }>, reply: FastifyReply) => {
    const { userId } = request.params;
    if (userId === request.user!.userId) {
      return reply.status(400).send({
        error: { code: 'INVALID_ACTION', message: 'Cannot perform this action on yourself' },
      });
    }

    try {
      await kickUser(fastify.db, userId);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      throw err;
    }

    // Send WS notification to kicked user, then close their connection
    const ws = getClientByUserId(userId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: WS_TYPES.USER_KICKED, payload: { userId } }));
      ws.close(4003, 'Kicked by admin');
    }
    removeClientByUserId(userId);

    // Broadcast presence offline + member removed to remaining clients
    const clients = getClients();
    broadcastPresenceUpdate(clients, userId, 'offline');
    broadcastMemberRemoved(clients, userId);

    return reply.status(204).send();
  });

  // POST /ban/:userId
  fastify.post<{ Params: UserIdParams }>('/ban/:userId', {
    schema: { params: userIdParamsSchema },
  }, async (request: FastifyRequest<{ Params: UserIdParams }>, reply: FastifyReply) => {
    const { userId } = request.params;
    if (userId === request.user!.userId) {
      return reply.status(400).send({
        error: { code: 'INVALID_ACTION', message: 'Cannot perform this action on yourself' },
      });
    }

    try {
      await banUser(fastify.db, userId, request.user!.userId);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      if (err instanceof UserAlreadyBannedError) {
        return reply.status(400).send({ error: { code: 'ALREADY_BANNED', message: 'User is already banned' } });
      }
      throw err;
    }

    // Send WS notification to banned user, then close their connection
    const ws = getClientByUserId(userId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: WS_TYPES.USER_BANNED, payload: { userId } }));
      ws.close(4003, 'Banned by admin');
    }
    removeClientByUserId(userId);

    // Broadcast presence offline + member removed to remaining clients
    const clients = getClients();
    broadcastPresenceUpdate(clients, userId, 'offline');
    broadcastMemberRemoved(clients, userId);

    return reply.status(204).send();
  });

  // POST /unban/:userId
  fastify.post<{ Params: UserIdParams }>('/unban/:userId', {
    schema: { params: userIdParamsSchema },
  }, async (request: FastifyRequest<{ Params: UserIdParams }>, reply: FastifyReply) => {
    const { userId } = request.params;

    try {
      await unbanUser(fastify.db, userId);
    } catch (err) {
      if (err instanceof BanNotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ban not found' } });
      }
      throw err;
    }

    return reply.status(204).send();
  });

  // POST /reset-password/:userId
  fastify.post<{ Params: UserIdParams }>('/reset-password/:userId', {
    schema: { params: userIdParamsSchema },
  }, async (request: FastifyRequest<{ Params: UserIdParams }>, reply: FastifyReply) => {
    const { userId } = request.params;
    if (userId === request.user!.userId) {
      return reply.status(400).send({
        error: { code: 'INVALID_ACTION', message: 'Cannot perform this action on yourself' },
      });
    }

    let temporaryPassword: string;
    try {
      temporaryPassword = await resetPassword(fastify.db, userId);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      throw err;
    }

    return reply.status(200).send({ data: { temporaryPassword } });
  });

  // GET /bans
  fastify.get('/bans', async (_request: FastifyRequest, reply: FastifyReply) => {
    const bannedUsers = await getBannedUsers(fastify.db);
    return reply.send({ data: bannedUsers, count: bannedUsers.length });
  });
}
