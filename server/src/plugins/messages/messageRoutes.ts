import type { FastifyInstance } from 'fastify';
import { getMessagesByChannel } from './messageService.js';

export default async function messageRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { channelId: string };
    Querystring: { limit?: number; before?: string };
  }>('/:channelId/messages', {
    schema: {
      params: {
        type: 'object',
        required: ['channelId'],
        properties: {
          channelId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          before: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          required: ['data', 'count'],
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                required: ['messageId', 'channelId', 'authorId', 'content', 'nonce', 'createdAt'],
                properties: {
                  messageId: { type: 'string' },
                  channelId: { type: 'string' },
                  authorId: { type: 'string' },
                  content: { type: 'string' },
                  nonce: { type: 'string' },
                  createdAt: { type: 'string' },
                },
              },
            },
            count: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { channelId } = request.params;
    const { limit, before } = request.query;

    const rows = getMessagesByChannel(fastify.db, channelId, limit, before);

    const data = rows.map((row) => ({
      messageId: row.id,
      channelId: row.channel_id,
      authorId: row.user_id,
      content: row.encrypted_content,
      nonce: row.nonce,
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at as unknown as number * 1000).toISOString(),
    }));

    return reply.send({ data, count: data.length });
  });
}
