import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { nanoid } from 'nanoid';
import * as Y from 'yjs';

import { deleteDoc, loadYDoc, pushUpdate, releaseDoc } from '../sync/docs.js';
import type { AppState } from '../types.js';

interface DocMapEntry {
  fileName: string;
  hash: string;
  updatedAt?: number;
}

interface DocMap {
  [docId: string]: DocMapEntry | string;
}

export function parseInlineFormatting(text: string, yText: Y.Text): void {
  // Regex to match markdown links, bold, italic, strikethrough, inline code
  // Example: [link](url), **bold**, *italic*, ~~strike~~, `code`
  const regex =
    /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const deltas: Array<{
    insert: string;
    attributes?: Record<string, unknown>;
  }> = [];

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      deltas.push({ insert: text.slice(lastIndex, match.index) });
    }

    if (match[2] && match[3]) {
      // Link [text](url)
      deltas.push({ insert: match[2], attributes: { link: match[3] } });
    } else if (match[4]) {
      // Bold **text**
      deltas.push({ insert: match[4], attributes: { bold: true } });
    } else if (match[5]) {
      // Italic *text*
      deltas.push({ insert: match[5], attributes: { italic: true } });
    } else if (match[6]) {
      // Strike ~~text~~
      deltas.push({ insert: match[6], attributes: { strike: true } });
    } else if (match[7]) {
      // Code `code`
      deltas.push({ insert: match[7], attributes: { code: true } });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    deltas.push({ insert: text.slice(lastIndex) });
  }

  if (deltas.length > 0) {
    yText.applyDelta(deltas);
  }
}

