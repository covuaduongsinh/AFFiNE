import { FootNoteReferenceParamsSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  createAttachmentBlockSnapshot,
  FULL_FILE_PATH_KEY,
  getImageFullPath,
  MarkdownAdapter,
  type MarkdownAST,
  MarkdownASTToDeltaExtension,
  normalizeFilePathReference,
} from '@blocksuite/affine-shared/adapters';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type {
  DeltaInsert,
  ExtensionType,
  Schema,
  Workspace,
} from '@blocksuite/store';
import { extMimeMap, nanoid } from '@blocksuite/store';
import type { Html, Text } from 'mdast';

import {
  blobsFromAssets,
  type ImportBatch,
  type ImportDoc,
  type ImportFolder,
} from './import-batch.js';
import {
  applySnapshotTitle,
  bindImportedAssetsToJob,
  createMarkdownImportJob,
  FRONTMATTER_KEYS,
  getProvider,
  isSystemImportPath,
  type ParsedFrontmatterMeta,
  parseFrontmatter,
  stageImportedAsset,
} from './markdown.js';
import type {
  AssetMap,
  MarkdownFileImportEntry,
  PathBlobIdMap,
} from './type.js';

const CALLOUT_TYPE_MAP: Record<string, string> = {
  note: '💡',
  info: 'ℹ️',
  tip: '🔥',
  hint: '✅',
  important: '‼️',
  warning: '⚠️',
  caution: '⚠️',
  attention: '⚠️',
  danger: '⚠️',
  error: '🚨',
  bug: '🐛',
  example: '📌',
  quote: '💬',
  cite: '💬',
  abstract: '📋',
  summary: '📋',
  todo: '☑️',
  success: '✅',
  check: '✅',
  done: '✅',
  failure: '❌',
  fail: '❌',
  missing: '❌',
  question: '❓',
  help: '❓',
  faq: '❓',
};

const AMBIGUOUS_PAGE_LOOKUP = '__ambiguous__';
const DEFAULT_CALLOUT_EMOJI = '💡';
const OBSIDIAN_TEXT_FOOTNOTE_URL_PREFIX = 'data:text/plain;charset=utf-8,';
const OBSIDIAN_ATTACHMENT_EMBED_TAG = 'obsidian-attachment';

/**
 * Only these keys become AFFiNE tags. The shared front matter map also reads
 * `categories`/`keywords` as tags, but in a vault those hold wikilinks to real
 * notes, so they are kept as body links instead.
 */
const OBSIDIAN_TAG_KEYS = ['tags', 'tag'];

/** Keys the doc meta already carries, so the body must not repeat them. */
const OBSIDIAN_HANDLED_FRONTMATTER_KEYS = new Set([
  ...FRONTMATTER_KEYS.title,
  ...FRONTMATTER_KEYS.created,
  ...FRONTMATTER_KEYS.updated,
  ...FRONTMATTER_KEYS.favorite,
  ...FRONTMATTER_KEYS.trash,
  ...OBSIDIAN_TAG_KEYS,
]);

/** Dropbox leaves these conflict copies next to notes it could not sync. */
const OBSIDIAN_TEMP_FILE_RE = /\.tmp\.\d+\.[0-9a-f]+$/i;
const OBSIDIAN_APP_CONFIG_SUFFIX = '.obsidian/app.json';
const OBSIDIAN_DEFAULT_BATCH_SIZE = 25;

function normalizeLookupKey(value: string): string {
  return normalizeFilePathReference(value).toLowerCase();
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, '');
}

function basename(value: string): string {
  return normalizeFilePathReference(value).split('/').pop() ?? value;
}

