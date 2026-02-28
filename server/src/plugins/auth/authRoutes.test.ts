import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GROUP_ENCRYPTION_KEY = 'rSxlHxEjeJC7RY079zu0Kg9fHWEIdAtGE4s76zAI9Rw';
});

import { setupApp, seedOwner, seedInvite } from '../../test/helpers.js';
import { hashPassword, generateRefreshToken, hashToken } from './authService.js';
import { users, bans, invites, sessions, channels } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import sodium from 'libsodium-wrappers';

async function loginUser(app: FastifyInstance, username: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  return response.json().data;
}

describe('authRoutes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('should register a user with a valid invite', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.user.username).toBe('jordan');
      expect(body.data.user.role).toBe('user');
      expect(body.data.user.id).toBeDefined();
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
    });

    it('should normalize username by trimming and lowercasing', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: '  Jordan  ',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.user.username).toBe('jordan');
    });

    it('should revoke invite token after successful registration', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      // Verify invite is now revoked
      const [invite] = await app.db.select().from(invites)
        .where(eq(invites.token, 'valid-invite-token'));
      expect(invite!.revoked).toBe(true);

      // Trying to use the same invite again should fail
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'anotheruser',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INVITE');
    });

    it('should return 400 INVALID_INVITE for invalid invite token', async () => {
      app = await setupApp();
      await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'nonexistent-token',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INVITE');
    });

    it('should return 400 INVALID_INVITE for revoked invite token', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId, 'revoked-token');

      await app.db.update(invites)
        .set({ revoked: true })
        .where(eq(invites.token, 'revoked-token'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'revoked-token',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INVITE');
    });

    it('should return 409 USERNAME_TAKEN for duplicate username', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId, 'invite-1');
      await seedInvite(app, ownerId, 'invite-2');

      // Register first user (revokes invite-1)
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'invite-1',
        },
      });

      // Try to register with same username using invite-2
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'differentpass123',
          inviteToken: 'invite-2',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('USERNAME_TAKEN');
    });

    it('should return 403 when banned user tries to register', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      // Create a user and ban them
      const bannedHash = await hashPassword('banned123');
      const [bannedUser] = await app.db.insert(users).values({
        username: 'banneduser',
        password_hash: bannedHash,
        role: 'user',
      }).returning();

      await app.db.insert(bans).values({
        user_id: bannedUser.id,
        banned_by: ownerId,
      });

      // Try to register with the banned username
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'banneduser',
          password: 'newpassword123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('REGISTRATION_BLOCKED');
    });

    it('should return 400 for missing fields', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for password exceeding 72 characters', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'a'.repeat(73),
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should register with publicKey and return encryptedGroupKey', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      await sodium.ready;
      const keypair = sodium.crypto_box_keypair();
      const publicKeyB64 = sodium.to_base64(keypair.publicKey);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
          publicKey: publicKeyB64,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.user.username).toBe('jordan');
      expect(body.data.encryptedGroupKey).toBeDefined();
      expect(typeof body.data.encryptedGroupKey).toBe('string');

      // Verify the encrypted group key can be decrypted
      const sealed = sodium.from_base64(body.data.encryptedGroupKey);
      const decrypted = sodium.crypto_box_seal_open(sealed, keypair.publicKey, keypair.privateKey);
      const expectedGroupKey = sodium.from_base64(process.env.GROUP_ENCRYPTION_KEY!);
      expect(sodium.to_base64(decrypted)).toBe(sodium.to_base64(expectedGroupKey));

      // Verify DB has both columns stored
      const [user] = await app.db.select().from(users).where(eq(users.username, 'jordan'));
      expect(user!.public_key).toBe(publicKeyB64);
      expect(user!.encrypted_group_key).toBe(body.data.encryptedGroupKey);
    });

    it('should register without publicKey (backward compatibility)', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.encryptedGroupKey).toBeNull();

      const [user] = await app.db.select().from(users).where(eq(users.username, 'jordan'));
      expect(user!.public_key).toBeNull();
      expect(user!.encrypted_group_key).toBeNull();
    });

    it('should return 400 for invalid publicKey (wrong length)', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      await sodium.ready;
      // 16 bytes instead of 32
      const shortKey = sodium.to_base64(sodium.randombytes_buf(16));

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
          publicKey: shortKey,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_PUBLIC_KEY');
    });

    it('should return 400 for invalid publicKey (not base64)', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
          publicKey: 'not-valid-base64!!!@@@',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_PUBLIC_KEY');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and return access + refresh tokens', async () => {
      app = await setupApp();
      await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'owner',
          password: 'ownerPass123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
      expect(body.data.user.username).toBe('owner');
      expect(body.data.user.role).toBe('owner');
    });

    it('should normalize username on login (trim + lowercase)', async () => {
      app = await setupApp();
      await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: '  Owner  ',
          password: 'ownerPass123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.user.username).toBe('owner');
    });

    it('should return 401 for wrong password', async () => {
      app = await setupApp();
      await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'owner',
          password: 'wrongPassword',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 401 for nonexistent user', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'nobody',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 403 for banned user (ban checked before password)', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);

      // Create and ban a user
      const userHash = await hashPassword('userpass123');
      const [regularUser] = await app.db.insert(users).values({
        username: 'banneduser',
        password_hash: userHash,
        role: 'user',
      }).returning();

      await app.db.insert(bans).values({
        user_id: regularUser.id,
        banned_by: ownerId,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'banneduser',
          password: 'userpass123',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('ACCOUNT_BANNED');
    });

    it('should create a session in the database on login', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');
      const tokenHash = hashToken(loginData.refreshToken);

      const [session] = await app.db.select().from(sessions)
        .where(eq(sessions.refresh_token_hash, tokenHash));
      expect(session).toBeDefined();
      expect(session!.user_id).toBe(loginData.user.id);
    });

    it('should return encryptedGroupKey in login response when user has one', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);
      await seedInvite(app, ownerId);

      await sodium.ready;
      const keypair = sodium.crypto_box_keypair();
      const publicKeyB64 = sodium.to_base64(keypair.publicKey);

      // Register with publicKey
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'jordan',
          password: 'password123',
          inviteToken: 'valid-invite-token',
          publicKey: publicKeyB64,
        },
      });

      // Login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'jordan', password: 'password123' },
      });

      expect(loginResponse.statusCode).toBe(200);
      const body = loginResponse.json();
      expect(body.data.encryptedGroupKey).toBeDefined();
      expect(typeof body.data.encryptedGroupKey).toBe('string');
    });

    it('should return null encryptedGroupKey when user has no encryption setup', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'owner', password: 'ownerPass123' },
      });

      expect(loginResponse.statusCode).toBe(200);
      expect(loginResponse.json().data.encryptedGroupKey).toBeNull();
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return new token pair with valid refresh token', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: loginData.refreshToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
      // New tokens should be different from old ones
      expect(body.data.refreshToken).not.toBe(loginData.refreshToken);
    });

    it('should rotate tokens (old refresh token becomes invalid after use)', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');
      const oldRefreshToken = loginData.refreshToken;

      // First refresh should succeed
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: oldRefreshToken },
      });
      expect(response1.statusCode).toBe(200);

      // Second refresh with the same (old) token should fail
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: oldRefreshToken },
      });
      expect(response2.statusCode).toBe(401);
      expect(response2.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should return 401 for invalid refresh token', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'not-a-valid-jwt' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should return 401 for expired session', async () => {
      app = await setupApp();
      const { id: ownerId } = await seedOwner(app);

      // Create a refresh token and session manually with expired date
      const refreshToken = generateRefreshToken({ userId: ownerId, role: 'owner', username: 'owner' });
      const tokenHash = hashToken(refreshToken);
      await app.db.insert(sessions).values({
        user_id: ownerId,
        refresh_token_hash: tokenHash,
        expires_at: new Date(Date.now() - 1000), // expired
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should not require auth middleware (public route)', async () => {
      app = await setupApp();

      // Call refresh without Authorization header — should get 401 from our handler, not from middleware
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'some-token' },
      });

      // Should get INVALID_REFRESH_TOKEN (our endpoint), not UNAUTHORIZED (middleware)
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should return 400 for missing refreshToken field', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 204 and delete the session', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${loginData.accessToken}` },
        payload: { refreshToken: loginData.refreshToken },
      });

      expect(response.statusCode).toBe(204);

      // Verify session was deleted
      const tokenHash = hashToken(loginData.refreshToken);
      const [session] = await app.db.select().from(sessions)
        .where(eq(sessions.refresh_token_hash, tokenHash));
      expect(session).toBeUndefined();
    });

    it('should return 204 even if session not found (idempotent)', async () => {
      app = await setupApp();
      const { token: ownerToken } = await seedOwner(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { refreshToken: 'nonexistent-refresh-token-value' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 401 without auth (requires access token)', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refreshToken: 'some-token' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('should invalidate the refresh token after logout', async () => {
      app = await setupApp();
      await seedOwner(app);

      const loginData = await loginUser(app, 'owner', 'ownerPass123');

      // Logout
      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${loginData.accessToken}` },
        payload: { refreshToken: loginData.refreshToken },
      });

      // Try to refresh with the now-deleted session's token
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: loginData.refreshToken },
      });

      expect(refreshResponse.statusCode).toBe(401);
      expect(refreshResponse.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('GET /api/server/status', () => {
    it('should return needsSetup: true when no users exist', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'GET',
        url: '/api/server/status',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.needsSetup).toBe(true);
    });

    it('should return needsSetup: false when users exist', async () => {
      app = await setupApp();
      await seedOwner(app);

      const response = await app.inject({
        method: 'GET',
        url: '/api/server/status',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.needsSetup).toBe(false);
    });

    it('should not require authentication', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'GET',
        url: '/api/server/status',
      });

      // Should get 200, not 401 UNAUTHORIZED
      expect(response.statusCode).toBe(200);
    });
  });

  describe('First-user setup (register without invite)', () => {
    it('should register first user as owner without invite token', async () => {
      app = await setupApp();

      await sodium.ready;
      const keypair = sodium.crypto_box_keypair();
      const publicKeyB64 = sodium.to_base64(keypair.publicKey);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'firstuser',
          password: 'password123',
          publicKey: publicKeyB64,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.user.role).toBe('owner');
      expect(body.data.user.username).toBe('firstuser');
    });

    it('should return encryptedGroupKey for first user', async () => {
      app = await setupApp();

      await sodium.ready;
      const keypair = sodium.crypto_box_keypair();
      const publicKeyB64 = sodium.to_base64(keypair.publicKey);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'firstuser',
          password: 'password123',
          publicKey: publicKeyB64,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.encryptedGroupKey).toBeDefined();
      expect(typeof body.data.encryptedGroupKey).toBe('string');

      // Verify decryptable
      const sealed = sodium.from_base64(body.data.encryptedGroupKey);
      const decrypted = sodium.crypto_box_seal_open(sealed, keypair.publicKey, keypair.privateKey);
      const expectedGroupKey = sodium.from_base64(process.env.GROUP_ENCRYPTION_KEY!);
      expect(sodium.to_base64(decrypted)).toBe(sodium.to_base64(expectedGroupKey));
    });

    it('should create default channels during first-user setup', async () => {
      app = await setupApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'firstuser',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(201);

      const allChannels = await app.db.select().from(channels);
      expect(allChannels).toHaveLength(2);

      const general = allChannels.find(c => c.name === 'general');
      const gaming = allChannels.find(c => c.name === 'Gaming');
      expect(general).toBeDefined();
      expect(general!.type).toBe('text');
      expect(gaming).toBeDefined();
      expect(gaming!.type).toBe('voice');
    });

    it('should reject second user without invite token', async () => {
      app = await setupApp();

      // Register first user (becomes owner)
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'firstuser',
          password: 'password123',
        },
      });

      // Try to register second user without invite
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'seconduser',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INVITE');
    });

    it('should allow second user with valid invite as role user', async () => {
      app = await setupApp();

      // Register first user (becomes owner)
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'firstuser',
          password: 'password123',
        },
      });
      const ownerId = setupResponse.json().data.user.id;

      // Create invite
      await seedInvite(app, ownerId);

      // Register second user with invite
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'seconduser',
          password: 'password123',
          inviteToken: 'valid-invite-token',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.user.role).toBe('user');
    });
  });
});
