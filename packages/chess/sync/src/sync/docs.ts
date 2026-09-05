import { and, eq } from 'drizzle-orm';
import * as Y from 'yjs';

import { docSnapshots, docUpdates } from '../db/schema.js';
import {
  removeDocMarkdownFile,
  scheduleDocMarkdownExport,
} from '../markdown/export.js';
import type { AppState } from '../types.js';

type CachedDoc = {
  doc: Y.Doc;
  refs: number;
  timer?: ReturnType<typeof setTimeout>;
};

const cache = new Map<string, CachedDoc>();

function cacheKey(workspaceId: string, docId: string) {
  return `${workspaceId}:${docId}`;
}

export function base64ToBytes(value: string) {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function bytesToBase64(value: Uint8Array) {
  return Buffer.from(value).toString('base64');
}

export async function loadYDoc(
  state: AppState,
  workspaceId: string,
  docId: string
) {
  const key = cacheKey(workspaceId, docId);
  const existing = cache.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.refs += 1;
    return existing.doc;
  }
  const doc = new Y.Doc();
  const [snapshot] = await state.db.db
    .select()
    .from(docSnapshots)
    .where(
      and(
        eq(docSnapshots.workspaceId, workspaceId),
        eq(docSnapshots.docId, docId)
      )
    );
  if (snapshot) {
    Y.applyUpdate(doc, new Uint8Array(snapshot.snapshot));
  }
  const updates = await state.db.db
    .select()
    .from(docUpdates)
    .where(
      and(eq(docUpdates.workspaceId, workspaceId), eq(docUpdates.docId, docId))
    );
  for (const row of updates) {
    Y.applyUpdate(doc, new Uint8Array(row.update));
  }
  cache.set(key, { doc, refs: 1 });
  return doc;
}

export async function hasDoc(
  state: AppState,
  workspaceId: string,
  docId: string
) {
  const [snapshot] = await state.db.db
    .select({ timestamp: docSnapshots.timestamp })
    .from(docSnapshots)
    .where(
      and(
        eq(docSnapshots.workspaceId, workspaceId),
        eq(docSnapshots.docId, docId)
      )
    );
  if (snapshot) return true;
  const updates = await state.db.db
    .select({ id: docUpdates.id })
    .from(docUpdates)
    .where(
      and(eq(docUpdates.workspaceId, workspaceId), eq(docUpdates.docId, docId))
    )
    .limit(1);
  return updates.length > 0;
}

export async function pushUpdate(
  state: AppState,
  workspaceId: string,
  docId: string,
  update: Uint8Array,
  editor: string
) {
  const timestamp = Date.now();
  await state.db.db.insert(docUpdates).values({
    workspaceId,
    docId,
    update: Buffer.from(update),
    timestamp,
    editor,
  });
  const doc = await loadYDoc(state, workspaceId, docId);
  Y.applyUpdate(doc, update);
  const pending = await state.db.db
    .select({ id: docUpdates.id })
    .from(docUpdates)
    .where(
      and(eq(docUpdates.workspaceId, workspaceId), eq(docUpdates.docId, docId))
    );
  if (pending.length > 100) {
    await compactDoc(state, workspaceId, docId, doc, timestamp);
  }
  releaseDoc(workspaceId, docId);
  scheduleDocMarkdownExport(state, workspaceId, docId);

  if (state.io) {
    const room = `space:workspace:${workspaceId}`;
    const base64Update = bytesToBase64(update);
    state.io.to(room).emit('space:broadcast-doc-updates', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
      updates: [base64Update],
      timestamp,
      editor,
    });
    state.io.to(room).emit('space:broadcast-doc-update', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
      update: base64Update,
      timestamp,
      editor,
    });
  }

  return timestamp;
}

export async function compactDoc(
  state: AppState,
  workspaceId: string,
  docId: string,
  doc: Y.Doc,
  timestamp: number
) {
  await state.db.db
    .insert(docSnapshots)
    .values({
      workspaceId,
      docId,
      snapshot: Buffer.from(Y.encodeStateAsUpdate(doc)),
      state: Buffer.from(Y.encodeStateVector(doc)),
      timestamp,
    })
    .onConflictDoUpdate({
      target: [docSnapshots.workspaceId, docSnapshots.docId],
      set: {
        snapshot: Buffer.from(Y.encodeStateAsUpdate(doc)),
        state: Buffer.from(Y.encodeStateVector(doc)),
        timestamp,
      },
    });
  await state.db.db
    .delete(docUpdates)
    .where(
      and(eq(docUpdates.workspaceId, workspaceId), eq(docUpdates.docId, docId))
    );
}

export async function lastTimestamps(
  state: AppState,
  workspaceId: string,
  _after?: number
) {
  const snaps = await state.db.db
    .select()
    .from(docSnapshots)
    .where(eq(docSnapshots.workspaceId, workspaceId));
  const updates = await state.db.db
    .select()
    .from(docUpdates)
    .where(eq(docUpdates.workspaceId, workspaceId));
  const map: Record<string, number> = {};
  for (const row of snaps) {
    map[row.docId] = Math.max(map[row.docId] ?? 0, row.timestamp);
  }
  for (const row of updates) {
    map[row.docId] = Math.max(map[row.docId] ?? 0, row.timestamp);
  }
  return map;
}

export async function deleteDoc(
  state: AppState,
  workspaceId: string,
  docId: string
) {
  await state.db.db
    .delete(docUpdates)
    .where(
      and(eq(docUpdates.workspaceId, workspaceId), eq(docUpdates.docId, docId))
    );
  await state.db.db
    .delete(docSnapshots)
    .where(
      and(
        eq(docSnapshots.workspaceId, workspaceId),
        eq(docSnapshots.docId, docId)
      )
    );
  const key = cacheKey(workspaceId, docId);
  const cached = cache.get(key);
  if (cached) {
    cached.doc.destroy();
    cache.delete(key);
  }
  void removeDocMarkdownFile(state, workspaceId, docId).catch(() => {});
}

export function releaseDoc(workspaceId: string, docId: string) {
  const key = cacheKey(workspaceId, docId);
  const cached = cache.get(key);
  if (!cached) return;
  cached.refs = Math.max(0, cached.refs - 1);
  if (cached.refs === 0) {
    cached.timer = setTimeout(() => {
      cache.delete(key);
      cached.doc.destroy();
    }, 60_000);
  }
}

export async function encodeDocBytes(
  state: AppState,
  workspaceId: string,
  docId: string
) {
  if (!(await hasDoc(state, workspaceId, docId))) return null;
  const doc = await loadYDoc(state, workspaceId, docId);
  const bytes = Buffer.from(Y.encodeStateAsUpdate(doc));
  releaseDoc(workspaceId, docId);
  return bytes;
}
