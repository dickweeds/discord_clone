import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { getAuthenticatedUser } from '../auth/authMiddleware.js';
import { WS_TYPES } from 'discord-clone-shared';
import { broadcastToAll } from '../../ws/wsServer.js';
import { getAllUsers, getUserById, updateUserAvatarUrl } from './userService.js';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_PUBLIC_PREFIX = '/uploads/avatars/';
const AVATAR_STORAGE_DIR = process.env.AVATAR_UPLOAD_DIR ?? resolve(process.cwd(), 'storage/avatars');

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

function avatarPathFromUrl(avatarUrl: string): string {
  const safeFilename = basename(avatarUrl);
  return resolve(AVATAR_STORAGE_DIR, safeFilename);
}

async function removeAvatarFile(avatarUrl?: string): Promise<void> {
  if (!avatarUrl || !avatarUrl.startsWith(AVATAR_PUBLIC_PREFIX)) return;
  try {
    await unlink(avatarPathFromUrl(avatarUrl));
  } catch {
    // Best-effort cleanup: avatar metadata remains authoritative.
  }
}

export default async function userRoutes(fastify: FastifyInstance) {
  await mkdir(AVATAR_STORAGE_DIR, { recursive: true });

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
                  avatarUrl: { type: 'string' },
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

  fastify.get('/me', async (request, reply) => {
    const authUser = getAuthenticatedUser(request);
    const user = await getUserById(fastify.db, authUser.userId);
    if (!user) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'User not found.' },
      });
    }

    return reply.send({ data: user });
  });

  fastify.post('/me/avatar', async (request, reply) => {
    const authUser = getAuthenticatedUser(request);
    let filePart;

    try {
      filePart = await request.file({
        limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({
          error: { code: 'AVATAR_TOO_LARGE', message: 'Avatar must be 2MB or smaller.' },
        });
      }
      if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
        return reply.status(400).send({
          error: { code: 'AVATAR_REQUIRED', message: 'Avatar file is required.' },
        });
      }
      throw err;
    }

    if (!filePart) {
      return reply.status(400).send({
        error: { code: 'AVATAR_REQUIRED', message: 'Avatar file is required.' },
      });
    }

    const extension = MIME_TO_EXTENSION[filePart.mimetype];
    if (!extension) {
      return reply.status(415).send({
        error: { code: 'UNSUPPORTED_IMAGE_TYPE', message: 'Supported formats: PNG, JPEG, WEBP.' },
      });
    }

    const filename = `${authUser.userId}-${randomUUID()}${extension}`;
    const avatarUrl = `${AVATAR_PUBLIC_PREFIX}${filename}`;
    const filePath = resolve(AVATAR_STORAGE_DIR, filename);

    await pipeline(filePart.file, createWriteStream(filePath));

    const existing = await getUserById(fastify.db, authUser.userId);
    const previousAvatarUrl = existing?.avatarUrl;

    const updated = await updateUserAvatarUrl(fastify.db, authUser.userId, avatarUrl);
    if (!updated) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'User not found.' },
      });
    }

    await removeAvatarFile(previousAvatarUrl);

    broadcastToAll({
      type: WS_TYPES.USER_UPDATE,
      payload: {
        userId: authUser.userId,
        avatarUrl,
      },
    }, fastify.log);

    return reply.send({ data: updated });
  });

  fastify.delete('/me/avatar', async (request, reply) => {
    const authUser = getAuthenticatedUser(request);
    const existing = await getUserById(fastify.db, authUser.userId);
    if (!existing) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'User not found.' },
      });
    }

    const updated = await updateUserAvatarUrl(fastify.db, authUser.userId, null);
    if (!updated) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'User not found.' },
      });
    }

    await removeAvatarFile(existing.avatarUrl);

    broadcastToAll({
      type: WS_TYPES.USER_UPDATE,
      payload: {
        userId: authUser.userId,
      },
    }, fastify.log);

    return reply.send({ data: updated });
  });
}
