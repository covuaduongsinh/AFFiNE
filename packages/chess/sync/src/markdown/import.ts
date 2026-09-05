import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { nanoid } from 'nanoid';
import * as Y from 'yjs';

import { deleteDoc, loadYDoc, pushUpdate, releaseDoc } from '../sync/docs.js';
import type { AppState } from '../types.js';
import { getOwnerId } from '../workspace.js';

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

export interface ParsedChessBoard {
  fen: string;
  orientation: 'white' | 'black';
  arrows: Array<{ from: string; to: string; color?: string }>;
  highlights: Array<{ square: string; color: string }>;
  extraLines: string[];
  extraAnnotations: string[];
}

const SQUARE = '[a-h][1-8]';
const ARROW_RE = new RegExp(`^A(${SQUARE})-(${SQUARE})(?:/([rgby]))?$`);
const HIGHLIGHT_RE = new RegExp(`^H(${SQUARE})(?:/([ygb]))?$`);

const ANNOTATION_COLORS = {
  r: '#e67768',
  g: '#b3ce6e',
  b: '#6ab5d6',
  y: '#f1ad24',
} as const;

export function isRawFenString(str: string): boolean {
  const parts = str.trim().split(/\s+/);
  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return false;
  for (const rank of ranks) {
    if (!/^[rnbqkpRNBQKP1-8]+$/.test(rank)) return false;
    let count = 0;
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') count += parseInt(ch, 10);
      else count += 1;
    }
    if (count !== 8) return false;
  }
  return true;
}

export function parseChessBoardBlock(lines: string[]): ParsedChessBoard | null {
  const text = lines.join('\n').trim();
  if (!text) return null;

  let fen = '';
  let orientation: 'white' | 'black' = 'white';
  const extraLines: string[] = [];
  const extraAnnotations: string[] = [];
  const arrows: Array<{ from: string; to: string; color?: string }> = [];
  const highlights: Array<{ square: string; color: string }> = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (fen) extraLines.push('');
      continue;
    }

    const fenPrefixMatch = /^fen:\s*(.+)$/i.exec(trimmed);
    if (fenPrefixMatch) {
      if (!fen) {
        fen = fenPrefixMatch[1].trim();
      } else {
        extraLines.push(rawLine);
      }
      continue;
    }

    const orientMatch = /^orientation:\s*(white|black)$/i.exec(trimmed);
    if (orientMatch) {
      orientation = orientMatch[1].toLowerCase() as 'white' | 'black';
      continue;
    }

    if (trimmed.toLowerCase().startsWith('annotations:')) {
      const tokens = trimmed.slice(12).trim().split(/\s+/);
      for (const token of tokens) {
        if (!token) continue;
        const aMatch = ARROW_RE.exec(token);
        if (aMatch) {
          const [, from, to, colorKey] = aMatch;
          arrows.push({
            from,
            to,
            color: colorKey
              ? ANNOTATION_COLORS[colorKey as keyof typeof ANNOTATION_COLORS]
              : '#f1ad24',
          });
          continue;
        }
        const hMatch = HIGHLIGHT_RE.exec(token);
        if (hMatch) {
          const [, square, colorKey] = hMatch;
          highlights.push({
            square,
            color: colorKey
              ? ANNOTATION_COLORS[colorKey as keyof typeof ANNOTATION_COLORS]
              : '#e67768',
          });
          continue;
        }
        extraAnnotations.push(token);
      }
      continue;
    }

    if (!fen && isRawFenString(trimmed)) {
      fen = trimmed;
      continue;
    }

    extraLines.push(rawLine);
  }

  if (!fen) return null;

  const fenParts = fen.split(/\s+/);
  if (fenParts.length === 1 && fenParts[0].split('/').length === 8) {
    fen = `${fenParts[0]} w - - 0 1`;
  }

  return {
    fen,
    orientation,
    arrows,
    highlights,
    extraLines,
    extraAnnotations,
  };
}