function parseObsidianTarget(rawTarget: string): {
  path: string;
  fragment: string | null;
} {
  const normalizedTarget = normalizeFilePathReference(rawTarget);
  const match = normalizedTarget.match(/^([^#^]+)([#^].*)?$/);

  return {
    path: match?.[1]?.trim() ?? normalizedTarget,
    fragment: match?.[2] ?? null,
  };
}

function extractTitleAndEmoji(rawTitle: string): {
  title: string;
  emoji: string | null;
} {
  const SINGLE_LEADING_EMOJI_RE =
    /^[\s\u200b]*((?:[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200b]|\u200d|\ufe0f)+)/u;

  let currentTitle = rawTitle;
  let extractedEmojiClusters = '';
  let emojiMatch;

  while ((emojiMatch = currentTitle.match(SINGLE_LEADING_EMOJI_RE))) {
    const matchedCluster = emojiMatch[1].trim();
    extractedEmojiClusters +=
      (extractedEmojiClusters ? ' ' : '') + matchedCluster;
    currentTitle = currentTitle.slice(emojiMatch[0].length);
  }

  return {
    title: currentTitle.trim(),
    emoji: extractedEmojiClusters || null,
  };
}

function preprocessTitleHeader(markdown: string): string {
  return markdown.replace(
    /^(\s*#\s+)(.*)$/m,
    (_, headerPrefix, titleContent) => {
      const { title: cleanTitle } = extractTitleAndEmoji(titleContent);
      return `${headerPrefix}${cleanTitle}`;
    }
  );
}

function preprocessObsidianCallouts(markdown: string): string {
  return markdown.replace(
    /^(> *)\[!([^\]\n]+)\](?:[+-]?)([^\n]*)/gm,
    (_, prefix, type, rest) => {
      const calloutToken =
        CALLOUT_TYPE_MAP[type.trim().toLowerCase()] ?? DEFAULT_CALLOUT_EMOJI;
      const title = rest.trim();
      return title
        ? `${prefix}[!${calloutToken}] ${title}`
        : `${prefix}[!${calloutToken}]`;
    }
  );
}

function isStructuredFootnoteDefinition(content: string): boolean {
  try {
    return FootNoteReferenceParamsSchema.safeParse(JSON.parse(content.trim()))
      .success;
  } catch {
    return false;
  }
}

function splitFootnoteTextContent(content: string): {
  title: string;
  description?: string;
} {
  const lines = content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const title = lines[0] ?? content.trim();
  const description = lines.slice(1).join('\n').trim();

  return {
    title,
    ...(description ? { description } : {}),
  };
}

function createTextFootnoteDefinition(content: string): string {
  const normalizedContent = content.trim();
  const { title, description } = splitFootnoteTextContent(normalizedContent);

  return JSON.stringify({
    type: 'url',
    url: encodeURIComponent(
      `${OBSIDIAN_TEXT_FOOTNOTE_URL_PREFIX}${encodeURIComponent(
        normalizedContent
      )}`
    ),
    title,
    ...(description ? { description } : {}),
  });
}

function parseFootnoteDefLine(line: string): {
  identifier: string;
  content: string;
} | null {
  if (!line.startsWith('[^')) return null;

  const closeBracketIndex = line.indexOf(']:', 2);
  if (closeBracketIndex <= 2) return null;

  const identifier = line.slice(2, closeBracketIndex);
  if (!identifier || identifier.includes(']')) return null;

  let contentStart = closeBracketIndex + 2;
  while (
    contentStart < line.length &&
    (line[contentStart] === ' ' || line[contentStart] === '\t')
  ) {
    contentStart += 1;
  }

  return {
    identifier,
    content: line.slice(contentStart),
  };
}

function extractObsidianFootnotes(markdown: string): {
  content: string;
  footnotes: string[];
} {
  const lines = markdown.split('\n');
  const output: string[] = [];
  const footnotes: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const definition = parseFootnoteDefLine(line);
    if (!definition) {
      output.push(line);
      continue;
    }

    const { identifier } = definition;
    const contentLines = [definition.content];

    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1];
      if (/^(?: {1,4}|\t)/.test(nextLine)) {
        contentLines.push(nextLine.replace(/^(?: {1,4}|\t)/, ''));
        index += 1;
        continue;
      }

      if (
        nextLine.trim() === '' &&
        index + 2 < lines.length &&
        /^(?: {1,4}|\t)/.test(lines[index + 2])
      ) {
        contentLines.push('');
        index += 1;
        continue;
      }

      break;
    }

    const content = contentLines.join('\n').trim();
    footnotes.push(
      `[^${identifier}]: ${
        !content || isStructuredFootnoteDefinition(content)
          ? content
          : createTextFootnoteDefinition(content)
      }`
    );
  }

  return { content: output.join('\n'), footnotes };
}

function buildLookupKeys(
  targetPath: string,
  currentFilePath?: string
): string[] {
  const parsedTargetPath = normalizeFilePathReference(targetPath);
  if (!parsedTargetPath) {
    return [];
  }

  const keys = new Set<string>();
  const addPathVariants = (value: string) => {
    const normalizedValue = normalizeFilePathReference(value);
    if (!normalizedValue) {
      return;
    }

    keys.add(normalizedValue);
    keys.add(stripMarkdownExtension(normalizedValue));

    const fileName = basename(normalizedValue);
    keys.add(fileName);
    keys.add(stripMarkdownExtension(fileName));

    const cleanTitle = extractTitleAndEmoji(
      stripMarkdownExtension(fileName)
    ).title;
    if (cleanTitle) {
      keys.add(cleanTitle);
    }
  };

  addPathVariants(parsedTargetPath);

  if (currentFilePath) {
    addPathVariants(getImageFullPath(currentFilePath, parsedTargetPath));
  }

  return Array.from(keys).map(normalizeLookupKey);
}

