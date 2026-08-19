import { createHash, randomBytes } from 'node:crypto';

import { hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';
import { nanoid } from 'nanoid';

import { HttpError } from './errors.js';

export const ACCESS_TTL_SEC = 900;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const EXCHANGE_TTL_MS = 2 * 60 * 1000;

export function newId() {
  return nanoid();
}

export function randomHex(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashPassword(password: string) {
  return hash(password);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return verify(passwordHash, password);
}

export async function signAccessToken(
  secret: Uint8Array,
  userId: string,
  sessionId: string
) {
  return new SignJWT({ typ: 'access', sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(secret);
}

export type AccessClaims = {
  sub: string;
  sid: string;
};

export async function verifyAccessToken(secret: Uint8Array, token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    const sub = payload.sub;
    const sid =
      typeof payload.sid === 'string'
        ? payload.sid
        : typeof payload.jti === 'string'
          ? payload.jti
          : undefined;
    if (!sub || !sid) {
      throw new HttpError(401, 'ACCESS_TOKEN_INVALID', 'Access token invalid');
    }
    return { sub, sid } satisfies AccessClaims;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const name = error instanceof Error ? error.name : '';
    if (name === 'JWTExpired') {
      throw new HttpError(401, 'ACCESS_TOKEN_EXPIRED', 'Access token expired');
    }
    throw new HttpError(401, 'ACCESS_TOKEN_INVALID', 'Access token invalid');
  }
}

export function later(ms: number) {
  return new Date(Date.now() + ms);
}