export function markdownToYDoc(
  markdown: string,
  doc = new Y.Doc(),
  fallbackTitle = 'Untitled'
): { title: string; doc: Y.Doc } {
  const lines = markdown.split(/\r?\n/);
  const blocks = doc.getMap('blocks');
  blocks.clear();

  let title = fallbackTitle;
  let contentLines = lines;

  // Extract title from first line if it's a '# Title'
  if (lines.length > 0 && lines[0].startsWith('# ')) {
    title = lines[0].slice(2).trim() || fallbackTitle;
    contentLines = lines.slice(1);
  }

  const pageId = nanoid();
  const surfaceId = nanoid();
  const noteId = nanoid();

  const childBlockIds: string[] = [];

  let inCodeBlock = false;
  let codeLang = '';
  let codeLines: string[] = [];

  let inChessBlock: 'pgn' | 'fen' | null = null;
  let chessLines: string[] = [];

  for (const rawLine of contentLines) {
    const line = rawLine.trim();

    if (inCodeBlock) {
      if (line.startsWith('```')) {
        inCodeBlock = false;
        const blockId = nanoid();
        const codeMap = new Y.Map();
        blocks.set(blockId, codeMap);
        codeMap.set('sys:id', blockId);
        codeMap.set('sys:flavour', 'affine:code');
        codeMap.set('sys:version', 1);
        codeMap.set('sys:children', new Y.Array());
        codeMap.set('prop:language', codeLang);
        const yText = new Y.Text();
        codeMap.set('prop:text', yText);
        yText.insert(0, codeLines.join('\n'));
        childBlockIds.push(blockId);
        codeLines = [];
      } else {
        codeLines.push(rawLine);
      }
      continue;
    }

    if (inChessBlock) {
      if (line.startsWith('```')) {
        const blockId = nanoid();
        const chessMap = new Y.Map();
        blocks.set(blockId, chessMap);
        chessMap.set('sys:id', blockId);
        chessMap.set('sys:version', 1);
        chessMap.set('sys:children', new Y.Array());
        chessMap.set('prop:orientation', 'white');
        chessMap.set('prop:caption', '');

        if (inChessBlock === 'pgn') {
          chessMap.set('sys:flavour', 'affine:chess-game');
          chessMap.set('prop:pgn', chessLines.join('\n').trim());
          chessMap.set('prop:currentPath', new Y.Array());
          chessMap.set('prop:analysisJson', '');
        } else {
          chessMap.set('sys:flavour', 'affine:chess-board');
          chessMap.set('prop:fen', chessLines.join('\n').trim());
          chessMap.set('prop:arrows', new Y.Array());
          chessMap.set('prop:highlights', new Y.Array());
          chessMap.set('prop:editable', true);
        }

        childBlockIds.push(blockId);
        inChessBlock = null;
        chessLines = [];
      } else {
        chessLines.push(rawLine);
      }
      continue;
    }

    if (line.startsWith('```')) {
      const tag = line.slice(3).trim().toLowerCase();
      if (tag === 'pgn' || tag === 'fen') {
        inChessBlock = tag;
        chessLines = [];
      } else {
        inCodeBlock = true;
        codeLang = tag;
        codeLines = [];
      }
      continue;
    }

    if (line === '---' || line === '***' || line === '___') {
      const blockId = nanoid();
      const divMap = new Y.Map();
      divMap.set('sys:id', blockId);
      divMap.set('sys:flavour', 'affine:divider');
      divMap.set('sys:version', 1);
      divMap.set('sys:children', new Y.Array());
      blocks.set(blockId, divMap);
      childBlockIds.push(blockId);
      continue;
    }

    // Image ![alt](url)
    const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
    if (imgMatch) {
      const blockId = nanoid();
      const imgMap = new Y.Map();
      blocks.set(blockId, imgMap);
      imgMap.set('sys:id', blockId);
      imgMap.set('sys:flavour', 'affine:image');
      imgMap.set('sys:version', 1);
      imgMap.set('sys:children', new Y.Array());
      const capText = new Y.Text();
      imgMap.set('prop:caption', capText);
      capText.insert(0, imgMatch[1]);
      imgMap.set('prop:sourceId', imgMatch[2]);
      childBlockIds.push(blockId);
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const blockId = nanoid();
      const pMap = new Y.Map();
      blocks.set(blockId, pMap);
      pMap.set('sys:id', blockId);
      pMap.set('sys:flavour', 'affine:paragraph');
      pMap.set('sys:version', 1);
      pMap.set('sys:children', new Y.Array());
      pMap.set('prop:type', `h${level}`);
      const yText = new Y.Text();
      pMap.set('prop:text', yText);
      parseInlineFormatting(headingText, yText);
      pMap.set('prop:collapsed', false);
      childBlockIds.push(blockId);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const blockId = nanoid();
      const pMap = new Y.Map();
      blocks.set(blockId, pMap);
      pMap.set('sys:id', blockId);
      pMap.set('sys:flavour', 'affine:paragraph');
      pMap.set('sys:version', 1);
      pMap.set('sys:children', new Y.Array());
      pMap.set('prop:type', 'quote');
      const yText = new Y.Text();
      pMap.set('prop:text', yText);
      parseInlineFormatting(line.slice(2), yText);
      pMap.set('prop:collapsed', false);
      childBlockIds.push(blockId);
      continue;
    }

    // Todo list item: - [ ] or - [x]
    const todoMatch = /^-\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (todoMatch) {
      const checked = todoMatch[1].toLowerCase() === 'x';
      const itemText = todoMatch[2];
      const blockId = nanoid();
      const listMap = new Y.Map();
      blocks.set(blockId, listMap);
      listMap.set('sys:id', blockId);
      listMap.set('sys:flavour', 'affine:list');
      listMap.set('sys:version', 1);
      listMap.set('sys:children', new Y.Array());
      listMap.set('prop:type', 'todo');
      listMap.set('prop:checked', checked);
      const yText = new Y.Text();
      listMap.set('prop:text', yText);
      parseInlineFormatting(itemText, yText);
      childBlockIds.push(blockId);
      continue;
    }

    // Numbered list item: 1. item
    const numberedMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (numberedMatch) {
      const itemText = numberedMatch[1];
      const blockId = nanoid();
      const listMap = new Y.Map();
      blocks.set(blockId, listMap);
      listMap.set('sys:id', blockId);
      listMap.set('sys:flavour', 'affine:list');
      listMap.set('sys:version', 1);
      listMap.set('sys:children', new Y.Array());
      listMap.set('prop:type', 'numbered');
      const yText = new Y.Text();
      listMap.set('prop:text', yText);
      parseInlineFormatting(itemText, yText);
      childBlockIds.push(blockId);
      continue;
    }

    // Bullet list item: - item or * item
    const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      const itemText = bulletMatch[1];
      const blockId = nanoid();
      const listMap = new Y.Map();
      blocks.set(blockId, listMap);
      listMap.set('sys:id', blockId);
      listMap.set('sys:flavour', 'affine:list');
      listMap.set('sys:version', 1);
      listMap.set('sys:children', new Y.Array());
      listMap.set('prop:type', 'bulleted');
      const yText = new Y.Text();
      listMap.set('prop:text', yText);
      parseInlineFormatting(itemText, yText);
      childBlockIds.push(blockId);
      continue;
    }

    // Paragraph / empty line
    const blockId = nanoid();
    const pMap = new Y.Map();
    blocks.set(blockId, pMap);
    pMap.set('sys:id', blockId);
    pMap.set('sys:flavour', 'affine:paragraph');
    pMap.set('sys:version', 1);
    pMap.set('sys:children', new Y.Array());
    pMap.set('prop:type', 'text');
    const yText = new Y.Text();
    pMap.set('prop:text', yText);
    if (line.length > 0) {
      parseInlineFormatting(rawLine, yText);
    }
    pMap.set('prop:collapsed', false);
    childBlockIds.push(blockId);
  }

  // Ensure at least 1 paragraph block
  if (childBlockIds.length === 0) {
    const emptyPId = nanoid();
    const emptyP = new Y.Map();
    blocks.set(emptyPId, emptyP);
    emptyP.set('sys:id', emptyPId);
    emptyP.set('sys:flavour', 'affine:paragraph');
    emptyP.set('sys:version', 1);
    emptyP.set('sys:children', new Y.Array());
    emptyP.set('prop:type', 'text');
    emptyP.set('prop:text', new Y.Text());
    emptyP.set('prop:collapsed', false);
    childBlockIds.push(emptyPId);
  }

  // Create Surface block
  const surfaceMap = new Y.Map();
  blocks.set(surfaceId, surfaceMap);
  surfaceMap.set('sys:id', surfaceId);
  surfaceMap.set('sys:flavour', 'affine:surface');
  surfaceMap.set('sys:version', 5);
  surfaceMap.set('sys:children', new Y.Array());
  const elementsMap = new Y.Map();
  surfaceMap.set('prop:elements', elementsMap);

  // Create Note block
  const noteMap = new Y.Map();
  blocks.set(noteId, noteMap);
  noteMap.set('sys:id', noteId);
  noteMap.set('sys:flavour', 'affine:note');
  noteMap.set('sys:version', 1);
  const noteChildren = new Y.Array();
  noteChildren.push(childBlockIds);
  noteMap.set('sys:children', noteChildren);
  noteMap.set('prop:displayMode', 'both');

  // Create Page block
  const pageMap = new Y.Map();
  blocks.set(pageId, pageMap);
  pageMap.set('sys:id', pageId);
  pageMap.set('sys:flavour', 'affine:page');
  pageMap.set('sys:version', 2);
  const pageChildren = new Y.Array();
  pageChildren.push([surfaceId, noteId]);
  pageMap.set('sys:children', pageChildren);
  const titleText = new Y.Text();
  pageMap.set('prop:title', titleText);
  titleText.insert(0, title);

  return { title, doc };
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

