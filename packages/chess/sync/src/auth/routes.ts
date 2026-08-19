import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  EXCHANGE_TTL_MS,
  hashPassword,
  newId,
  randomHex,
  sha256Hex,
  verifyPassword,
} from '../crypto.js';
import { sessions, users } from '../db/schema.js';
import { errorBody, HttpError } from '../errors.js';
import type { AppState } from '../types.js';
import {
  clearSessionCookies,
  createSession,
  issueTokenResponse,
  mapUser,
  resolveUser,
  setSessionCookies,
} from './session.js';

const PREFLIGHT = {
  methods: {
    password: { available: true },
    magicLink: { available: false },
    oauth: { available: false, providers: [] as string[] },
    passkey: { available: false, discoverable: false },
  },
};

function sendHttpError(reply: FastifyReply, error: HttpError) {
  return reply.status(error.body.status).send(error.body);
}

function isNative(request: FastifyRequest) {
  return request.headers['x-affine-client-kind'] === 'native';
}

function readEmailPassword(body: unknown) {
  if (!body || typeof body !== 'object') return {};
  const rec = body as Record<string, unknown>;
  return {
    email: typeof rec.email === 'string' ? rec.email.trim() : undefined,
    password: typeof rec.password === 'string' ? rec.password : undefined,
  };
}

