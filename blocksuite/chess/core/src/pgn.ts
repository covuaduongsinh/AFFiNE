import { clonePosition, parseFen, startPosition, toFen } from './fen';
import { applyMove } from './position';
import { moveToSan, sanToMove } from './san';
import {
  type Game,
  type GameHeader,
  type GameResult,
  type MoveNode,
  type Position,
  WHITE,
} from './types';

export class PgnError extends Error {
  override name = 'PgnError';
}

/** Suffix annotations and the NAG numbers the PGN standard assigns them. */
const SUFFIX_NAGS: Record<string, number> = {
  '!': 1,
  '?': 2,
  '!!': 3,
  '??': 4,
  '!?': 5,
  '?!': 6,
};

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/** Tag order mandated by the PGN standard, followed by everything else. */
const SEVEN_TAG_ROSTER = [
  'Event',
  'Site',
  'Date',
  'Round',
  'White',
  'Black',
  'Result',
];

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'move'; value: string; nags: number[] }
  | { kind: 'nag'; value: number }
  | { kind: 'comment'; value: string }
  | { kind: 'variation-start' }
  | { kind: 'variation-end' }
  | { kind: 'result'; value: GameResult };

function tokenizeMovetext(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    if (ch === '{') {
      const end = text.indexOf('}', i + 1);
      if (end === -1) throw new PgnError('Unterminated { comment');
      tokens.push({
        kind: 'comment',
        value: text
          .slice(i + 1, end)
          .trim()
          .replace(/\s+/g, ' '),
      });
      i = end + 1;
      continue;
    }

    if (ch === ';') {
      // Rest-of-line comment.
      let end = text.indexOf('\n', i);
      if (end === -1) end = text.length;
      tokens.push({ kind: 'comment', value: text.slice(i + 1, end).trim() });
      i = end;
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'variation-start' });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ kind: 'variation-end' });
      i++;
      continue;
    }

    if (ch === '$') {
      let j = i + 1;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      tokens.push({
        kind: 'nag',
        value: Number.parseInt(text.slice(i + 1, j), 10),
      });
      i = j;
      continue;
    }

    if (ch === '<' || ch === '>') {
      // Reserved by the standard for future expansion; skip.
      i++;
      continue;
    }

    // A bare word: move number, SAN token, or result.
    let j = i;
    while (j < text.length && !' \t\r\n{}();$'.includes(text[j])) j++;
    const word = text.slice(i, j);
    i = j;

    if (word === '') continue;

    if (RESULTS.has(word)) {
      tokens.push({ kind: 'result', value: word as GameResult });
      continue;
    }

    // Move numbers such as `12.`, `12...` carry no information the tree lacks.
    const withoutNumber = word.replace(/^\d+\.+/, '');
    if (withoutNumber === '' || /^\.+$/.test(withoutNumber)) continue;

    // Split trailing suffix annotations off the SAN token.
    const suffixMatch = /([!?]{1,2})$/.exec(withoutNumber);
    const nags: number[] = [];
    let san = withoutNumber;
    if (suffixMatch) {
      const nag = SUFFIX_NAGS[suffixMatch[1]];
      if (nag !== undefined) {
        nags.push(nag);
        san = withoutNumber.slice(0, -suffixMatch[1].length);
      }
    }

    if (san === '') continue;
    tokens.push({ kind: 'move', value: san, nags });
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseTagPairs(text: string): { headers: GameHeader; rest: string } {
  const headers: GameHeader = {};
  const tagPattern = /\[\s*(\w+)\s*"((?:[^"\\]|\\.)*)"\s*\]/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(text)) !== null) {
    // Stop as soon as a non-tag, non-blank line appears: movetext has begun.
    const between = text.slice(lastIndex, match.index);
    if (between.trim() !== '') break;
    headers[match[1]] = match[2].replace(/\\(["\\])/g, '$1');
    lastIndex = match.index + match[0].length;
  }

  return { headers, rest: text.slice(lastIndex) };
}

/** State the parser restores when a variation closes. */
interface Frame {
  target: MoveNode[];
  position: Position;
  last?: MoveNode;
  lastTarget?: MoveNode[];
  lastPosition?: Position;
}

/**
 * Parse a single game's movetext into a move tree.
 *
 * Variations are stored as siblings: `children[0]` continues the line and
 * `children[1..]` are the alternatives, in source order. That is what makes
 * `(1... c5 2. Nf3)` after `1... e5` land in the right place — an alternative is
 * an alternative to the *previous* move, not a child of it.
 */
function parseMovetext(
  tokens: Token[],
  setup: Position
): { moves: MoveNode[]; result: GameResult; commentBefore?: string } {
  const moves: MoveNode[] = [];
  let nextId = 0;

  let frame: Frame = { target: moves, position: setup };
  const stack: Frame[] = [];

  let result: GameResult = '*';
  let pendingComment: string | undefined;
  let rootComment: string | undefined;

  for (const token of tokens) {
    switch (token.kind) {
      case 'variation-start': {
        if (!frame.lastTarget || !frame.lastPosition) {
          throw new PgnError('Variation opened before any move was played');
        }
        stack.push(frame);
        frame = {
          target: frame.lastTarget,
          position: frame.lastPosition,
        };
        break;
      }

      case 'variation-end': {
        const parent = stack.pop();
        if (!parent) throw new PgnError('Unbalanced ")" in movetext');
        frame = parent;
        break;
      }

      case 'comment': {
        if (frame.last) {
          frame.last.comment = frame.last.comment
            ? `${frame.last.comment} ${token.value}`
            : token.value;
        } else if (stack.length === 0 && moves.length === 0) {
          rootComment = rootComment
            ? `${rootComment} ${token.value}`
            : token.value;
        } else {
          pendingComment = pendingComment
            ? `${pendingComment} ${token.value}`
            : token.value;
        }
        break;
      }

      case 'nag': {
        if (frame.last) frame.last.nags.push(token.value);
        break;
      }

      case 'result': {
        result = token.value;
        break;
      }

      case 'move': {
        const before = frame.position;
        const move = sanToMove(before, token.value);
        const after = applyMove(before, move);
        const node: MoveNode = {
          id: `n${nextId++}`,
          san: moveToSan(before, move),
          move,
          fenBefore: toFen(before),
          fenAfter: toFen(after),
          nags: [...token.nags],
          children: [],
        };
        if (pendingComment !== undefined) {
          node.commentBefore = pendingComment;
          pendingComment = undefined;
        }

        frame.target.push(node);
        frame.lastTarget = frame.target;
        frame.lastPosition = before;
        frame.last = node;
        frame.target = node.children;
        frame.position = after;
        break;
      }
    }
  }

  if (stack.length > 0) throw new PgnError('Unbalanced "(" in movetext');

  return rootComment === undefined
    ? { moves, result }
    : { moves, result, commentBefore: rootComment };
}

/** Split a PGN file into individual games on tag-pair boundaries. */
function splitGames(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const games: string[] = [];
  const lines = normalized.split('\n');

  let current: string[] = [];
  let seenMovetext = false;

  for (const line of lines) {
    const isTag = /^\s*\[\s*\w+\s*"/.test(line);
    if (isTag && seenMovetext && current.some(l => l.trim() !== '')) {
      games.push(current.join('\n'));
      current = [];
      seenMovetext = false;
    }
    if (!isTag && line.trim() !== '') seenMovetext = true;
    current.push(line);
  }

  if (current.some(l => l.trim() !== '')) games.push(current.join('\n'));
  return games;
}

/** Parse every game in a PGN file. */
export function parsePgnGames(text: string): Game[] {
  return splitGames(text)
    .filter(chunk => chunk.trim() !== '')
    .map(parseSingleGame);
}

/** Parse the first game in a PGN file. */
export function parsePgn(text: string): Game {
  const games = parsePgnGames(text);
  if (games.length === 0) throw new PgnError('No game found in PGN text');
  return games[0];
}

function parseSingleGame(text: string): Game {
  const { headers, rest } = parseTagPairs(text);

  const setup =
    headers.FEN !== undefined ? parseFen(headers.FEN) : startPosition();

  const tokens = tokenizeMovetext(rest);
  const { moves, result, commentBefore } = parseMovetext(
    tokens,
    clonePosition(setup)
  );

  const headerResult = headers.Result;
  const finalResult: GameResult =
    result !== '*'
      ? result
      : headerResult && RESULTS.has(headerResult)
        ? (headerResult as GameResult)
        : '*';

  const game: Game = {
    headers,
    setup,
    moves,
    result: finalResult,
  };
  if (commentBefore !== undefined) game.commentBefore = commentBefore;
  return game;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** A comment or a preceding variation forces black to restate the move number. */
function needsNumberAfter(node: MoveNode): boolean {
  return node.comment !== undefined;
}

function renderSingle(node: MoveNode, forceNumber: boolean): string[] {
  const out: string[] = [];
  if (node.commentBefore !== undefined) out.push(`{${node.commentBefore}}`);

  const pos = parseFen(node.fenBefore);
  if (pos.turn === WHITE) {
    out.push(`${pos.fullmoves}.`);
  } else if (forceNumber || node.commentBefore !== undefined) {
    out.push(`${pos.fullmoves}...`);
  }

  out.push(node.san);
  for (const nag of node.nags) out.push(`$${nag}`);
  if (node.comment !== undefined) out.push(`{${node.comment}}`);
  return out;
}

function renderChildren(children: MoveNode[], forceNumber: boolean): string[] {
  if (children.length === 0) return [];

  const [main, ...alternatives] = children;
  const out = renderSingle(main, forceNumber);

  for (const alt of alternatives) {
    out.push('(');
    out.push(...renderSingle(alt, true));
    out.push(...renderChildren(alt.children, needsNumberAfter(alt)));
    out.push(')');
  }

  out.push(
    ...renderChildren(
      main.children,
      alternatives.length > 0 || needsNumberAfter(main)
    )
  );
  return out;
}

/**
 * Join tokens into lines of at most `width` characters, as the PGN export
 * standard requires. Parentheses hug the tokens they wrap.
 */
function wrap(tokens: string[], width: number): string {
  const lines: string[] = [];
  let line = '';

  for (const token of tokens) {
    const glueLeft = token === ')';
    const candidate =
      line === '' ? token : glueLeft ? `${line}${token}` : `${line} ${token}`;

    if (candidate.length > width && line !== '') {
      lines.push(line);
      line = token;
    } else {
      line = candidate;
    }
  }

  if (line !== '') lines.push(line);
  return lines.join('\n');
}

/** Render a {@link Game} back to PGN text. */
export function serializePgn(game: Game, options?: { width?: number }): string {
  const width = options?.width ?? 80;

  const headers: GameHeader = { ...game.headers };
  headers.Result = game.result;
  if (
    game.setup.turn !== undefined &&
    toFen(game.setup) !== toFen(startPosition())
  ) {
    headers.SetUp = '1';
    headers.FEN = toFen(game.setup);
  }

  const keys = [
    ...SEVEN_TAG_ROSTER.filter(key => headers[key] !== undefined),
    ...Object.keys(headers)
      .filter(key => !SEVEN_TAG_ROSTER.includes(key))
      .sort(),
  ];

  const tagLines = keys.map(key => {
    const value = String(headers[key] ?? '').replace(/(["\\])/g, '\\$1');
    return `[${key} "${value}"]`;
  });

  const tokens = renderChildren(game.moves, false);
  tokens.push(game.result);

  const movetext = wrap(tokens, width);
  return `${tagLines.join('\n')}\n\n${movetext}\n`;
}

/** Render a whole collection back to a single PGN file. */
export function serializePgnGames(
  games: Game[],
  options?: { width?: number }
): string {
  return games.map(game => serializePgn(game, options)).join('\n');
}
