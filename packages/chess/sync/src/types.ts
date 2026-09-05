import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';

import type { DbHandle } from './db/client.js';

export type UserRow = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  emailVerified: boolean;
  avatarUrl: string | null;
};

export type MemberRow = {
  workspaceId: string;
  userId: string;
  role: string;
  status: string;
  inviteId: string;
};

export type AppState = {
  db: DbHandle;
  host: string;
  port: number;
  baseUrl: string;
  /** Configured public address, or '' to derive one per request. */
  publicOrigin: string;
  /** Lower-cased emails allowed to sign in. Empty means anyone. */
  allowedEmails: string[];
  io?: Server;
};

export type GqlContext = {
  app: FastifyInstance;
  state: AppState;
  user: UserRow | null;
  origin: string;
};