/**
 * How directly a key names a note. A vault that holds both `Chess.md` and
 * `♟️ Chess.md` would otherwise make "chess" ambiguous and leave every
 * `[[Chess]]` as plain text, even though one note is named exactly that.
 */
const LOOKUP_RANK = {
  path: 0,
  fileName: 1,
  declaredTitle: 2,
  strippedTitle: 3,
} as const;

type LookupRank = (typeof LOOKUP_RANK)[keyof typeof LOOKUP_RANK];
type PageLookupEntry = { pageId: string; rank: LookupRank };

function registerPageLookup(
  pageLookupMap: Map<string, PageLookupEntry>,
  key: string,
  pageId: string,
  rank: LookupRank
) {
  const normalizedKey = normalizeLookupKey(key);
  if (!normalizedKey) {
    return;
  }

  const existing = pageLookupMap.get(normalizedKey);
  if (!existing || rank < existing.rank) {
    pageLookupMap.set(normalizedKey, { pageId, rank });
    return;
  }
  if (rank > existing.rank || existing.pageId === pageId) {
    return;
  }

  // Two notes claim the key just as directly - the link stays literal.
  pageLookupMap.set(normalizedKey, { pageId: AMBIGUOUS_PAGE_LOOKUP, rank });
}

function flattenPageLookup(
  pageLookupMap: ReadonlyMap<string, PageLookupEntry>
): Map<string, string> {
  const flattened = new Map<string, string>();
  for (const [key, entry] of pageLookupMap) {
    flattened.set(key, entry.pageId);
  }
  return flattened;
}

function resolvePageIdFromLookup(
  pageLookupMap: Pick<ReadonlyMap<string, string>, 'get'>,
  rawTarget: string,
  currentFilePath?: string
): string | null {
  const { path } = parseObsidianTarget(rawTarget);
  for (const key of buildLookupKeys(path, currentFilePath)) {
    const targetPageId = pageLookupMap.get(key);
    if (!targetPageId || targetPageId === AMBIGUOUS_PAGE_LOOKUP) {
      continue;
    }
    return targetPageId;
  }

  return null;
}

function resolveWikilinkDisplayTitle(
  rawAlias: string | undefined,
  pageEmoji: string | undefined
): string | undefined {
  if (!rawAlias) {
    return undefined;
  }

  const { title: aliasTitle, emoji: aliasEmoji } =
    extractTitleAndEmoji(rawAlias);

  if (aliasEmoji && aliasEmoji === pageEmoji) {
    return aliasTitle;
  }

  return rawAlias;
}

function isImageAssetPath(path: string): boolean {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
  return extMimeMap.get(extension)?.startsWith('image/') ?? false;
}

function encodeMarkdownPath(path: string): string {
  return encodeURI(path).replaceAll('(', '%28').replaceAll(')', '%29');
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/[[\]\\]/g, '\\$&');
}

function isObsidianSizeAlias(alias: string | undefined): boolean {
  return !!alias && /^\d+(?:x\d+)?$/i.test(alias.trim());
}

function getEmbedLabel(
  rawAlias: string | undefined,
  targetPath: string,
  fallbackToFileName: boolean
): string {
  if (!rawAlias || isObsidianSizeAlias(rawAlias)) {
    return fallbackToFileName
      ? stripMarkdownExtension(basename(targetPath))
      : '';
  }

  return rawAlias.trim();
}

type ObsidianAttachmentEmbed = {
  blobId: string;
  fileName: string;
  fileType: string;
};

type ObsidianAssetLookup = {
  resolve: (
    targetPath: string,
    currentFilePath: string
  ) => { blobId: string; path: string } | null;
};

