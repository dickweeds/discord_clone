import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const BCRYPT_COST_FACTOR = process.env.NODE_ENV === 'test' ? 1 : 12;

if (!process.env.JWT_ACCESS_SECRET) {
  throw new Error('JWT_ACCESS_SECRET environment variable is required');
}
const JWT_ACCESS_SECRET: string = process.env.JWT_ACCESS_SECRET;

if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET environment variable is required');
}
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET;

export interface JwtPayload {
  userId: string;
  role: string;
  username: string;
  iat: number;
  exp: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: { userId: string; role: string; username: string }): string {
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
  if (typeof decoded === 'string' || !decoded.userId || !decoded.role || !decoded.username) {
    throw new Error('Invalid token payload structure');
  }
  return decoded as unknown as JwtPayload;
}

export function generateRefreshToken(payload: { userId: string; role: string; username: string }): string {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
  if (typeof decoded === 'string' || !decoded.userId || !decoded.role || !decoded.username) {
    throw new Error('Invalid token payload structure');
  }
  return decoded as unknown as JwtPayload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
