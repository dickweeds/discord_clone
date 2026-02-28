import type { FastifyInstance } from 'fastify';
import { getAllUsers } from './userService.js';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
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
                  role: { type: 'string' },
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
    const userList = await getAllUsers(fastify.db);
    return reply.send({ data: userList, count: userList.length });
  });
}