export function looksLikePgn(text: string): boolean {
  const trimmed = text.trim();
  if (
    trimmed.startsWith('[Event ') ||
    trimmed.startsWith('[Site ') ||
    trimmed.startsWith('[Date ') ||
    trimmed.startsWith('[FEN ')
  ) {
    return true;
  }
  if (/(?:^|\n)\s*1\.\s*[a-hKQRBNxO\-+#=]+/.test(trimmed)) {
    return true;
  }
  return false;
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

  let pendingParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (pendingParagraphLines.length === 0) return;
    const textContent = pendingParagraphLines.join('\n');
    pendingParagraphLines = [];

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
    parseInlineFormatting(textContent, yText);
    pMap.set('prop:collapsed', false);
    childBlockIds.push(blockId);
  };

  for (const rawLine of contentLines) {
    const line = rawLine.trim();

    if (inCodeBlock) {
      if (line.startsWith('```')) {
        inCodeBlock = false;
        const normalizedLang = codeLang.toLowerCase();

        // 1. Check if it's a chessboard / FEN block
        const parsedBoard =
          normalizedLang === 'fen' ||
          normalizedLang === 'chessboard' ||
          normalizedLang === '' ||
          normalizedLang === 'text'
            ? parseChessBoardBlock(codeLines)
            : null;

        if (parsedBoard) {
          const blockId = nanoid();
          const chessMap = new Y.Map();
          blocks.set(blockId, chessMap);
          chessMap.set('sys:id', blockId);
          chessMap.set('sys:flavour', 'affine:chess-board');
          chessMap.set('sys:version', 1);
          chessMap.set('sys:children', new Y.Array());
          chessMap.set('prop:fen', parsedBoard.fen);
          chessMap.set('prop:orientation', parsedBoard.orientation);
          chessMap.set('prop:caption', '');
          chessMap.set('prop:editable', true);

          const arrowsArray = new Y.Array();
          arrowsArray.push(parsedBoard.arrows);
          chessMap.set('prop:arrows', arrowsArray);

          const highlightsArray = new Y.Array();
          highlightsArray.push(parsedBoard.highlights);
          chessMap.set('prop:highlights', highlightsArray);

          const extraLinesArray = new Y.Array();
          extraLinesArray.push(parsedBoard.extraLines);
          chessMap.set('prop:extraLines', extraLinesArray);

          const extraAnnotationsArray = new Y.Array();
          extraAnnotationsArray.push(parsedBoard.extraAnnotations);
          chessMap.set('prop:extraAnnotations', extraAnnotationsArray);

          childBlockIds.push(blockId);
        } else if (
          normalizedLang === 'pgn' ||
          (normalizedLang === '' && looksLikePgn(codeLines.join('\n')))
        ) {
          // 2. Check if it's a PGN chess game block
          const blockId = nanoid();
          const chessMap = new Y.Map();
          blocks.set(blockId, chessMap);
          chessMap.set('sys:id', blockId);
          chessMap.set('sys:flavour', 'affine:chess-game');
          chessMap.set('sys:version', 1);
          chessMap.set('sys:children', new Y.Array());
          chessMap.set('prop:orientation', 'white');
          chessMap.set('prop:caption', '');
          chessMap.set('prop:pgn', codeLines.join('\n').trim());
          chessMap.set('prop:currentPath', new Y.Array());
          chessMap.set('prop:analysisJson', '');
          childBlockIds.push(blockId);
        } else {
          // 3. Regular code block
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
        }

        codeLines = [];
      } else {
        codeLines.push(rawLine);
      }
      continue;
    }

    if (line.startsWith('```')) {
      flushParagraph();
      inCodeBlock = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      continue;
    }

    if (line === '---' || line === '***' || line === '___') {
      flushParagraph();
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
      flushParagraph();
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
      flushParagraph();
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
      flushParagraph();
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
      flushParagraph();
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
      flushParagraph();
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
      flushParagraph();
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

    // Empty line separates paragraphs
    if (!line) {
      flushParagraph();
      continue;
    }

    // Regular paragraph line
    pendingParagraphLines.push(rawLine);
  }

  // Flush any pending paragraph lines
  flushParagraph();

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
  filePath: string,
  force = false
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
      if (!force && entryHash === hash) {
        // Content hasn't changed and not forced; verify rootDoc already has targetDocId in meta.pages
        const rootDoc = await loadYDoc(state, workspaceId, workspaceId);
        const metaMap = rootDoc.getMap('meta');
        const pages = metaMap.get('pages') as Y.Array<unknown> | undefined;
        let hasPage = false;
        if (pages && pages instanceof Y.Array) {
          for (let i = 0; i < pages.length; i++) {
            const p = pages.get(i);
            if (p instanceof Y.Map && p.get('id') === targetDocId) {
              hasPage = true;
              break;
            }
          }
        }
        releaseDoc(workspaceId, workspaceId);
        if (hasPage) {
          return null;
        }
      }
      break;
    }
  }

  const fallbackTitle = fileName.replace(/\.md$/i, '');
  const now = Date.now();
  const ownerId = await getOwnerId(state, workspaceId);

  if (targetDocId) {
    // Update existing document
    const doc = await loadYDoc(state, workspaceId, targetDocId);
    const { title } = markdownToYDoc(content, doc, fallbackTitle);
    const update = Y.encodeStateAsUpdate(doc);
    releaseDoc(workspaceId, targetDocId);

    await pushUpdate(state, workspaceId, targetDocId, update, ownerId);

    // Update title in workspace root doc if changed
    const rootDoc = await loadYDoc(state, workspaceId, workspaceId);
    const metaMap = rootDoc.getMap('meta');
    let pages = metaMap.get('pages') as Y.Array<unknown> | undefined;
    if (!pages) {
      pages = new Y.Array();
      metaMap.set('pages', pages);
    }

    // Convert any legacy non-Y.Map items in pages to Y.Map
    const entriesToReplace: { index: number; entry: Y.Map<unknown> }[] = [];
    let targetPageFound = false;

    pages.forEach((p, idx) => {
      if (p instanceof Y.Map) {
        if (p.get('id') === targetDocId) {
          targetPageFound = true;
          if (p.get('title') !== title) {
            p.set('title', title);
          }
          p.set('updatedDate', now);
          p.set('updatedBy', ownerId);
        }
      } else if (p && typeof p === 'object') {
        const raw = p as Record<string, unknown>;
        const pId = String(raw.id || '');
        if (pId === targetDocId) targetPageFound = true;
        const ymap = new Y.Map([
          ['id', pId],
          ['title', pId === targetDocId ? title : String(raw.title || '')],
          ['createDate', Number(raw.createDate || now)],
          ['updatedDate', now],
          ['createdBy', String(raw.createdBy || ownerId)],
          ['updatedBy', ownerId],
          ['tags', new Y.Array()],
        ]);
        entriesToReplace.push({ index: idx, entry: ymap });
      }
    });

    for (let i = entriesToReplace.length - 1; i >= 0; i--) {
      const item = entriesToReplace[i];
      pages.delete(item.index, 1);
      pages.insert(item.index, [item.entry]);
    }

    if (!targetPageFound) {
      const pageMapEntry = new Y.Map([
        ['id', targetDocId],
        ['title', title],
        ['createDate', now],
        ['updatedDate', now],
        ['createdBy', ownerId],
        ['updatedBy', ownerId],
        ['tags', new Y.Array()],
      ]);
      pages.push([pageMapEntry]);
    }

    const spacesMap = rootDoc.getMap('spaces');
    if (!spacesMap.has(targetDocId)) {
      spacesMap.set(targetDocId, new Y.Map());
    }

    const rootUpdate = Y.encodeStateAsUpdate(rootDoc);
    await pushUpdate(state, workspaceId, workspaceId, rootUpdate, ownerId);
    releaseDoc(workspaceId, workspaceId);

    docMap[targetDocId] = { fileName, hash, updatedAt: now };
    await saveDocMap(markdownDir, docMap);
    return targetDocId;
  } else {
    // Create new document
    const newDocId = nanoid();
    const { title, doc } = markdownToYDoc(content, new Y.Doc(), fallbackTitle);
    const update = Y.encodeStateAsUpdate(doc);

    await pushUpdate(state, workspaceId, newDocId, update, ownerId);

    // Register in workspace root doc
    const rootDoc = await loadYDoc(state, workspaceId, workspaceId);
    const metaMap = rootDoc.getMap('meta');
    let pages = metaMap.get('pages') as Y.Array<unknown> | undefined;
    if (!pages) {
      pages = new Y.Array();
      metaMap.set('pages', pages);
    }

    // Convert any legacy non-Y.Map items in pages to Y.Map
    const entriesToReplace: { index: number; entry: Y.Map<unknown> }[] = [];
    pages.forEach((p, idx) => {
      if (!(p instanceof Y.Map) && p && typeof p === 'object') {
        const raw = p as Record<string, unknown>;
        const ymap = new Y.Map([
          ['id', String(raw.id || '')],
          ['title', String(raw.title || '')],
          ['createDate', Number(raw.createDate || now)],
          ['updatedDate', Number(raw.updatedDate || now)],
          ['createdBy', String(raw.createdBy || ownerId)],
          ['updatedBy', String(raw.updatedBy || ownerId)],
          ['tags', new Y.Array()],
        ]);
        entriesToReplace.push({ index: idx, entry: ymap });
      }
    });

    for (let i = entriesToReplace.length - 1; i >= 0; i--) {
      const item = entriesToReplace[i];
      pages.delete(item.index, 1);
      pages.insert(item.index, [item.entry]);
    }

    const pageMapEntry = new Y.Map([
      ['id', newDocId],
      ['title', title],
      ['createDate', now],
      ['updatedDate', now],
      ['createdBy', ownerId],
      ['updatedBy', ownerId],
      ['tags', new Y.Array()],
    ]);
    pages.push([pageMapEntry]);

    const spacesMap = rootDoc.getMap('spaces');
    if (!spacesMap.has(newDocId)) {
      spacesMap.set(newDocId, new Y.Map());
    }

    const rootUpdate = Y.encodeStateAsUpdate(rootDoc);
    await pushUpdate(state, workspaceId, workspaceId, rootUpdate, ownerId);
    releaseDoc(workspaceId, workspaceId);

    docMap[newDocId] = { fileName, hash, updatedAt: now };
    await saveDocMap(markdownDir, docMap);
    return newDocId;
  }
}

