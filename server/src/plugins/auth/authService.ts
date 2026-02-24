import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const BCRYPT_COST_FACTOR = 12;

export interface JwtPayload {
  userId: string;
  role: string;
  iat: number;
  exp: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: { userId: string; role: string }): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET environment variable is required');
  }
  return jwt.sign(payload, secret, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): JwtPayload {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET environment variable is required');
  }
  return jwt.verify(token, secret) as JwtPayload;
}