function assertPasswordLength(password: string) {
  if (password.length < 8 || password.length > 32) {
    throw new HttpError(
      400,
      'INVALID_PASSWORD_LENGTH',
      'Password must be 8-32 characters'
    );
  }
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  state: AppState
) {
  app.get('/api/auth/session', async (request, reply) => {
    try {
      const user = await resolveUser(state, request);
      return { user: user ? { id: user.id } : null };
    } catch (error) {
      if (error instanceof HttpError) return await sendHttpError(reply, error);
      throw error;
    }
  });

  app.get('/api/auth/methods', async (request, reply) => {
    try {
      const user = await resolveUser(state, request);
      if (!user) {
        return {
          password: { bound: false },
          oauth: { bound: false, providers: [] },
          passkey: { bound: false, count: 0 },
        };
      }
      return {
        password: { bound: true },
        oauth: { bound: false, providers: [] },
        passkey: { bound: false, count: 0 },
      };
    } catch (error) {
      if (error instanceof HttpError) return await sendHttpError(reply, error);
      throw error;
    }
  });

  app.post('/api/auth/preflight', async request => {
    const { email } = readEmailPassword(request.body);
    if (!email) {
      return { registered: false, ...PREFLIGHT };
    }
    const [user] = await state.db.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
    return { registered: Boolean(user), ...PREFLIGHT };
  });

  app.post('/api/auth/sign-in', async (request, reply) => {
    try {
      const { email, password } = readEmailPassword(request.body);
      if (!email) {
        throw new HttpError(400, 'INVALID_EMAIL', 'Email is required');
      }
      if (!password) {
        throw new HttpError(
          400,
          'ACTION_FORBIDDEN',
          'Magic link is not available'
        );
      }
      const normalized = email.toLowerCase();
      const [existing] = await state.db.db
        .select()
        .from(users)
        .where(eq(users.email, normalized));
      let user = existing ? mapUser(existing) : null;
      if (!user) {
        assertPasswordLength(password);
        const [created] = await state.db.db
          .insert(users)
          .values({
            id: newId(),
            email: normalized,
            name: email.split('@')[0] ?? email,
            passwordHash: await hashPassword(password),
          })
          .returning();
        if (!created) {
          throw new HttpError(
            500,
            'INTERNAL_SERVER_ERROR',
            'Failed to create user'
          );
        }
        user = mapUser(created);
      } else if (!(await verifyPassword(password, user.passwordHash))) {
        throw new HttpError(400, 'INVALID_PASSWORD', 'Invalid password');
      }

      const profile = {
        id: user.id,
        email: user.email,
        name: user.name,
        hasPassword: true,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
      };

      if (isNative(request)) {
        const exchangeCode = randomHex(32);
        await createSession(state, user.id, {
          exchangeCodeHash: sha256Hex(exchangeCode),
        });
        return { ...profile, exchangeCode };
      }

      const session = await createSession(state, user.id);
      setSessionCookies(reply, session.id, user.id, session.csrf);
      return profile;
    } catch (error) {
      if (error instanceof HttpError) return await sendHttpError(reply, error);
      throw error;
    }
  });

  app.post('/api/auth/sign-out', async (request, reply) => {
    const csrfCookie = request.cookies?.affine_csrf_token;
    if (csrfCookie) {
      const header = request.headers['x-affine-csrf-token'];
      if (header !== csrfCookie) {
        return reply
          .status(400)
          .send(errorBody(400, 'INVALID_AUTH_STATE', 'CSRF token mismatch'));
      }
    }
    const sessionId = request.cookies?.affine_session;
    if (sessionId) {
      await state.db.db.delete(sessions).where(eq(sessions.id, sessionId));
    }
    clearSessionCookies(reply);
    return { ok: true };
  });

  app.post('/api/auth/session/exchange', async (request, reply) => {
    try {
      const body = request.body as {
        code?: string;
        installationId?: string;
      };
      if (!body?.code) {
        throw new HttpError(400, 'INVALID_AUTH_STATE', 'Missing exchange code');
      }
      const hash = sha256Hex(body.code);
      const [session] = await state.db.db
        .select()
        .from(sessions)
        .where(eq(sessions.exchangeCodeHash, hash));
      if (
        !session ||
        session.createdAt.getTime() + EXCHANGE_TTL_MS < Date.now()
      ) {
        throw new HttpError(400, 'INVALID_AUTH_STATE', 'Exchange code invalid');
      }
      await state.db.db.delete(sessions).where(eq(sessions.id, session.id));
      return await issueTokenResponse(state, session.userId);
    } catch (error) {
      if (error instanceof HttpError) return await sendHttpError(reply, error);
      throw error;
    }
  });

  app.post('/api/auth/session/refresh', async (request, reply) => {
    try {
      const body = request.body as { refreshToken?: string };
      if (!body?.refreshToken) {
        throw new HttpError(
          400,
          'REFRESH_TOKEN_INVALID',
          'Missing refresh token'
        );
      }
      const hash = sha256Hex(body.refreshToken);
      const [session] = await state.db.db
        .select()
        .from(sessions)
        .where(eq(sessions.refreshHash, hash));
      if (!session) {
        throw new HttpError(
          400,
          'REFRESH_TOKEN_INVALID',
          'Refresh token invalid'
        );
      }
      await state.db.db.delete(sessions).where(eq(sessions.id, session.id));
      return await issueTokenResponse(state, session.userId);
    } catch (error) {
      if (error instanceof HttpError) return await sendHttpError(reply, error);
      throw error;
    }
  });

  app.post('/api/auth/session/revoke', async request => {
    const body = request.body as { refreshToken?: string };
    if (body?.refreshToken) {
      await state.db.db
        .delete(sessions)
        .where(eq(sessions.refreshHash, sha256Hex(body.refreshToken)));
    }
    return { ok: true };
  });

  app.post('/api/auth/change-password', async (request, reply) => {
    try {
      const user = await resolveUser(state, request);
      if (!user) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const body = request.body as {
        oldPassword?: string;
        newPassword?: string;
      };
      if (!body.oldPassword || !body.newPassword) {
        throw new HttpError(400, 'INVALID_PASSWORD', 'Password required');
      }
      assertPasswordLength(body.newPassword);
      if (!(await verifyPassword(body.oldPassword, user.passwordHash))) {
        throw new HttpError(400, 'INVALID_PASSWORD', 'Invalid password');
      }
      await state.db.db
        .update(users)
        .set({ passwordHash: await hashPassword(body.newPassword) })
        .where(eq(users.id, user.id));
      return { ok: true };
    } catch (error) {
      if (error instanceof HttpError) return await sendHttpError(reply, error);
      throw error;
    }
  });

  app.get('/api/auth/sessions', async () => []);

  app.post('/api/auth/magic-link', async (_request, reply) => {
    return reply
      .status(400)
      .send(errorBody(400, 'ACTION_FORBIDDEN', 'Magic link is not available'));
  });
}
