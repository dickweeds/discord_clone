import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { channels } from '../../db/schema.js';
import { getMessagesByChannel, InvalidCursorError } from './messageService.js';
import { getReactionsForMessages } from './reactionService.js';

export default async function messageRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { channelId: string };
    Querystring: { limit?: number; cursor?: string };
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
          cursor: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          required: ['data', 'cursor', 'count'],
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
                  reactions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        emoji: { type: 'string' },
                        count: { type: 'integer' },
                        userIds: { type: 'array', items: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
            cursor: { type: ['string', 'null'] },
            count: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { channelId } = request.params;
    const { limit, cursor } = request.query;

    // Validate channel exists
    const [channel] = await fastify.db.select().from(channels).where(eq(channels.id, channelId));
    if (!channel) {
      return reply.status(404).send({
        error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel does not exist' },
      });
    }

    try {
      const { rows, nextCursor } = await getMessagesByChannel(fastify.db, channelId, limit, cursor);

      const messageIds = rows.map((r) => r.id);
      const reactionsMap = await getReactionsForMessages(fastify.db, messageIds);

      const data = rows.map((row) => ({
        messageId: row.id,
        channelId: row.channel_id,
        authorId: row.user_id,
        content: row.encrypted_content,
        nonce: row.nonce,
        createdAt: row.created_at.toISOString(),
        reactions: reactionsMap.get(row.id) ?? [],
      }));

      return reply.send({ data, cursor: nextCursor, count: data.length });
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return reply.code(400).send({ error: { code: 'INVALID_CURSOR', message: 'Malformed pagination cursor' } });
      }
      throw err;
    }
  });
}
