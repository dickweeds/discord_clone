import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
});

import { hashPassword, verifyPassword, generateAccessToken, verifyAccessToken, generateRefreshToken, verifyRefreshToken, hashToken } from './authService.js';

describe('authService', () => {
  describe('hashPassword', () => {
    it('should produce a valid bcrypt hash', async () => {
      const hash = await hashPassword('myPassword123');
      expect(hash).toMatch(/^\$2b\$\d{2}\$/);
    });

    it('should produce different hashes for the same password', async () => {
      const hash1 = await hashPassword('samePassword');
      const hash2 = await hashPassword('samePassword');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const hash = await hashPassword('correctPassword');
      const result = await verifyPassword('correctPassword', hash);
      expect(result).toBe(true);
    });

    it('should return false for wrong password', async () => {
      const hash = await hashPassword('correctPassword');
      const result = await verifyPassword('wrongPassword', hash);
      expect(result).toBe(false);
    });
  });

  describe('generateAccessToken / verifyAccessToken', () => {
    it('should generate and verify a token roundtrip', () => {
      const payload = { userId: 'user-123', role: 'user', username: 'testuser' };
      const token = generateAccessToken(payload);
      const decoded = verifyAccessToken(token);

      expect(decoded.userId).toBe('user-123');
      expect(decoded.role).toBe('user');
      expect(decoded.iat).toBeTypeOf('number');
      expect(decoded.exp).toBeTypeOf('number');
      expect(decoded.exp - decoded.iat).toBe(15 * 60); // 15 minutes
    });

    it('should fail verification with an invalid token', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow();
    });

    it('should fail verification with a tampered token', () => {
      const token = generateAccessToken({ userId: 'user-1', role: 'user', username: 'testuser1' });
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyAccessToken(tampered)).toThrow();
    });
  });

  describe('generateRefreshToken / verifyRefreshToken', () => {
    it('should generate and verify a refresh token roundtrip', () => {
      const payload = { userId: 'user-456', role: 'user', username: 'testuser456' };
      const token = generateRefreshToken(payload);
      const decoded = verifyRefreshToken(token);

      expect(decoded.userId).toBe('user-456');
      expect(decoded.role).toBe('user');
      expect(decoded.iat).toBeTypeOf('number');
      expect(decoded.exp).toBeTypeOf('number');
      expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60); // 7 days
    });

    it('should fail verification with an invalid token', () => {
      expect(() => verifyRefreshToken('invalid.token.here')).toThrow();
    });

    it('should fail verification with an access token (wrong secret)', () => {
      const accessToken = generateAccessToken({ userId: 'user-1', role: 'user', username: 'testuser1' });
      expect(() => verifyRefreshToken(accessToken)).toThrow();
    });

    it('should fail verification with a tampered token', () => {
      const token = generateRefreshToken({ userId: 'user-1', role: 'user', username: 'testuser1' });
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyRefreshToken(tampered)).toThrow();
    });
  });

  describe('hashToken', () => {
    it('should produce a consistent SHA-256 hex hash', () => {
      const hash1 = hashToken('my-refresh-token');
      const hash2 = hashToken('my-refresh-token');
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different tokens', () => {
      const hash1 = hashToken('token-a');
      const hash2 = hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });
});
