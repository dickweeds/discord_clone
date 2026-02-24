import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { users, invites, bans } from '../../db/schema.js';
import { hashPassword, verifyPassword, generateAccessToken } from './authService.js';
import { validateInvite } from '../invites/inviteService.js';

interface RegisterBody {
  username: string;
  password: string;
  inviteToken: string;
}

interface LoginBody {
  username: string;
  password: string;
}

export default fp(async (fastify: FastifyInstance) => {
  // POST /api/auth/register — PUBLIC
  fastify.post<{ Body: RegisterBody }>('/api/auth/register', {
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
    const { username: rawUsername, password, inviteToken } = request.body;
    const username = rawUsername.trim().toLowerCase();

    if (username.length === 0) {
      return reply.status(400).send({
        error: { code: 'INVALID_USERNAME', message: 'Username cannot be blank.' },
      });
    }

    // 1. Validate invite token (using shared service — no duplicated logic)
    const inviteResult = validateInvite(fastify.db, inviteToken);
    if (!inviteResult.valid) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_INVITE',
          message: 'This invite is no longer valid. Ask the server owner for a new one.',
        },
      });
    }

    // 2. Hash password before entering transaction (async, yields event loop)
    const passwordHash = await hashPassword(password);

    // 3. All DB mutations in a transaction for atomicity
    const result = fastify.db.transaction((tx) => {
      // 3a. Check bans (lightweight username-based check)
      const bannedUser = tx
        .select({ userId: bans.user_id })
        .from(bans)
        .innerJoin(users, eq(bans.user_id, users.id))
        .where(eq(users.username, username))
        .get();

      if (bannedUser) {
        return { error: 'REGISTRATION_BLOCKED' } as const;
      }

      // 3b. Check username uniqueness (fast-path before INSERT)
      const existingUser = tx
        .select()
        .from(users)
        .where(eq(users.username, username))
        .get();

      if (existingUser) {
        return { error: 'USERNAME_TAKEN' } as const;
      }

      // 3c. Insert user
      try {
        const newUser = tx
          .insert(users)
          .values({
            username,
            password_hash: passwordHash,
            role: 'user',
          })
          .returning()
          .get();

        // 3d. Revoke invite token (single-use)
        tx.update(invites)
          .set({ revoked: true })
          .where(eq(invites.token, inviteToken))
          .run();

        return { error: null, user: newUser } as const;
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('UNIQUE constraint failed: users.username')) {
          return { error: 'USERNAME_TAKEN' } as const;
        }
        throw err;
      }
    });

    if (result.error === 'REGISTRATION_BLOCKED') {
      return reply.status(403).send({
        error: {
          code: 'REGISTRATION_BLOCKED',
          message: 'Registration is not available for this account.',
        },
      });
    }

    if (result.error === 'USERNAME_TAKEN') {
      return reply.status(409).send({
        error: {
          code: 'USERNAME_TAKEN',
          message: 'That username is taken. Try another.',
        },
      });
    }

    return reply.status(201).send({
      data: {
        user: {
          id: result.user.id,
          username: result.user.username,
          role: result.user.role,
          createdAt: result.user.created_at.toISOString(),
        },
      },
    });
  });

  // POST /api/auth/login — PUBLIC (minimal for this story)
  fastify.post<{ Body: LoginBody }>('/api/auth/login', {
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
    const { username, password } = request.body;

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

    // 2. Check bans (before expensive bcrypt)
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

    // 3. Verify password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
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
