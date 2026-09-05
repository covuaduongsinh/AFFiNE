import cookie from '@fastify/cookie';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import * as Y from 'yjs';

import { userFromSessionId } from '../auth/session.js';
import { verifyAccessToken } from '../crypto.js';
import { inviteLinks, members, users } from '../db/schema.js';
import type { AppState, UserRow } from '../types.js';
import { getMember, workspacePermissions } from '../workspace.js';
import {
  base64ToBytes,
  bytesToBase64,
  deleteDoc,
  hasDoc,
  lastTimestamps,
  loadYDoc,
  pushUpdate,
  releaseDoc,
} from './docs.js';

type AwareEntry = {
  spaceType: string;
  spaceId: string;
  docId: string;
  update: string;
};

const awareness = new Map<string, AwareEntry>();
const subscriptions = new Map<
  string,
  { socketId: string; topic: string; input: unknown }
>();

function ackData(ack: ((res: unknown) => void) | undefined, data: unknown) {
  ack?.({ data });
}

function ackError(
  ack: ((res: unknown) => void) | undefined,
  name: string,
  message: string
) {
  ack?.({ error: { name, message } });
}

function spaceRoom(spaceType: string, spaceId: string) {
  return `space:${spaceType}:${spaceId}`;
}

function awareRoom(spaceType: string, spaceId: string, docId: string) {
  return `aware:${spaceType}:${spaceId}:${docId}`;
}

/**
 * `join` and `leave` return a promise with a clustered adapter and plain
 * `void` with the in-memory one we run. Calling `.catch` on the result is a
 * crash waiting for the first client that uses awareness, so normalise it
 * where the caller only wants fire-and-forget.
 */
function ignoreResult(result: Promise<void> | void) {
  void Promise.resolve(result).catch(() => {});
}

/**
 * A browser cannot put a token in the handshake. Web sign-in hands out a
 * session cookie and nothing else, and that cookie is httpOnly precisely so
 * the page cannot read it back out to pass along here. What the page can do
 * is connect to its own origin, and then the handshake carries the cookie by
 * itself. Native clients keep using the token, which is their only option
 * from a different origin.
 */
async function userFromSocket(state: AppState, socket: Socket) {
  const auth = socket.handshake.auth as { token?: string };
  if (auth?.token) {
    const claims = await verifyAccessToken(state.db.jwtSecret, auth.token);
    return await userFromSessionId(state, claims.sid);
  }
  const header = socket.handshake.headers.cookie;
  if (!header) return null;
  const sessionId = cookie.parse(header).affine_session;
  return sessionId ? await userFromSessionId(state, sessionId) : null;
}

