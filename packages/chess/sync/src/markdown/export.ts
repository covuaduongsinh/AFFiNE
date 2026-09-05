import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type * as Y from 'yjs';

import type { AppState } from '../types.js';

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[- .]+|[- .]+$/g, '')
    .trim();
  return cleaned.slice(0, 100) || 'Untitled';
}

export function formatYText(ytext: unknown): string {
  if (!ytext) return '';
  if (typeof ytext === 'string') return ytext;
  if (
    typeof ytext === 'object' &&
    ytext !== null &&
    'toDelta' in ytext &&
    typeof (ytext as Y.Text).toDelta === 'function'
  ) {
    const deltas = (ytext as Y.Text).toDelta();
    let res = '';
    for (const d of deltas) {
      if (typeof d.insert !== 'string') continue;
      let piece = d.insert;
      const attrs = d.attributes || {};
      if (attrs.code) piece = `\`${piece}\``;
      if (attrs.bold) piece = `**${piece}**`;
      if (attrs.italic) piece = `*${piece}*`;
      if (attrs.strike) piece = `~~${piece}~~`;
      if (attrs.link) piece = `[${piece}](${attrs.link})`;
      res += piece;
    }
    return res;
  }
  return String(ytext);
}

export function yDocToMarkdown(doc: Y.Doc): {
  title: string;
  markdown: string;
} | null {
  const blocks = doc.getMap('blocks');
  if (!blocks || blocks.size === 0) return null;

  let pageBlock: Y.Map<unknown> | null = null;
  for (const [, val] of blocks.entries()) {
    if (
      val &&
      typeof val === 'object' &&
      (val as Y.Map<unknown>).get('sys:flavour') === 'affine:page'
    ) {
      pageBlock = val as Y.Map<unknown>;
      break;
    }
  }

  if (!pageBlock) return null;

  const titleRaw = pageBlock.get('prop:title');
  const title = formatYText(titleRaw).trim() || 'Untitled';

  const lines: string[] = [`# ${title}\n`];

  function renderBlock(blockId: string, indent = ''): void {
    const block = blocks.get(blockId) as Y.Map<unknown> | undefined;
    if (!block || typeof block.get !== 'function') return;

    const flavour = String(block.get('sys:flavour') ?? '');
    const children = block.get('sys:children') as Y.Array<string> | undefined;

    switch (flavour) {
      case 'affine:note': {
        if (children && typeof children.forEach === 'function') {
          children.forEach(childId => renderBlock(childId, indent));
        }
        break;
      }

      case 'affine:paragraph': {
        const text = formatYText(block.get('prop:text')).trimEnd();
        const type = String(block.get('prop:type') ?? '');
        if (type === 'h1') lines.push(`${indent}# ${text}\n`);
        else if (type === 'h2') lines.push(`${indent}## ${text}\n`);
        else if (type === 'h3') lines.push(`${indent}### ${text}\n`);
        else if (type === 'h4') lines.push(`${indent}#### ${text}\n`);
        else if (type === 'h5') lines.push(`${indent}##### ${text}\n`);
        else if (type === 'h6') lines.push(`${indent}###### ${text}\n`);
        else if (type === 'quote') lines.push(`${indent}> ${text}\n`);
        else if (text.length > 0) lines.push(`${indent}${text}\n`);
        else lines.push('');

        if (children && typeof children.forEach === 'function') {
          children.forEach(childId => renderBlock(childId, `${indent}  `));
        }
        break;
      }

      case 'affine:list': {
        const text = formatYText(block.get('prop:text')).trimEnd();
        const type = String(block.get('prop:type') ?? '');
        if (type === 'todo') {
          const checked = Boolean(block.get('prop:checked'));
          lines.push(`${indent}- [${checked ? 'x' : ' '}] ${text}`);
        } else if (type === 'numbered') {
          lines.push(`${indent}1. ${text}`);
        } else {
          lines.push(`${indent}- ${text}`);
        }

        if (children && typeof children.forEach === 'function') {
          children.forEach(childId => renderBlock(childId, `${indent}  `));
        }
        break;
      }

      case 'affine:code': {
        const lang = String(block.get('prop:language') ?? '');
        const code = String(block.get('prop:text') ?? '').trimEnd();
        lines.push(`${indent}\`\`\`${lang}\n${code}\n${indent}\`\`\`\n`);
        break;
      }

      case 'affine:divider': {
        lines.push(`${indent}---\n`);
        break;
      }

      case 'affine:image': {
        const caption = formatYText(block.get('prop:caption')).trim();
        const sourceId = String(block.get('prop:sourceId') ?? '');
        lines.push(`${indent}![${caption}](${sourceId})\n`);
        break;
      }

      case 'affine:chess-game': {
        const pgn = String(block.get('prop:pgn') ?? '').trim();
        lines.push(`${indent}\`\`\`pgn\n${pgn}\n${indent}\`\`\`\n`);
        break;
      }

      case 'affine:chess-board': {
        const fen = String(block.get('prop:fen') ?? '').trim();
        lines.push(`${indent}\`\`\`fen\n${fen}\n${indent}\`\`\`\n`);
        break;
      }

      default: {
        const rawText = block.get('prop:text');
        if (rawText) {
          const text = formatYText(rawText).trimEnd();
          if (text) lines.push(`${indent}${text}\n`);
        }
        if (children && typeof children.forEach === 'function') {
          children.forEach(childId => renderBlock(childId, indent));
        }
        break;
      }
    }
  }

  const pageChildren = pageBlock.get('sys:children') as
    | Y.Array<string>
    | undefined;
  if (pageChildren && typeof pageChildren.forEach === 'function') {
    pageChildren.forEach(childId => renderBlock(childId));
  }

  return {
    title,
    markdown: lines.join('\n').trim() + '\n',
  };
}

