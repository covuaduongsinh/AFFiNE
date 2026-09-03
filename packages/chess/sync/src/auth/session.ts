import { and, eq, gt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  ACCESS_TTL_SEC,
  later,
  newId,
  randomHex,
  SESSION_TTL_MS,
  sha256Hex,
  signAccessToken,
  verifyAccessToken,
} from '../crypto.js';
import { sessions, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { AppState, UserRow } from '../types.js';

const COOKIE_MAX_AGE = 2592000;

export function setSessionCookies(
  state: AppState,
  reply: FastifyReply,
  sessionId: string,
  userId: string,
  csrf: string
) {
  const opts = {
    path: '/',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    // Tied to the configured address rather than NODE_ENV: what decides this
    // is whether the URL people actually load is https, and a local run over
    // plain http must still be able to sign in.
    secure: state.publicOrigin.startsWith('https://'),
  };
  reply.setCookie('affine_session', sessionId, { ...opts, httpOnly: true });
  reply.setCookie('affine_user_id', userId, opts);
  reply.setCookie('affine_csrf_token', csrf, opts);
}

export function clearSessionCookies(reply: FastifyReply) {
  const opts = { path: '/' };
  reply.clearCookie('affine_session', opts);
  reply.clearCookie('affine_user_id', opts);
  reply.clearCookie('affine_csrf_token', opts);
}

export async function createSession(
  state: AppState,
  userId: string,
  extras: {
    refreshHash?: string | null;
    exchangeCodeHash?: string | null;
    installationId?: string | null;
  } = {}
) {
  const id = newId();
  const csrf = randomHex(16);
  const expiresAt = later(SESSION_TTL_MS);
  await state.db.db.insert(sessions).values({
    id,
    userId,
    csrf,
    refreshHash: extras.refreshHash ?? null,
    exchangeCodeHash: extras.exchangeCodeHash ?? null,
    installationId: extras.installationId ?? null,
    expiresAt,
    refreshExpiresAt: extras.refreshHash ? expiresAt : null,
  });
  return { id, csrf, expiresAt };
}

export async function issueTokenResponse(state: AppState, userId: string) {
  const refreshToken = randomHex(32);
  const session = await createSession(state, userId, {
    refreshHash: sha256Hex(refreshToken),
  });
  const accessToken = await signAccessToken(
    state.db.jwtSecret,
    userId,
    session.id
  );
  return {
    tokenType: 'Bearer' as const,
    accessToken,
    expiresIn: ACCESS_TTL_SEC,
    refreshToken,
    refreshExpiresAt: session.expiresAt.toISOString(),
    session: {
      id: session.id,
      absoluteExpiresAt: session.expiresAt.toISOString(),
    },
  };
}

export function mapUser(row: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  emailVerified: boolean;
  avatarUrl: string | null;
}): UserRow {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    emailVerified: row.emailVerified,
    avatarUrl: row.avatarUrl,
  };
}

/**
 * Resolves the user behind a live session id.
 *
 * Both ways in end here: the cookie carries the session id directly, and an
 * access token carries it as `sid`. Keeping the lookup in one place is what
 * lets a socket accept either without repeating the expiry check.
 */
export async function userFromSessionId(
  state: AppState,
  sessionId: string
): Promise<UserRow | null> {
  const [session] = await state.db.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));
  if (!session) return null;
  const [user] = await state.db.db
    .select()
    .from(users)
    .where(eq(users.id, session.userId));
  return user ? mapUser(user) : null;
}

export async function resolveUser(
  state: AppState,
  request: FastifyRequest
): Promise<UserRow | null> {
  const auth = request.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const claims = await verifyAccessToken(state.db.jwtSecret, auth.slice(7));
    const [session] = await state.db.db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.id, claims.sid), gt(sessions.expiresAt, new Date()))
      );
    if (!session || session.userId !== claims.sub) {
      throw new HttpError(401, 'ACCESS_TOKEN_INVALID', 'Access token invalid');
    }
    const [user] = await state.db.db
      .select()
      .from(users)
      .where(eq(users.id, claims.sub));
    return user ? mapUser(user) : null;
  }
  const sessionId = request.cookies?.affine_session;
  if (!sessionId) return null;
  return await userFromSessionId(state, sessionId);
}
