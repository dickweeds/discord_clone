import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('JWT_ACCESS_SECRET', 'test-secret-key-for-testing');

import { hashPassword, verifyPassword, generateAccessToken, verifyAccessToken } from './authService.js';

describe('authService', () => {
  describe('hashPassword', () => {
    it('should produce a valid bcrypt hash', async () => {
      const hash = await hashPassword('myPassword123');
      expect(hash).toMatch(/^\$2b\$12\$/);
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
      const payload = { userId: 'user-123', role: 'user' };
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
      const token = generateAccessToken({ userId: 'user-1', role: 'user' });
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyAccessToken(tampered)).toThrow();
    });
  });
});