function createAssetLookup(
  pathBlobIdMap: ReadonlyMap<string, string>,
  vaultRoot: string,
  attachmentFolderPath?: string
): ObsidianAssetLookup {
  const exact = new Map<string, { blobId: string; path: string }>();
  const byBasename = new Map<
    string,
    { blobId: string; path: string } | typeof AMBIGUOUS_PAGE_LOOKUP
  >();

  for (const [path, blobId] of pathBlobIdMap) {
    const entry = { blobId, path };
    exact.set(normalizeLookupKey(path), entry);
    const name = normalizeLookupKey(basename(path));
    const existing = byBasename.get(name);
    if (!existing) {
      byBasename.set(name, entry);
    } else if (
      existing !== AMBIGUOUS_PAGE_LOOKUP &&
      existing.blobId !== blobId
    ) {
      byBasename.set(name, AMBIGUOUS_PAGE_LOOKUP);
    }
  }

  return {
    resolve(targetPath, currentFilePath) {
      const normalizedTarget = normalizeFilePathReference(targetPath);
      const rootPath = vaultRoot
        ? `${vaultRoot}/${normalizedTarget}`
        : normalizedTarget;
      const candidates = [
        getImageFullPath(currentFilePath, normalizedTarget),
        rootPath,
      ];
      if (attachmentFolderPath) {
        candidates.push(
          vaultRoot
            ? `${vaultRoot}/${attachmentFolderPath}/${basename(normalizedTarget)}`
            : `${attachmentFolderPath}/${basename(normalizedTarget)}`
        );
      }

      for (const candidate of candidates) {
        const resolved = exact.get(normalizeLookupKey(candidate));
        if (resolved) return resolved;
      }

      const match = byBasename.get(
        normalizeLookupKey(basename(normalizedTarget))
      );
      return match && match !== AMBIGUOUS_PAGE_LOOKUP ? match : null;
    },
  };
}

function createObsidianAttach(embed: ObsidianAttachmentEmbed): string {
  return `<!-- ${OBSIDIAN_ATTACHMENT_EMBED_TAG} ${encodeURIComponent(
    JSON.stringify(embed)
  )} -->`;
}

function parseObsidianAttach(value: string): ObsidianAttachmentEmbed | null {
  const match = value.match(
    new RegExp(`^<!-- ${OBSIDIAN_ATTACHMENT_EMBED_TAG} ([^ ]+) -->$`)
  );
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(
      decodeURIComponent(match[1])
    ) as ObsidianAttachmentEmbed;
    if (!parsed.blobId || !parsed.fileName) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseWikiLinkAt(
  source: string,
  startIdx: number,
  embedded: boolean
): {
  raw: string;
  rawTarget: string;
  rawAlias?: string;
  endIdx: number;
} | null {
  const opener = embedded ? '![[' : '[[';
  if (!source.startsWith(opener, startIdx)) return null;

  const contentStart = startIdx + opener.length;
  const closeIndex = source.indexOf(']]', contentStart);
  if (closeIndex === -1) return null;

  const inner = source.slice(contentStart, closeIndex);
  const separatorIdx = inner.indexOf('|');
  const rawTarget = separatorIdx === -1 ? inner : inner.slice(0, separatorIdx);
  const rawAlias =
    separatorIdx === -1 ? undefined : inner.slice(separatorIdx + 1);

  if (
    rawTarget.length === 0 ||
    rawTarget.includes(']') ||
    rawTarget.includes('|') ||
    rawAlias?.includes(']')
  ) {
    return null;
  }

  return {
    raw: source.slice(startIdx, closeIndex + 2),
    rawTarget,
    rawAlias,
    endIdx: closeIndex + 2,
  };
}

function replaceWikiLinks(
  source: string,
  embedded: boolean,
  replacer: (match: {
    raw: string;
    rawTarget: string;
    rawAlias?: string;
  }) => string
): string {
  const opener = embedded ? '![[' : '[[';
  let cursor = 0;
  let output = '';

  while (cursor < source.length) {
    const matchStart = source.indexOf(opener, cursor);
    if (matchStart === -1) {
      output += source.slice(cursor);
      break;
    }

    output += source.slice(cursor, matchStart);
    const match = parseWikiLinkAt(source, matchStart, embedded);
    if (!match) {
      output += source.slice(matchStart, matchStart + opener.length);
      cursor = matchStart + opener.length;
      continue;
    }

    output += replacer(match);
    cursor = match.endIdx;
  }

  return output;
}

function preprocessObsidianEmbeds(
  markdown: string,
  filePath: string,
  pageLookupMap: ReadonlyMap<string, string>,
  assetLookup: ObsidianAssetLookup
): string {
  return replaceWikiLinks(markdown, true, ({ raw, rawTarget, rawAlias }) => {
    const targetPageId = resolvePageIdFromLookup(
      pageLookupMap,
      rawTarget,
      filePath
    );
    if (targetPageId) {
      return `[[${rawTarget}${rawAlias ? `|${rawAlias}` : ''}]]`;
    }

    const { path } = parseObsidianTarget(rawTarget);
    if (!path) return raw;

    const resolvedAsset = assetLookup.resolve(path, filePath);
    const assetPath = resolvedAsset?.path ?? getImageFullPath(filePath, path);
    const encodedPath = encodeMarkdownPath(
      resolvedAsset ? `/${assetPath}` : path
    );

    if (isImageAssetPath(path)) {
      const alt = getEmbedLabel(rawAlias, path, false);
      return `![${escapeMarkdownLabel(alt)}](${encodedPath})`;
    }

    const label = getEmbedLabel(rawAlias, path, true);
    const blobId = resolvedAsset?.blobId;
    if (!blobId) return `[${escapeMarkdownLabel(label)}](${encodedPath})`;

    const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
    return createObsidianAttach({
      blobId,
      fileName: basename(path),
      fileType: extMimeMap.get(extension) ?? '',
    });
  });
}

function preprocessObsidianMarkdown(
  markdown: string,
  filePath: string,
  pageLookupMap: ReadonlyMap<string, string>,
  assetLookup: ObsidianAssetLookup
): string {
  const { content: contentWithoutFootnotes, footnotes: extractedFootnotes } =
    extractObsidianFootnotes(markdown);
  const content = preprocessObsidianEmbeds(
    contentWithoutFootnotes,
    filePath,
    pageLookupMap,
    assetLookup
  );
  const normalizedMarkdown = preprocessTitleHeader(
    preprocessObsidianCallouts(content)
  );

  if (extractedFootnotes.length === 0) {
    return normalizedMarkdown;
  }

  const trimmedMarkdown = normalizedMarkdown.replace(/\s+$/, '');
  return `${trimmedMarkdown}\n\n${extractedFootnotes.join('\n\n')}\n`;
}

function isObsidianAttachmentEmbedNode(node: MarkdownAST): node is Html {
  return node.type === 'html' && !!parseObsidianAttach(node.value);
}

export const obsidianAttachmentEmbedMarkdownAdapterMatcher =
  BlockMarkdownAdapterExtension({
    flavour: 'obsidian:attachment-embed',
    toMatch: o => isObsidianAttachmentEmbedNode(o.node),
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!isObsidianAttachmentEmbedNode(o.node)) {
          return;
        }

        const attachment = parseObsidianAttach(o.node.value);
        if (!attachment) {
          return;
        }

        const assetFile = context.assets?.getAssets().get(attachment.blobId);
        context.walkerContext
          .openNode(
            createAttachmentBlockSnapshot({
              id: nanoid(),
              props: {
                name: attachment.fileName,
                size: assetFile?.size ?? 0,
                type:
                  attachment.fileType ||
                  assetFile?.type ||
                  'application/octet-stream',
                sourceId: attachment.blobId,
                embed: false,
                style: 'horizontalThin',
                footnoteIdentifier: null,
              },
            }),
            'children'
          )
          .closeNode();
        (o.node as unknown as { type: string }).type =
          'obsidianAttachmentEmbed';
      },
    },
    fromBlockSnapshot: {},
  });

