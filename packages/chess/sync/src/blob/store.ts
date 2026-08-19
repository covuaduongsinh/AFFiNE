import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { and, eq } from 'drizzle-orm';

import { blobs } from '../db/schema.js';
import type { AppState } from '../types.js';

export function blobPath(dataDir: string, workspaceId: string, key: string) {
  return join(dataDir, 'blobs', workspaceId, key);
}

export async function writeBlobFile(
  state: AppState,
  workspaceId: string,
  key: string,
  mime: string,
  bytes: Uint8Array
) {
  const path = blobPath(state.db.dataDir, workspaceId, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  await state.db.db
    .insert(blobs)
    .values({
      workspaceId,
      key,
      mime,
      size: bytes.byteLength,
      deleted: false,
    })
    .onConflictDoUpdate({
      target: [blobs.workspaceId, blobs.key],
      set: { mime, size: bytes.byteLength, deleted: false },
    });
  return key;
}

export async function readBlobFile(
  state: AppState,
  workspaceId: string,
  key: string
) {
  const [row] = await state.db.db
    .select()
    .from(blobs)
    .where(and(eq(blobs.workspaceId, workspaceId), eq(blobs.key, key)));
  if (!row || row.deleted) return null;
  try {
    const bytes = await readFile(blobPath(state.db.dataDir, workspaceId, key));
    const info = await stat(blobPath(state.db.dataDir, workspaceId, key));
    return { bytes, mime: row.mime, mtime: info.mtime };
  } catch {
    return null;
  }
}

export async function removeBlobFile(
  state: AppState,
  workspaceId: string,
  key: string
) {
  await rm(blobPath(state.db.dataDir, workspaceId, key), { force: true });
}
