import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { users, invites, bans } from '../../db/schema.js';
import { hashPassword, verifyPassword, generateAccessToken } from './authService.js';

export default fp(async (fastify: FastifyInstance) => {
  // POST /api/auth/register — PUBLIC
  fastify.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password', 'inviteToken'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 32 },
          password: { type: 'string', minLength: 8, maxLength: 72 },
          inviteToken: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { username, password, inviteToken } = request.body as {
      username: string;
      password: string;
      inviteToken: string;
    };

    // 1. Validate invite token
    const invite = fastify.db
      .select()
      .from(invites)
      .where(eq(invites.token, inviteToken))
      .get();

    if (!invite || invite.revoked) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_INVITE',
          message: 'This invite is no longer valid. Ask the server owner for a new one.',
        },
      });
    }

    // 2. Check bans (lightweight username-based check — must run before username uniqueness)
    const bannedUser = fastify.db
      .select({ userId: bans.user_id })
      .from(bans)
      .innerJoin(users, eq(bans.user_id, users.id))
      .where(eq(users.username, username))
      .get();

    if (bannedUser) {
      return reply.status(403).send({
        error: {
          code: 'REGISTRATION_BLOCKED',
          message: 'Registration is not available for this account.',
        },
      });
    }

    // 3. Check username uniqueness
    const existingUser = fastify.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get();

    if (existingUser) {
      return reply.status(409).send({
        error: {
          code: 'USERNAME_TAKEN',
          message: 'That username is taken. Try another.',
        },
      });
    }

    // 4. Hash password
    const passwordHash = await hashPassword(password);

    // 5. Insert user
    const newUser = fastify.db
      .insert(users)
      .values({
        username,
        password_hash: passwordHash,
        role: 'user',
      })
      .returning()
      .get();

    return reply.status(201).send({
      data: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        createdAt: newUser.created_at.toISOString(),
      },
    });
  });

  // POST /api/auth/login — PUBLIC (minimal for this story)
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body as {
      username: string;
      password: string;
    };

    // 1. Look up user
    const user = fastify.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get();

    if (!user) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      });
    }

    // 2. Verify password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      });
    }

    // 3. Check bans
    const ban = fastify.db
      .select()
      .from(bans)
      .where(eq(bans.user_id, user.id))
      .get();

    if (ban) {
      return reply.status(403).send({
        error: { code: 'ACCOUNT_BANNED', message: 'This account has been banned' },
      });
    }

    // 4. Generate access token
    const accessToken = generateAccessToken({ userId: user.id, role: user.role });

    return reply.status(200).send({
      data: {
        accessToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
    });
  });
}, { name: 'auth-routes' });
