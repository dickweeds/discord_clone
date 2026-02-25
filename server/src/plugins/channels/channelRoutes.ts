import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { getAllChannels } from './channelService.js';

export default fp(async function channelRoutes(fastify: FastifyInstance) {
  fastify.get('/api/channels', {
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
                required: ['id', 'serverId', 'name', 'type', 'position', 'createdAt', 'updatedAt'],
                properties: {
                  id: { type: 'string' },
                  serverId: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['text', 'voice'] },
                  position: { type: 'number' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
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
}, { name: 'channel-routes' });