function quotaState(now: Date, extra: Record<string, unknown>) {
  return {
    plan: 'Free',
    sourceEntitlementId: null,
    blobLimit: 104857600,
    storageQuota: 10737418240,
    usedStorageQuota: 0,
    historyPeriodSeconds: 0,
    flags: {},
    known: true,
    stale: false,
    lastReconciledAt: null,
    staleAfter: null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

async function handleRealtime(
  state: AppState,
  user: UserRow | null,
  op: string,
  input: Record<string, unknown>
) {
  if (op.startsWith('copilot.')) {
    return { error: { name: 'ACTION_FORBIDDEN', message: 'not available' } };
  }
  const now = new Date();
  switch (op) {
    case 'user.profile.get':
      return {
        data: {
          user: user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                hasPassword: true,
                avatarUrl: user.avatarUrl,
                features: [],
              }
            : null,
        },
      };
    case 'user.settings.get':
      return {
        data: {
          settings: {
            receiveInvitationEmail: false,
            receiveMentionEmail: false,
            receiveCommentEmail: false,
          },
        },
      };
    case 'user.quota-state.get':
      return {
        data: {
          state: quotaState(now, {
            userId: user?.id ?? '',
            copilotActionLimit: null,
          }),
        },
      };
    case 'notification.count.get':
      return { data: { count: 0 } };
    case 'workspace.access.get': {
      const workspaceId = String(input.workspaceId ?? '');
      const member = user
        ? await getMember(state, workspaceId, user.id)
        : undefined;
      const role = member?.role ?? 'External';
      return {
        data: {
          access: {
            role,
            permissions: workspacePermissions(role),
            team: false,
          },
        },
      };
    }
    case 'workspace.config.get':
      return {
        data: {
          config: {
            enableAi: false,
            enableSharing: false,
            enableUrlPreview: false,
            enableDocEmbedding: false,
          },
        },
      };
    case 'workspace.members.get': {
      const workspaceId = String(input.workspaceId ?? '');
      const skip = Number(input.skip ?? 0);
      const take = Math.min(Number(input.take ?? 100), 100);
      const query = typeof input.query === 'string' ? input.query : '';
      const rows = await state.db.db
        .select({
          userId: members.userId,
          role: members.role,
          status: members.status,
          inviteId: members.inviteId,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          emailVerified: users.emailVerified,
        })
        .from(members)
        .innerJoin(users, eq(users.id, members.userId))
        .where(
          query
            ? and(
                eq(members.workspaceId, workspaceId),
                or(
                  ilike(users.name, `%${query}%`),
                  ilike(users.email, `%${query}%`)
                )
              )
            : eq(members.workspaceId, workspaceId)
        );
      const page = rows.slice(skip, skip + take);
      return {
        data: {
          members: page.map(row => ({
            id: row.userId,
            name: row.name,
            email: row.email,
            avatarUrl: row.avatarUrl,
            permission: row.role,
            role: row.role,
            inviteId: row.inviteId,
            emailVerified: row.emailVerified,
            status: row.status,
          })),
          memberCount: rows.length,
        },
      };
    }
    case 'workspace.invite-link.get': {
      const workspaceId = String(input.workspaceId ?? '');
      const [row] = await state.db.db
        .select()
        .from(inviteLinks)
        .where(eq(inviteLinks.workspaceId, workspaceId));
      return {
        data: {
          inviteLink: row
            ? {
                link: `/invite/${row.token}`,
                expireTime: row.expireTime.toISOString(),
              }
            : null,
        },
      };
    }
    case 'workspace.quota-state.get': {
      const workspaceId = String(input.workspaceId ?? '');
      const [count] = await state.db.db
        .select({ n: sql<number>`count(*)` })
        .from(members)
        .where(eq(members.workspaceId, workspaceId));
      const owner = await state.db.db
        .select()
        .from(members)
        .where(
          and(eq(members.workspaceId, workspaceId), eq(members.role, 'Owner'))
        );
      return {
        data: {
          state: quotaState(now, {
            workspaceId,
            ownerUserId: owner[0]?.userId ?? null,
            usesOwnerQuota: true,
            seatLimit: 50,
            memberCount: Number(count?.n ?? 0),
            overcapacityMemberCount: 0,
            readonly: false,
            readonlyReasons: [],
          }),
        },
      };
    }
    case 'workspace.embedding.progress.get':
      return { data: { total: 0, embedded: 0 } };
    case 'doc.share-state.get':
      return {
        data: {
          state: { public: false, mode: 'Page', defaultRole: 'Editor' },
        },
      };
    case 'doc.grants.get':
      return {
        data: {
          totalCount: 0,
          pageInfo: { endCursor: null, hasNextPage: false },
          edges: [],
        },
      };
    case 'comment.changes.get':
      return {
        data: {
          changes: [],
          startCursor: '',
          endCursor: '',
          hasNextPage: false,
        },
      };
    default:
      return { error: { name: 'NOT_FOUND', message: `unknown op ${op}` } };
  }
}

export function attachSocket(app: FastifyInstance, state: AppState) {
  const io = new Server(app.server, {
    transports: ['polling', 'websocket'],
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    userFromSocket(state, socket)
      .then(user => next(user ? undefined : new Error('UNAUTHORIZED')))
      .catch(() => next(new Error('UNAUTHORIZED')));
  });

  io.on('connection', socket => {
    socket.on('space:join', async (payload, ack) => {
      try {
        const user = await userFromSocket(state, socket);
        if (!user) {
          ackError(ack, 'UNAUTHORIZED', 'unauthorized');
          return;
        }
        const member = await getMember(state, payload.spaceId, user.id);
        if (!member || member.status !== 'Accepted') {
          ackError(ack, 'ACCESS_DENIED', 'not a member');
          return;
        }
        await socket.join(spaceRoom(payload.spaceType, payload.spaceId));
        ackData(ack, { clientId: socket.id, success: true });
      } catch (error) {
        ackError(
          ack,
          'INTERNAL',
          error instanceof Error ? error.message : 'join failed'
        );
      }
    });

    socket.on('space:join-batch', async (payload, ack) => {
      try {
        const user = await userFromSocket(state, socket);
        if (!user) {
          ackError(ack, 'UNAUTHORIZED', 'unauthorized');
          return;
        }
        if (Array.isArray(payload.spaces)) {
          for (const sp of payload.spaces) {
            const member = await getMember(state, sp.spaceId, user.id);
            if (member && member.status === 'Accepted') {
              await socket.join(spaceRoom(sp.spaceType, sp.spaceId));
            }
          }
        }
        ackData(ack, { clientId: socket.id, success: true });
      } catch (error) {
        ackError(
          ack,
          'INTERNAL',
          error instanceof Error ? error.message : 'join-batch failed'
        );
      }
    });

    socket.on('space:leave', payload => {
      ignoreResult(socket.leave(spaceRoom(payload.spaceType, payload.spaceId)));
    });

    socket.on('space:load-doc', async (payload, ack) => {
      try {
        if (!(await hasDoc(state, payload.spaceId, payload.docId))) {
          ackError(ack, 'DOC_NOT_FOUND', 'not found');
          return;
        }
        const doc = await loadYDoc(state, payload.spaceId, payload.docId);
        const missing = payload.stateVector
          ? Y.encodeStateAsUpdate(doc, base64ToBytes(payload.stateVector))
          : Y.encodeStateAsUpdate(doc);
        const yState = Y.encodeStateVector(doc);
        const stamps = await lastTimestamps(state, payload.spaceId);
        releaseDoc(payload.spaceId, payload.docId);
        ackData(ack, {
          missing: bytesToBase64(missing),
          state: bytesToBase64(yState),
          timestamp: stamps[payload.docId] ?? Date.now(),
        });
      } catch (error) {
        ackError(
          ack,
          'INTERNAL',
          error instanceof Error ? error.message : 'load failed'
        );
      }
    });

    socket.on('space:push-doc-update', async (payload, ack) => {
      try {
        const user = await userFromSocket(state, socket);
        if (!user) {
          ackError(ack, 'UNAUTHORIZED', 'unauthorized');
          return;
        }
        const timestamp = await pushUpdate(
          state,
          payload.spaceId,
          payload.docId,
          base64ToBytes(payload.update),
          user.id
        );
        ackData(ack, { timestamp });
        socket
          .to(spaceRoom(payload.spaceType, payload.spaceId))
          .emit('space:broadcast-doc-updates', {
            spaceType: payload.spaceType,
            spaceId: payload.spaceId,
            docId: payload.docId,
            updates: [payload.update],
            timestamp,
            editor: user.id,
          });
      } catch (error) {
        ackError(
          ack,
          'INTERNAL',
          error instanceof Error ? error.message : 'push failed'
        );
      }
    });

    socket.on('space:load-doc-timestamps', async (payload, ack) => {
      try {
        ackData(
          ack,
          await lastTimestamps(state, payload.spaceId, payload.timestamp)
        );
      } catch (error) {
        ackError(
          ack,
          'INTERNAL',
          error instanceof Error ? error.message : 'timestamps failed'
        );
      }
    });

    socket.on('space:delete-doc', async (payload, ack) => {
      try {
        await deleteDoc(state, payload.spaceId, payload.docId);
        ackData(ack, { success: true });
      } catch (error) {
        ackError(
          ack,
          'INTERNAL',
          error instanceof Error ? error.message : 'delete failed'
        );
      }
    });

    socket.on('space:join-awareness', (payload, ack) => {
      ignoreResult(
        socket.join(
          awareRoom(payload.spaceType, payload.spaceId, payload.docId)
        )
      );
      ackData(ack, { clientId: socket.id, success: true });
      io.to(awareRoom(payload.spaceType, payload.spaceId, payload.docId)).emit(
        'space:collect-awareness',
        {
          spaceType: payload.spaceType,
          spaceId: payload.spaceId,
          docId: payload.docId,
        }
      );
    });

    socket.on('space:leave-awareness', payload => {
      ignoreResult(
        socket.leave(
          awareRoom(payload.spaceType, payload.spaceId, payload.docId)
        )
      );
      awareness.delete(socket.id);
    });

    socket.on('space:update-awareness', payload => {
      awareness.set(socket.id, {
        spaceType: payload.spaceType,
        spaceId: payload.spaceId,
        docId: payload.docId,
        update: payload.awarenessUpdate,
      });
      socket
        .to(awareRoom(payload.spaceType, payload.spaceId, payload.docId))
        .emit('space:broadcast-awareness-update', payload);
    });

    socket.on('space:load-awarenesses', payload => {
      io.to(awareRoom(payload.spaceType, payload.spaceId, payload.docId)).emit(
        'space:collect-awareness',
        payload
      );
    });

    socket.on('telemetry:batch', (payload, ack) => {
      const events = Array.isArray(payload?.events) ? payload.events.length : 0;
      ackData(ack, { ok: true, accepted: events, dropped: 0 });
    });

    socket.on('realtime:request', async (payload, ack) => {
      try {
        const user = await userFromSocket(state, socket);
        const result = await handleRealtime(
          state,
          user,
          payload.op,
          payload.input ?? {}
        );
        ack?.(result);
      } catch (error) {
        ackError(
          ack,
          'INTERNAL',
          error instanceof Error ? error.message : 'request failed'
        );
      }
    });

    socket.on('realtime:subscribe', (payload, ack) => {
      const subscriptionId = payload.subscriptionId ?? socket.id + Date.now();
      subscriptions.set(subscriptionId, {
        socketId: socket.id,
        topic: payload.topic,
        input: payload.input,
      });
      ackData(ack, { subscriptionId });
    });

    socket.on('realtime:unsubscribe', (payload, ack) => {
      if (payload.subscriptionId) subscriptions.delete(payload.subscriptionId);
      ackData(ack, { ok: true });
    });

    socket.on('disconnect', () => {
      awareness.delete(socket.id);
      for (const [id, sub] of subscriptions) {
        if (sub.socketId === socket.id) subscriptions.delete(id);
      }
    });
  });

  return io;
}
