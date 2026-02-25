import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { getAllUsers } from './userService.js';

export default fp(async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/api/users', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['data', 'count'],
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'username', 'role', 'createdAt'],
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  role: { type: 'string', enum: ['owner', 'user'] },
                  createdAt: { type: 'string' },
                },
              },
            },
            count: { type: 'number' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const userList = getAllUsers(fastify.db);
    return reply.send({ data: userList, count: userList.length });
  });
}, { name: 'user-routes' });
