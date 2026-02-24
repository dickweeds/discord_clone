import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { users, invites, bans } from '../../db/schema.js';
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken, hashToken, verifyRefreshToken } from './authService.js';
import { validateInvite } from '../invites/inviteService.js';
import { createSession, findSessionByTokenHash, deleteSession } from './sessionService.js';
import { getAuthenticatedUser } from './authMiddleware.js';

interface RegisterBody {
  username: string;
  password: string;
  inviteToken: string;
}

interface LoginBody {
  username: string;
  password: string;
}

interface RefreshBody {
  refreshToken: string;
}

interface LogoutBody {
  refreshToken: string;
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

  // POST /api/auth/login — PUBLIC
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
    const { username: rawUsername, password } = request.body;
    const username = rawUsername.trim().toLowerCase();

    // 1. Look up user
    const user = fastify.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get();

    if (!user) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' },
      });
    }

    // 2. Check bans (before expensive bcrypt — timing attack prevention)
    const ban = fastify.db
      .select()
      .from(bans)
      .where(eq(bans.user_id, user.id))
      .get();

    if (ban) {
      return reply.status(403).send({
        error: { code: 'ACCOUNT_BANNED', message: 'This account has been banned.' },
      });
    }

    // 3. Verify password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' },
      });
    }

    // 4. Generate tokens
    const tokenPayload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // 5. Create session in DB (hash refresh token before storing)
    createSession(fastify.db, user.id, refreshToken);

    return reply.status(200).send({
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
    });
  });
  // POST /api/auth/refresh — PUBLIC (requires valid refresh token in body)
  fastify.post<{ Body: RefreshBody }>('/api/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body;

    // 1. Verify the JWT signature + expiry
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return reply.status(401).send({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token.' },
      });
    }

    // 2. Hash incoming token, find matching session in DB
    const tokenHash = hashToken(refreshToken);
    const session = findSessionByTokenHash(fastify.db, tokenHash);

    if (!session) {
      return reply.status(401).send({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token.' },
      });
    }

    // 3. Verify session not expired
    if (session.expires_at < new Date()) {
      deleteSession(fastify.db, session.id);
      return reply.status(401).send({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token.' },
      });
    }

    // 4. Token rotation: delete old session, create new session with new tokens
    deleteSession(fastify.db, session.id);

    const tokenPayload = { userId: payload.userId, role: payload.role };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    createSession(fastify.db, payload.userId, newRefreshToken);

    return reply.status(200).send({
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  });

  // POST /api/auth/logout — AUTHENTICATED
  fastify.post<{ Body: LogoutBody }>('/api/auth/logout', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    getAuthenticatedUser(request);
    const { refreshToken } = request.body;

    // Hash the refresh token, find and delete the matching session
    const tokenHash = hashToken(refreshToken);
    const session = findSessionByTokenHash(fastify.db, tokenHash);

    if (session) {
      deleteSession(fastify.db, session.id);
    }

    // Return 204 regardless (idempotent — don't leak session existence)
    return reply.status(204).send();
  });
}, { name: 'auth-routes' });
