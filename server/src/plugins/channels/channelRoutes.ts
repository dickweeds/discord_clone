import type { FastifyInstance } from 'fastify';
import { getAllChannels } from './channelService.js';

export default async function channelRoutes(fastify: FastifyInstance) {
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
                required: ['id', 'name', 'type', 'createdAt'],
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string' },
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
    const channelList = getAllChannels(fastify.db);
    return reply.send({ data: channelList, count: channelList.length });
  });
}