export const obsidianWikilinkToDeltaMatcher = MarkdownASTToDeltaExtension({
  name: 'obsidian-wikilink',
  match: ast => ast.type === 'text',
  toDelta: (ast, context) => {
    const textNode = ast as Text;
    if (!textNode.value) {
      return [];
    }

    const nodeContent = textNode.value;
    const deltas: DeltaInsert<AffineTextAttributes>[] = [];
    let cursor = 0;

    while (cursor < nodeContent.length) {
      const matchStart = nodeContent.indexOf('[[', cursor);
      if (matchStart === -1) {
        deltas.push({ insert: nodeContent.substring(cursor) });
        break;
      }

      if (matchStart > cursor) {
        deltas.push({
          insert: nodeContent.substring(cursor, matchStart),
        });
      }

      const linkMatch = parseWikiLinkAt(nodeContent, matchStart, false);
      if (!linkMatch) {
        deltas.push({ insert: '[[' });
        cursor = matchStart + 2;
        continue;
      }

      const targetPageName = linkMatch.rawTarget.trim();
      const alias = linkMatch.rawAlias?.trim();
      const currentFilePath = context.configs.get(FULL_FILE_PATH_KEY);
      const targetPageId = resolvePageIdFromLookup(
        { get: key => context.configs.get(`obsidian:pageId:${key}`) },
        targetPageName,
        typeof currentFilePath === 'string' ? currentFilePath : undefined
      );

      if (targetPageId) {
        const pageEmoji = context.configs.get(
          'obsidian:pageEmoji:' + targetPageId
        );
        const displayTitle = resolveWikilinkDisplayTitle(alias, pageEmoji);

        deltas.push({
          insert: ' ',
          attributes: {
            reference: {
              type: 'LinkedPage',
              pageId: targetPageId,
              ...(displayTitle ? { title: displayTitle } : {}),
            },
          },
        });
      } else {
        deltas.push({ insert: linkMatch.raw });
      }

      cursor = linkMatch.endIdx;
    }

    return deltas;
  },
});