export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function importMarkdownFile(
  state: AppState,
  workspaceId: string,
  filePath: string
): Promise<string | null> {
  const fileName = basename(filePath);
  if (fileName === '.doc-map.json' || !fileName.endsWith('.md')) {
    return null;
  }

  const markdownDir = join(state.db.dataDir, 'markdown', workspaceId);
  const content = await readFile(filePath, 'utf8');
  const hash = computeHash(content);

  const docMap = await getDocMap(markdownDir);

  // Find existing docId by matching either docMap key entry or fileName
  let targetDocId: string | null = null;
  for (const [docId, entry] of Object.entries(docMap)) {
    const entryFileName = typeof entry === 'string' ? entry : entry.fileName;
    if (entryFileName === fileName) {
      targetDocId = docId;
      const entryHash = typeof entry === 'object' ? entry.hash : null;
      if (entryHash === hash) {
        // Content hasn't changed, skip to avoid loops
        return null;
      }
      break;
    }
  }

  const fallbackTitle = fileName.replace(/\.md$/i, '');
  const now = Date.now();

  if (targetDocId) {
    // Update existing document
    const doc = await loadYDoc(state, workspaceId, targetDocId);
    const { title } = markdownToYDoc(content, doc, fallbackTitle);
    const update = Y.encodeStateAsUpdate(doc);
    releaseDoc(workspaceId, targetDocId);

    await pushUpdate(state, workspaceId, targetDocId, update, 'system:import');

    // Update title in workspace root doc if changed
    const rootDoc = await loadYDoc(state, workspaceId, workspaceId);
    const metaMap = rootDoc.getMap('meta');
    const pages = metaMap.get('pages') as
      | Y.Array<Record<string, unknown>>
      | undefined;
    if (pages && typeof pages.forEach === 'function') {
      pages.forEach((p, idx) => {
        if (p && p.id === targetDocId && p.title !== title) {
          const updated = { ...p, title, updatedDate: now };
          pages.delete(idx, 1);
          pages.insert(idx, [updated]);
        }
      });
      const rootUpdate = Y.encodeStateAsUpdate(rootDoc);
      await pushUpdate(
        state,
        workspaceId,
        workspaceId,
        rootUpdate,
        'system:import'
      );
    }
    releaseDoc(workspaceId, workspaceId);

    docMap[targetDocId] = { fileName, hash, updatedAt: now };
    await saveDocMap(markdownDir, docMap);
    return targetDocId;
  } else {
    // Create new document
    const newDocId = nanoid();
    const { title, doc } = markdownToYDoc(content, new Y.Doc(), fallbackTitle);
    const update = Y.encodeStateAsUpdate(doc);

    await pushUpdate(state, workspaceId, newDocId, update, 'system:import');

    // Register in workspace root doc
    const rootDoc = await loadYDoc(state, workspaceId, workspaceId);
    const metaMap = rootDoc.getMap('meta');
    let pages = metaMap.get('pages') as
      | Y.Array<Record<string, unknown>>
      | undefined;
    if (!pages) {
      pages = new Y.Array();
      metaMap.set('pages', pages);
    }
    pages.push([
      {
        id: newDocId,
        title,
        createDate: now,
        updatedDate: now,
        tags: [],
      },
    ]);

    const spacesMap = rootDoc.getMap('spaces');
    if (!spacesMap.has(newDocId)) {
      spacesMap.set(newDocId, new Y.Map());
    }

    const rootUpdate = Y.encodeStateAsUpdate(rootDoc);
    await pushUpdate(
      state,
      workspaceId,
      workspaceId,
      rootUpdate,
      'system:import'
    );
    releaseDoc(workspaceId, workspaceId);

    docMap[newDocId] = { fileName, hash, updatedAt: now };
    await saveDocMap(markdownDir, docMap);
    return newDocId;
  }
}

