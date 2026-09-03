import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { and, eq } from 'drizzle-orm';

import { blobs } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { AppState } from '../types.js';

export function blobPath(dataDir: string, workspaceId: string, key: string) {
  const root = resolve(dataDir, 'blobs');
  const path = resolve(root, workspaceId, key);
  // The key is whatever the client called the file — `setBlob` passes the
  // upload's own filename straight through. `join` walks `..` without
  // complaint, so a crafted name wrote wherever this process could write.
  //
  // Containment rather than a character allowlist: it holds for any key format
  // the app decides to use later, and cannot reject a legitimate one because
  // the pattern was guessed too narrowly.
  if (path !== root && !path.startsWith(root + sep)) {
    throw new HttpError(400, 'INVALID_INPUT', 'invalid blob key');
  }
  return path;
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
