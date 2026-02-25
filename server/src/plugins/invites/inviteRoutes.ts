import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { requireOwner, getAuthenticatedUser } from '../auth/authMiddleware.js';
import { createInvite, revokeInvite, validateInvite, getInvites } from './inviteService.js';

export default fp(async (fastify: FastifyInstance) => {
  // POST /api/invites — owner-only
  fastify.post('/api/invites', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    const user = getAuthenticatedUser(request);
    const invite = createInvite(fastify.db, user.userId);
    return reply.status(201).send({
      data: {
        id: invite.id,
        token: invite.token,
        createdBy: invite.created_by,
        revoked: false,
        createdAt: invite.created_at.toISOString(),
      },
    });
  });

  // DELETE /api/invites/:id — owner-only
  fastify.delete<{ Params: { id: string } }>('/api/invites/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', minLength: 1 } },
      },
    },
    preHandler: [requireOwner],
  }, async (request, reply) => {
    const revoked = revokeInvite(fastify.db, request.params.id);
    if (!revoked) {
      return reply.status(404).send({
        error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found' },
      });
    }
    return reply.status(204).send();
  });

  // GET /api/invites/:token/validate — public
  fastify.get<{ Params: { token: string } }>('/api/invites/:token/validate', {
    schema: {
      params: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request, reply) => {
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
  }, async (_request, reply) => {
    const allInvites = getInvites(fastify.db);
    return reply.status(200).send({
      data: allInvites.map(inv => ({
        id: inv.id,
        token: inv.token,
        revoked: inv.revoked,
        createdBy: inv.created_by,
        createdAt: inv.created_at.toISOString(),
      })),
      count: allInvites.length,
    });
  });
}, { name: 'invite-routes' });