export async function scanAndImportWorkspaceMarkdown(
  state: AppState,
  workspaceId: string
): Promise<number> {
  const markdownDir = join(state.db.dataDir, 'markdown', workspaceId);
  if (!existsSync(markdownDir)) return 0;

  const files = readdirSync(markdownDir).filter(f => f.endsWith('.md'));
  let count = 0;

  for (const file of files) {
    try {
      const fullPath = join(markdownDir, file);
      const res = await importMarkdownFile(state, workspaceId, fullPath);
      if (res) count++;
    } catch (err) {
      console.error(`[MarkdownImport ERROR] file ${file}:`, err);
    }
  }

  // Handle deleted markdown files: if in docMap but file no longer exists on disk
  const docMap = await getDocMap(markdownDir);
  const diskFileSet = new Set(files);
  let mapModified = false;

  for (const [docId, entry] of Object.entries(docMap)) {
    const entryFileName = typeof entry === 'string' ? entry : entry.fileName;
    if (!diskFileSet.has(entryFileName)) {
      await deleteDoc(state, workspaceId, docId).catch(() => {});
      delete docMap[docId];
      mapModified = true;
    }
  }

  if (mapModified) {
    await saveDocMap(markdownDir, docMap);
  }

  return count;
}

export async function scanAndImportAllMarkdown(
  state: AppState
): Promise<number> {
  const baseMarkdownDir = join(state.db.dataDir, 'markdown');
  if (!existsSync(baseMarkdownDir)) return 0;

  const entries = readdirSync(baseMarkdownDir, { withFileTypes: true });
  const workspaceDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  const rootFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));

  // If files were placed in the root notes/ folder directly on Dropbox,
  // distribute them to all workspace directories so they get imported.
  if (rootFiles.length > 0 && workspaceDirs.length > 0) {
    for (const file of rootFiles) {
      const sourcePath = join(baseMarkdownDir, file.name);
      for (const workspaceId of workspaceDirs) {
        const destDir = join(baseMarkdownDir, workspaceId);
        const destPath = join(destDir, file.name);
        if (!existsSync(destPath)) {
          await copyFile(sourcePath, destPath).catch(() => {});
        }
      }
    }
  }

  let total = 0;
  for (const workspaceId of workspaceDirs) {
    const count = await scanAndImportWorkspaceMarkdown(state, workspaceId);
    total += count;
  }

  return total;
}