export type ImportObsidianVaultOptions = {
  collection: Workspace;
  schema: Schema;
  importedFiles: File[];
  extensions: ExtensionType[];
  /**
   * How many docs each emitted batch carries. A real vault holds hundreds of
   * notes, and committing them one batch at a time keeps the main thread
   * responsive and lets the caller report progress and honour a cancel.
   */
  batchSize?: number;
};

export type ImportObsidianVaultResult = {
  docIds: string[];
  docEmojis: Map<string, string>;
};

export type PlanObsidianVaultResult = ImportObsidianVaultResult & {
  batch: ImportBatch;
};

function getVaultRoot(paths: string[]): string {
  const first = paths[0]?.split('/').find(Boolean);
  return first && paths.every(path => path.startsWith(`${first}/`))
    ? first
    : '';
}

function isObsidianConfigPath(path: string): boolean {
  return normalizeFilePathReference(path)
    .split('/')
    .some(segment => segment === '.obsidian');
}

/**
 * Everything a working vault carries that is not the vault: `.git`, plugin
 * caches such as `.smart-env`, `.trash`, editor state, and Dropbox conflict
 * copies. The one exception is `.obsidian/app.json`, which the importer reads
 * to find the attachment folder.
 *
 * Callers should apply this before reading file contents - a real vault is
 * mostly `.git`, and reading it would cost hundreds of megabytes of memory.
 */
export function isIgnoredObsidianPath(path: string): boolean {
  if (isSystemImportPath(path)) return true;

  const normalized = normalizeFilePathReference(path);
  if (normalized.endsWith(OBSIDIAN_APP_CONFIG_SUFFIX)) return false;

  const segments = normalized.split('/').filter(Boolean);
  if (segments.some(segment => segment.startsWith('.'))) return true;

  return OBSIDIAN_TEMP_FILE_RE.test(segments.at(-1) ?? '');
}

function flattenFrontmatterEntries(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/[,;]+/)
      .map(entry => entry.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenFrontmatterEntries);
  }
  if (value === null || value === undefined || typeof value === 'object') {
    return [];
  }
  return [String(value)];
}

function normalizeObsidianTag(value: string): string {
  return value
    .trim()
    .replace(/^#/, '')
    .replace(/^\[\[([^\]]+)\]\]$/, '$1')
    .trim();
}

/**
 * Reads `tags:`/`tag:` front matter. Nested names such as `language/English`
 * are kept whole - the commit service decides whether to collapse them.
 */
function collectObsidianTags(
  data: Record<string, unknown>
): string[] | undefined {
  const tags = new Set<string>();
  for (const [rawKey, value] of Object.entries(data)) {
    if (!OBSIDIAN_TAG_KEYS.includes(rawKey.trim().toLowerCase())) continue;
    for (const entry of flattenFrontmatterEntries(value)) {
      const tag = normalizeObsidianTag(entry);
      if (tag) tags.add(tag);
    }
  }
  return tags.size ? Array.from(tags) : undefined;
}

function renderFrontmatterValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map(renderFrontmatterValue).filter(Boolean).join(', ');
  }
  if (value === null || value === undefined || typeof value === 'object') {
    return '';
  }
  return String(value);
}

/**
 * AFFiNE has no doc meta for a vault's own keys - `author`, `subjects`,
 * `categories`, ... - and dropping them would cut the links the vault is
 * organised by. They are rendered as a list at the top of the note instead, so
 * the wikilinks inside them resolve to real docs.
 */
function renderObsidianProperties(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [rawKey, value] of Object.entries(data)) {
    const key = rawKey.trim();
    if (!key || OBSIDIAN_HANDLED_FRONTMATTER_KEYS.has(key.toLowerCase())) {
      continue;
    }
    const rendered = renderFrontmatterValue(value);
    if (!rendered) continue;
    lines.push(`- **${key}**: ${rendered}`);
  }
  return lines.join('\n');
}

async function getAttachmentFolderPath(importedFiles: File[]) {
  const appConfig = importedFiles.find(file => {
    const path = normalizeFilePathReference(
      file.webkitRelativePath || file.name
    );
    return (
      path.endsWith('/.obsidian/app.json') || path === '.obsidian/app.json'
    );
  });
  if (!appConfig) return undefined;

  try {
    const parsed = JSON.parse(await appConfig.text()) as {
      attachmentFolderPath?: unknown;
    };
    return typeof parsed.attachmentFolderPath === 'string' &&
      parsed.attachmentFolderPath.trim()
      ? normalizeFilePathReference(parsed.attachmentFolderPath.trim())
      : undefined;
  } catch {
    return undefined;
  }
}

