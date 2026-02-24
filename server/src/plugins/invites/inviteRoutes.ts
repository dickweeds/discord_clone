import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { requireOwner } from '../auth/authMiddleware.js';
import { createInvite, revokeInvite, validateInvite, getInvites } from './inviteService.js';

export default fp(async (fastify: FastifyInstance) => {
  // POST /api/invites — owner-only
  fastify.post('/api/invites', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    const invite = createInvite(fastify.db, request.user!.userId);
    return reply.status(201).send({
      data: {
        id: invite.id,
        token: invite.token,
        createdAt: invite.created_at.toISOString(),
      },
    });
  });

  // DELETE /api/invites/:id — owner-only
  fastify.delete<{ Params: { id: string } }>('/api/invites/:id', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    revokeInvite(fastify.db, request.params.id);
    return reply.status(204).send();
  });

  // GET /api/invites/:token/validate — public
  fastify.get<{ Params: { token: string } }>('/api/invites/:token/validate', async (request, reply) => {
    const result = validateInvite(fastify.db, request.params.token);
    if (!result.valid) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_INVITE',
          message: 'This invite is no longer valid. Ask the server owner for a new one.',
        },
      });
    }
    return reply.status(200).send({
      data: { valid: true, serverName: result.serverName },
    });
  });

  // GET /api/invites — owner-only
  fastify.get('/api/invites', {
    preHandler: [requireOwner],
  }, async (_request, _reply) => {
    const allInvites = getInvites(fastify.db);
    return {
      data: allInvites.map(inv => ({
        id: inv.id,
        token: inv.token,
        revoked: inv.revoked,
        createdBy: inv.created_by,
        createdAt: inv.created_at.toISOString(),
      })),
      count: allInvites.length,
    };
  });
}, { name: 'invite-routes' });