interface DocMap {
  [docId: string]: string;
}

async function getDocMap(dir: string): Promise<DocMap> {
  const mapPath = join(dir, '.doc-map.json');
  try {
    const data = await readFile(mapPath, 'utf8');
    return JSON.parse(data) as DocMap;
  } catch {
    return {};
  }
}

async function saveDocMap(dir: string, map: DocMap): Promise<void> {
  const mapPath = join(dir, '.doc-map.json');
  await writeFile(mapPath, JSON.stringify(map, null, 2), 'utf8');
}

export async function exportDocToMarkdownFile(
  state: AppState,
  workspaceId: string,
  docId: string
): Promise<string | null> {
  // Dynamic import to prevent circular dependency with sync/docs.ts
  const { loadYDoc, releaseDoc } = await import('../sync/docs.js');
  const doc = await loadYDoc(state, workspaceId, docId);
  const result = yDocToMarkdown(doc);
  releaseDoc(workspaceId, docId);

  if (!result) return null;

  const markdownDir = join(state.db.dataDir, 'markdown', workspaceId);
  await mkdir(markdownDir, { recursive: true });

  const baseName = sanitizeFilename(result.title);
  const fileName = `${baseName}.md`;
  const filePath = join(markdownDir, fileName);

  const docMap = await getDocMap(markdownDir);
  const oldEntry = docMap[docId];
  const oldFileName =
    typeof oldEntry === 'string' ? oldEntry : oldEntry?.fileName;
  if (oldFileName && oldFileName !== fileName) {
    const oldPath = join(markdownDir, oldFileName);
    if (existsSync(oldPath)) {
      await unlink(oldPath).catch(() => {});
    }
  }

  const hash = createHash('sha256')
    .update(result.markdown, 'utf8')
    .digest('hex');
  docMap[docId] = { fileName, hash, updatedAt: Date.now() };
  await saveDocMap(markdownDir, docMap);
  await writeFile(filePath, result.markdown, 'utf8');
  return filePath;
}

export async function removeDocMarkdownFile(
  state: AppState,
  workspaceId: string,
  docId: string
): Promise<void> {
  const markdownDir = join(state.db.dataDir, 'markdown', workspaceId);
  const docMap = await getDocMap(markdownDir);
  const entry = docMap[docId];
  const fileName = typeof entry === 'string' ? entry : entry?.fileName;
  if (fileName) {
    const filePath = join(markdownDir, fileName);
    if (existsSync(filePath)) {
      await unlink(filePath).catch(() => {});
    }
    delete docMap[docId];
    await saveDocMap(markdownDir, docMap);
  }
}

import { docSnapshots, docUpdates } from '../db/schema.js';

export function scheduleDocMarkdownExport(
  state: AppState,
  workspaceId: string,
  docId: string,
  delayMs = 1500
): void {
  const key = `${workspaceId}:${docId}`;
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    debounceTimers.delete(key);
    exportDocToMarkdownFile(state, workspaceId, docId).catch(err => {
      console.error(`[MarkdownExport ERROR] doc ${docId}:`, err);
    });
  }, delayMs);

  debounceTimers.set(key, timer);
}

export async function exportAllDocsToMarkdown(
  state: AppState
): Promise<number> {
  try {
    const { loadYDoc, releaseDoc } = await import('../sync/docs.js');

    const snaps = await state.db.db
      .select({
        workspaceId: docSnapshots.workspaceId,
        docId: docSnapshots.docId,
      })
      .from(docSnapshots);
    const updates = await state.db.db
      .select({
        workspaceId: docUpdates.workspaceId,
        docId: docUpdates.docId,
      })
      .from(docUpdates);

    const workspaceIds = new Set<string>();
    for (const row of [...snaps, ...updates]) {
      if (row.workspaceId) workspaceIds.add(row.workspaceId);
    }

    const seen = new Set<string>();
    const pairs: { workspaceId: string; docId: string }[] = [];

    // 1. Gather all pages registered in rootDoc of each workspace
    for (const wsId of workspaceIds) {
      try {
        const rootDoc = await loadYDoc(state, wsId, wsId);
        const metaMap = rootDoc.getMap('meta');
        const pages = metaMap.get('pages');
        if (pages && typeof (pages as any).forEach === 'function') {
          (pages as any).forEach((p: unknown) => {
            if (p && typeof p === 'object') {
              const pId =
                typeof (p as any).get === 'function'
                  ? (p as any).get('id')
                  : (p as any).id;
              if (pId && typeof pId === 'string') {
                const key = `${wsId}:${pId}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  pairs.push({ workspaceId: wsId, docId: pId });
                }
              }
            }
          });
        }
        releaseDoc(wsId, wsId);
      } catch {
        // ignore
      }
    }

    // 2. Also include any remaining pairs from DB
    for (const row of [...snaps, ...updates]) {
      const key = `${row.workspaceId}:${row.docId}`;
      if (!seen.has(key) && !row.docId.startsWith('db$') && !row.docId.startsWith('userdata$')) {
        seen.add(key);
        pairs.push(row);
      }
    }

    let count = 0;
    for (const { workspaceId, docId } of pairs) {
      try {
        const res = await exportDocToMarkdownFile(state, workspaceId, docId);
        if (res) count++;
      } catch {
        // ignore individual doc conversion errors
      }
    }
    return count;
  } catch (err) {
    console.error(
      '[MarkdownExport ERROR] exportAllDocsToMarkdown failed:',
      err
    );
    return 0;
  }
}
