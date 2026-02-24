import fp from 'fastify-plugin';
import { verifyAccessToken } from './authService.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/health',
];

const PUBLIC_ROUTE_PATTERNS = [
  /^\/api\/invites\/[^/]+\/validate$/,
];

export default fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0];
    if (PUBLIC_ROUTES.includes(url)) return;
    if (PUBLIC_ROUTE_PATTERNS.some(p => p.test(url))) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    try {
      const token = authHeader.slice(7);
      const payload = verifyAccessToken(token);
      request.user = { userId: payload.userId, role: payload.role };
    } catch {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
    }
  });
}, { name: 'auth-middleware' });

export async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user || request.user.role !== 'owner') {
    return reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'Owner access required' },
    });
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: { userId: string; role: string } | null;
  }
}
