import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { NodeFS } from '@electric-sql/pglite/nodefs';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';

import { schema } from './schema.js';

const ENSURE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  email_verified boolean NOT NULL DEFAULT true,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash text,
  csrf text NOT NULL,
  exchange_code_hash text,
  installation_id text,
  expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS members (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'Accepted',
  invite_id text NOT NULL UNIQUE,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS invites (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'Collaborator',
  status text NOT NULL DEFAULT 'Pending',
  invited_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invite_links (
  workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expire_time timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS doc_updates (
  id bigserial PRIMARY KEY,
  workspace_id text NOT NULL,
  doc_id text NOT NULL,
  update bytea NOT NULL,
  timestamp bigint NOT NULL,
  editor text NOT NULL
);
CREATE INDEX IF NOT EXISTS doc_updates_space
  ON doc_updates (workspace_id, doc_id, timestamp);
CREATE TABLE IF NOT EXISTS doc_snapshots (
  workspace_id text NOT NULL,
  doc_id text NOT NULL,
  snapshot bytea NOT NULL,
  state bytea NOT NULL,
  timestamp bigint NOT NULL,
  PRIMARY KEY (workspace_id, doc_id)
);
CREATE TABLE IF NOT EXISTS blobs (
  workspace_id text NOT NULL,
  key text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (workspace_id, key)
);
CREATE TABLE IF NOT EXISTS comments (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  doc_id text NOT NULL,
  content jsonb NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS replies (
  id text PRIMARY KEY,
  comment_id text NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  content jsonb NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export type Database = PgliteDatabase<typeof schema>;

export type DbHandle = {
  pg: PGlite;
  db: Database;
  jwtSecret: Uint8Array;
  dataDir: string;
  close(): Promise<void>;
};

export async function openDatabase(
  dataDir: string,
  jwtSecretHex?: string
): Promise<DbHandle> {
  const pgDir = join(dataDir, 'pg');
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(dataDir, 'blobs'), { recursive: true });
  await mkdir(join(dataDir, 'markdown'), { recursive: true });
  await mkdir(pgDir, { recursive: true });
  let pg: PGlite;
  try {
    pg = new PGlite({ fs: new NodeFS(pgDir) });
    await pg.waitReady;
  } catch (first) {
    const detail =
      first instanceof Error
        ? (first.stack ?? first.message)
        : JSON.stringify(first);
    throw new Error(`PGlite failed to open data dir ${dataDir}: ${detail}`);
  }
  const db = drizzle({ client: pg, schema });
  await pg.exec(ENSURE_SCHEMA);
  const jwtSecret = await loadJwtSecret(dataDir, jwtSecretHex);
  return {
    pg,
    db,
    jwtSecret,
    dataDir,
    async close() {
      await pg.close();
    },
  };
}

async function loadJwtSecret(dataDir: string, override?: string) {
  const path = join(dataDir, 'jwt-secret');
  if (override) {
    await writeFile(path, override, 'utf8');
    return Buffer.from(override, 'hex');
  }
  try {
    return Buffer.from(await readFile(path, 'utf8'), 'hex');
  } catch {
    const hex = randomBytes(32).toString('hex');
    await writeFile(path, hex, 'utf8');
    return Buffer.from(hex, 'hex');
  }
}