function buildObsidianFolders(
  markdownFiles: MarkdownFileImportEntry[],
  vaultRoot: string
): ImportFolder[] | undefined {
  const folders = new Map<string, ImportFolder>();

  for (const file of markdownFiles) {
    const normalizedPath = normalizeFilePathReference(file.fullPath);
    const vaultPath =
      vaultRoot && normalizedPath.startsWith(`${vaultRoot}/`)
        ? normalizedPath.slice(vaultRoot.length + 1)
        : normalizedPath;
    const parts = vaultPath.split('/').filter(Boolean);
    parts.pop();
    if (parts.length === 0) continue;

    let parentPath: string | undefined;
    for (const name of parts) {
      const path = parentPath ? `${parentPath}/${name}` : name;
      folders.set(path, { path, name, parentPath });
      parentPath = path;
    }
    folders.set(`${parentPath}/__doc__${file.pageId}`, {
      path: `${parentPath}/__doc__${file.pageId}`,
      name: `__doc__${file.pageId}`,
      parentPath,
      pageId: file.pageId,
    });
  }

  return folders.size ? Array.from(folders.values()) : undefined;
}

/**
 * Plans a vault as a stream of batches. Everything the wikilink lookup needs -
 * page ids, emojis, staged assets - is collected up front, because a link may
 * point at any note in the vault; only snapshot building is chunked.
 */
