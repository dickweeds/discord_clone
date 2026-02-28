import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { users, sessions, invites, bans, channels } from './schema.js';

describe('Database Schema', () => {
  it('exports all 5 tables', () => {
    expect(users).toBeDefined();
    expect(sessions).toBeDefined();
    expect(invites).toBeDefined();
    expect(bans).toBeDefined();
    expect(channels).toBeDefined();
  });

  describe('users table', () => {
    it('has correct table name', () => {
      const config = getTableConfig(users);
      expect(config.name).toBe('users');
    });

    it('has all required columns', () => {
      const config = getTableConfig(users);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('username');
      expect(columnNames).toContain('password_hash');
      expect(columnNames).toContain('role');
      expect(columnNames).toContain('public_key');
      expect(columnNames).toContain('encrypted_group_key');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toHaveLength(7);
    });
  });

  describe('sessions table', () => {
    it('has correct table name', () => {
      const config = getTableConfig(sessions);
      expect(config.name).toBe('sessions');
    });

    it('has all required columns', () => {
      const config = getTableConfig(sessions);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('refresh_token_hash');
      expect(columnNames).toContain('expires_at');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toHaveLength(5);
    });
  });

  describe('invites table', () => {
    it('has correct table name', () => {
      const config = getTableConfig(invites);
      expect(config.name).toBe('invites');
    });

    it('has all required columns', () => {
      const config = getTableConfig(invites);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('token');
      expect(columnNames).toContain('created_by');
      expect(columnNames).toContain('revoked');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toHaveLength(5);
    });
  });

  describe('bans table', () => {
    it('has correct table name', () => {
      const config = getTableConfig(bans);
      expect(config.name).toBe('bans');
    });

    it('has all required columns', () => {
      const config = getTableConfig(bans);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('banned_by');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toHaveLength(4);
    });
  });

  describe('channels table', () => {
    it('has correct table name', () => {
      const config = getTableConfig(channels);
      expect(config.name).toBe('channels');
    });

    it('has all required columns', () => {
      const config = getTableConfig(channels);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('type');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toHaveLength(4);
    });
  });

});
