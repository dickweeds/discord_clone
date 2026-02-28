import type { FastifyInstance } from 'fastify';
import { WS_TYPES } from 'discord-clone-shared';
import { getAllChannels, createChannel, deleteChannel, ChannelNotFoundError, ChannelValidationError } from './channelService.js';
import { broadcastToAll } from '../../ws/wsServer.js';

const channelResponseSchema = {
  type: 'object',
  required: ['id', 'name', 'type', 'createdAt'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    createdAt: { type: 'string' },
  },
} as const;

const errorResponseSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
} as const;

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
              items: channelResponseSchema,
            },
            count: { type: 'number' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const channelList = await getAllChannels(fastify.db);
    return reply.send({ data: channelList, count: channelList.length });
  });

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          type: { type: 'string', enum: ['text', 'voice'] },
        },
      },
      response: {
        201: {
          type: 'object',
          required: ['data'],
          properties: {
            data: channelResponseSchema,
          },
        },
        400: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    if (request.user?.role !== 'owner') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the server owner can perform this action' },
      });
    }

    const { name, type } = request.body as { name: string; type: 'text' | 'voice' };

    let channel;
    try {
      channel = await createChannel(fastify.db, name.toLowerCase().replace(/\s+/g, '-'), type);
    } catch (err) {
      if (err instanceof ChannelValidationError) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: err.message },
        });
      }
      throw err;
    }

    broadcastToAll({ type: WS_TYPES.CHANNEL_CREATED, payload: { channel } }, fastify.log);
    return reply.status(201).send({ data: channel });
  });

  fastify.delete('/:channelId', {
    schema: {
      params: {
        type: 'object',
        required: ['channelId'],
        properties: {
          channelId: { type: 'string' },
        },
      },
      response: {
        204: { type: 'null', description: 'Channel deleted' },
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    if (request.user?.role !== 'owner') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the server owner can perform this action' },
      });
    }

    const { channelId } = request.params as { channelId: string };
    try {
      await deleteChannel(fastify.db, channelId);
    } catch (err) {
      if (err instanceof ChannelNotFoundError) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Channel not found' },
        });
      }
      throw err;
    }

    broadcastToAll({ type: WS_TYPES.CHANNEL_DELETED, payload: { channelId } }, fastify.log);
    return reply.status(204).send();
  });
}