export async function* planObsidianVaultBatches({
  collection,
  schema,
  importedFiles,
  extensions,
  batchSize = OBSIDIAN_DEFAULT_BATCH_SIZE,
}: ImportObsidianVaultOptions): AsyncGenerator<ImportBatch> {
  const provider = getProvider([
    obsidianWikilinkToDeltaMatcher,
    obsidianAttachmentEmbedMarkdownAdapterMatcher,
    ...extensions,
  ]);

  const docEmojis = new Map<string, string>();
  const pendingAssets: AssetMap = new Map();
  const pendingPathBlobIdMap: PathBlobIdMap = new Map();
  const markdownBlobs: MarkdownFileImportEntry[] = [];
  const pageLookupMap = new Map<string, PageLookupEntry>();
  const importedPaths = importedFiles.map(
    file => file.webkitRelativePath || file.name
  );
  const vaultRoot = getVaultRoot(importedPaths);
  const attachmentFolderPath = await getAttachmentFolderPath(importedFiles);

  for (const file of importedFiles) {
    const filePath = file.webkitRelativePath || file.name;
    if (isIgnoredObsidianPath(filePath) || isObsidianConfigPath(filePath)) {
      continue;
    }

    if (file.name.endsWith('.md')) {
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      const markdown = await file.text();
      const {
        content: body,
        meta: parsedMeta,
        data,
      } = parseFrontmatter(markdown);
      const properties = renderObsidianProperties(data);
      const content = properties
        ? `${properties}\n\n${body.replace(/^\s+/, '')}`
        : body;
      const meta: ParsedFrontmatterMeta = { ...parsedMeta };
      const tags = collectObsidianTags(data);
      if (tags) {
        meta.tags = tags;
      } else {
        delete meta.tags;
      }

      const documentTitleCandidate = meta.title ?? fileNameWithoutExt;
      const { title: preferredTitle, emoji: leadingEmoji } =
        extractTitleAndEmoji(documentTitleCandidate);

      const newPageId = collection.idGenerator();
      registerPageLookup(pageLookupMap, filePath, newPageId, LOOKUP_RANK.path);
      registerPageLookup(
        pageLookupMap,
        stripMarkdownExtension(filePath),
        newPageId,
        LOOKUP_RANK.path
      );
      registerPageLookup(
        pageLookupMap,
        file.name,
        newPageId,
        LOOKUP_RANK.fileName
      );
      registerPageLookup(
        pageLookupMap,
        fileNameWithoutExt,
        newPageId,
        LOOKUP_RANK.fileName
      );
      registerPageLookup(
        pageLookupMap,
        documentTitleCandidate,
        newPageId,
        LOOKUP_RANK.declaredTitle
      );
      registerPageLookup(
        pageLookupMap,
        preferredTitle,
        newPageId,
        LOOKUP_RANK.strippedTitle
      );

      if (leadingEmoji) {
        docEmojis.set(newPageId, leadingEmoji);
      }

      markdownBlobs.push({
        filename: file.name,
        contentBlob: file,
        fullPath: filePath,
        pageId: newPageId,
        preferredTitle,
        content,
        meta,
      });
    } else {
      await stageImportedAsset({
        pendingAssets,
        pendingPathBlobIdMap,
        path: filePath,
        content: file,
        fileName: file.name,
      });
    }
  }

  const assetLookup = createAssetLookup(
    pendingPathBlobIdMap,
    vaultRoot,
    attachmentFolderPath
  );

  for (const existingDocMeta of collection.meta.docMetas) {
    if (existingDocMeta.title) {
      registerPageLookup(
        pageLookupMap,
        existingDocMeta.title,
        existingDocMeta.id,
        LOOKUP_RANK.declaredTitle
      );
    }
  }

  const pageIdByLookup = flattenPageLookup(pageLookupMap);

  const buildDoc = async (
    markdownFile: MarkdownFileImportEntry
  ): Promise<ImportDoc | null> => {
    const {
      fullPath,
      pageId: predefinedId,
      preferredTitle,
      content,
      meta,
    } = markdownFile;

    const job = createMarkdownImportJob({
      collection,
      schema,
      preferredTitle,
      fullPath,
    });

    for (const [lookupKey, id] of pageIdByLookup) {
      if (id === AMBIGUOUS_PAGE_LOOKUP) {
        continue;
      }
      job.adapterConfigs.set(`obsidian:pageId:${lookupKey}`, id);
    }
    for (const [id, emoji] of docEmojis.entries()) {
      job.adapterConfigs.set('obsidian:pageEmoji:' + id, emoji);
    }

    bindImportedAssetsToJob(job, pendingAssets, pendingPathBlobIdMap);

    const preprocessedMarkdown = preprocessObsidianMarkdown(
      content,
      fullPath,
      pageIdByLookup,
      assetLookup
    );
    const mdAdapter = new MarkdownAdapter(job, provider);
    const snapshot = await mdAdapter.toDocSnapshot({
      file: preprocessedMarkdown,
      assets: job.assetsManager,
    });

    if (!snapshot) return null;

    snapshot.meta.id = predefinedId;
    // Without this the page header reads "Untitled" while the sidebar shows the
    // file name, and editing that header writes "Untitled" over the real title.
    applySnapshotTitle(snapshot, preferredTitle);
    return {
      id: predefinedId,
      sourcePath: fullPath,
      snapshot,
      meta: { ...meta, title: preferredTitle, trash: false },
    };
  };

  const blobs = await blobsFromAssets(pendingAssets, pendingPathBlobIdMap);
  const total = markdownBlobs.length;

  if (total === 0) {
    yield { docs: [], blobs, progress: { completed: 0, total: 0 }, done: true };
    return;
  }

  const size = Math.max(1, batchSize);
  for (let offset = 0; offset < total; offset += size) {
    const slice = markdownBlobs.slice(offset, offset + size);
    const docs = (await Promise.all(slice.map(buildDoc))).filter(
      (doc): doc is ImportDoc => doc !== null
    );
    const sliceIcons = slice
      .filter(file => docEmojis.has(file.pageId))
      .map(file => ({
        docId: file.pageId,
        icon: {
          type: 'emoji' as const,
          unicode: docEmojis.get(file.pageId) as string,
        },
      }));
    const completed = Math.min(offset + size, total);

    yield {
      docs,
      // Blobs ride along with the first batch so embeds resolve from the very
      // first doc that references them.
      blobs: offset === 0 ? blobs : [],
      folders: buildObsidianFolders(slice, vaultRoot),
      icons: sliceIcons,
      progress: { completed, total },
      done: completed >= total,
    };
  }
}

/**
 * Plans the whole vault as a single batch. Kept for callers that commit in one
 * shot; the import service streams {@link planObsidianVaultBatches} instead.
 */
export async function planObsidianVault(
  options: ImportObsidianVaultOptions
): Promise<PlanObsidianVaultResult> {
  const docIds: string[] = [];
  const docEmojis = new Map<string, string>();
  const docs: ImportDoc[] = [];
  const blobs: ImportBatch['blobs'] = [];
  const folders: ImportFolder[] = [];
  const icons: NonNullable<ImportBatch['icons']> = [];

  for await (const batch of planObsidianVaultBatches(options)) {
    for (const doc of batch.docs) {
      docs.push(doc);
      docIds.push(doc.id);
    }
    blobs.push(...batch.blobs);
    folders.push(...(batch.folders ?? []));
    for (const icon of batch.icons ?? []) {
      icons.push(icon);
      if (icon.icon.type === 'emoji') {
        docEmojis.set(icon.docId, icon.icon.unicode);
      }
    }
  }

  return {
    docIds,
    docEmojis,
    batch: {
      docs,
      blobs,
      folders: folders.length ? folders : undefined,
      icons,
      done: true,
    },
  };
}

export const ObsidianTransformer = {
  planObsidianVault,
  planObsidianVaultBatches,
};
