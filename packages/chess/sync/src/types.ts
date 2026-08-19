import type { FastifyInstance } from 'fastify';

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
};

export type GqlContext = {
  app: FastifyInstance;
  state: AppState;
  user: UserRow | null;
  origin: string;
};
