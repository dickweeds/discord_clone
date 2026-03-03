import type { FastifyInstance } from 'fastify';
import {
  getAllSounds,
  getSoundById,
  requestUploadUrl,
  getDownloadUrl,
  deleteSound,
  initSoundboardService,
  SoundNotFoundError,
  SoundValidationError,
  SoundPermissionError,
} from './soundboardService.js';
import { getAuthenticatedUser } from '../auth/authMiddleware.js';

const soundResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    fileSize: { type: 'number' },
    durationMs: { type: 'number' },
    mimeType: { type: 'string' },
    uploadedBy: { type: 'string' },
    uploadedByUsername: { type: 'string' },
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

export default async function soundboardRoutes(fastify: FastifyInstance) {
  initSoundboardService(fastify.log);

  // GET / — List all sounds
  fastify.get('/', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['data', 'count'],
          properties: {
            data: { type: 'array', items: soundResponseSchema },
            count: { type: 'number' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const soundList = await getAllSounds(fastify.db);
    const sanitized = soundList.map(({ s3Key: _s3Key, ...rest }) => rest);
    return reply.send({ data: sanitized, count: sanitized.length });
  });

  // POST /upload-url — Request presigned upload URL
  fastify.post('/upload-url', {
    schema: {
      body: {
        type: 'object',
        required: ['fileName', 'contentType', 'fileSize', 'durationMs'],
        additionalProperties: false,
        properties: {
          fileName: { type: 'string', minLength: 1 },
          contentType: { type: 'string' },
          fileSize: { type: 'integer', minimum: 1 },
          durationMs: { type: 'integer', minimum: 1 },
        },
      },
      response: {
        201: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              properties: {
                uploadUrl: { type: 'string' },
                soundId: { type: 'string' },
              },
            },
          },
        },
        400: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { userId } = getAuthenticatedUser(request);
    const { fileName, contentType, fileSize, durationMs } = request.body as {
      fileName: string;
      contentType: string;
      fileSize: number;
      durationMs: number;
    };

    try {
      const result = await requestUploadUrl(fastify.db, userId, fileName, contentType, fileSize, durationMs);
      return reply.status(201).send({ data: { uploadUrl: result.uploadUrl, soundId: result.soundId } });
    } catch (err) {
      if (err instanceof SoundValidationError) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: err.message },
        });
      }
      throw err;
    }
  });

  // GET /:soundId/download-url — Get presigned download URL
  fastify.get('/:soundId/download-url', {
    schema: {
      params: {
        type: 'object',
        required: ['soundId'],
        properties: { soundId: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              properties: { downloadUrl: { type: 'string' } },
            },
          },
        },
        404: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { soundId } = request.params as { soundId: string };
    const sound = await getSoundById(fastify.db, soundId);
    if (!sound) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Sound not found' },
      });
    }

    const downloadUrl = await getDownloadUrl(sound.s3Key);
    return reply.send({ data: { downloadUrl } });
  });

  // DELETE /:soundId — Delete a sound
  fastify.delete('/:soundId', {
    schema: {
      params: {
        type: 'object',
        required: ['soundId'],
        properties: { soundId: { type: 'string', format: 'uuid' } },
      },
      response: {
        204: { type: 'null', description: 'Sound deleted' },
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { userId, role } = getAuthenticatedUser(request);
    const { soundId } = request.params as { soundId: string };

    try {
      await deleteSound(fastify.db, soundId, userId, role);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof SoundNotFoundError) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err instanceof SoundPermissionError) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: err.message },
        });
      }
      throw err;
    }
  });
}