export async function scanAndImportWorkspaceMarkdown(
  state: AppState,
  workspaceId: string,
  force = false
): Promise<number> {
  const markdownDir = join(state.db.dataDir, 'markdown', workspaceId);
  if (!existsSync(markdownDir)) return 0;

  const files = readdirSync(markdownDir).filter(f => f.endsWith('.md'));
  let count = 0;

  for (const file of files) {
    try {
      const fullPath = join(markdownDir, file);
      const res = await importMarkdownFile(state, workspaceId, fullPath, force);
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

  // Deduplicate and cleanup meta.pages in rootDoc
  try {
    const ownerId = await getOwnerId(state, workspaceId);
    const rootDoc = await loadYDoc(state, workspaceId, workspaceId);
    const metaMap = rootDoc.getMap('meta');
    const pages = metaMap.get('pages') as Y.Array<unknown> | undefined;
    if (pages && pages instanceof Y.Array) {
      const seenIds = new Set<string>();
      const toDeleteIndices: number[] = [];
      let pagesModified = false;
      pages.forEach((p, idx) => {
        if (p instanceof Y.Map) {
          const id = p.get('id') as string;
          if (!id || seenIds.has(id)) {
            toDeleteIndices.push(idx);
          } else {
            seenIds.add(id);
            if (!p.get('createdBy')) {
              p.set('createdBy', ownerId);
              pagesModified = true;
            }
            if (!p.get('updatedBy')) {
              p.set('updatedBy', ownerId);
              pagesModified = true;
            }
          }
        } else {
          toDeleteIndices.push(idx);
        }
      });
      if (toDeleteIndices.length > 0 || pagesModified) {
        for (let i = toDeleteIndices.length - 1; i >= 0; i--) {
          pages.delete(toDeleteIndices[i], 1);
        }
        const rootUpdate = Y.encodeStateAsUpdate(rootDoc);
        await pushUpdate(
          state,
          workspaceId,
          workspaceId,
          rootUpdate,
          ownerId
        );
      }
    }
    releaseDoc(workspaceId, workspaceId);
  } catch (err) {
    console.error(`[MarkdownImport ERROR] deduplicating pages:`, err);
  }

  return count;
}

export async function scanAndImportAllMarkdown(
  state: AppState,
  force = false
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
    const count = await scanAndImportWorkspaceMarkdown(
      state,
      workspaceId,
      force
    );
    total += count;
  }

  return total;
}
