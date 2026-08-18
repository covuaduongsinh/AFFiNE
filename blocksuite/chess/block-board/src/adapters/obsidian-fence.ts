import type { ChessBoardArrow, ChessBoardHighlight } from '../model.js';

/**
 * Reading and writing the body of a `chessboard` fence.
 *
 * The format is not ours to define: it belongs to the Obsidian plugin the
 * notes are written for (`obsidian-chessboard`, "Chessboard Viewer"). Its
 * parser is blunt in ways that dictate everything here:
 *
 * - Line 0 is *unconditionally* the FEN. The `fen: ` prefix is stripped when
 *   present, so nothing may ever be written before that line.
 * - Every other line is matched with a raw `startsWith` against `"strict: "`,
 *   `"orientation: "` and `"annotations: "` — column 0, exactly one space, no
 *   trimming and no case folding. A key it does not recognise is ignored in
 *   silence, and only a bad `orientation:` value makes it throw.
 * - `annotations:` is the one key for both arrows and tinted squares, and
 *   several such lines accumulate.
 *
 * Hence the two carrier props: whatever this block does not model is kept
 * *verbatim* — lines in {@link FenceBody.extraLines}, annotation tokens in
 * {@link FenceBody.extraAnnotations} — and written back out untouched. A real
 * vault has thousands of `strict: false` lines whose loss turns king-less
 * diagrams into red error text, so the bytes, not our reading of them, are the
 * contract.
 */

/** The four colours the plugin's token suffixes select, by its own values. */
export const ANNOTATION_COLORS = {
  r: '#e67768',
  g: '#b3ce6e',
  b: '#6ab5d6',
  y: '#f1ad24',
} as const;

export type AnnotationColorKey = keyof typeof ANNOTATION_COLORS;

/** An arrow written without a suffix is yellow… */
export const ARROW_DEFAULT_COLOR = ANNOTATION_COLORS.y;
/** …but an unsuffixed highlight is red. The defaults genuinely differ. */
export const HIGHLIGHT_DEFAULT_COLOR = ANNOTATION_COLORS.r;

const SQUARE = '[a-h][1-8]';
/**
 * The plugin slices an arrow's squares with `substring(1, 6)`, so `e2-e4` is
 * the only shape it can read — anchoring to single characters here keeps us
 * from ever writing one it would mangle.
 */
const ARROW_RE = new RegExp(`^A(${SQUARE})-(${SQUARE})(?:/([rgby]))?$`);
/** Highlights take no `/r`: their unsuffixed default is already that red. */
const HIGHLIGHT_RE = new RegExp(`^H(${SQUARE})(?:/([ygb]))?$`);
const SQUARE_RE = new RegExp(`^${SQUARE}$`);

const ORIENTATION_KEY = 'orientation: ';
const ANNOTATIONS_KEY = 'annotations: ';
const FEN_KEY = 'fen:';

export interface FenceBody {
  fen: string;
  orientation?: 'white' | 'black';
  arrows: ChessBoardArrow[];
  highlights: ChessBoardHighlight[];
  extraLines: string[];
  extraAnnotations: string[];
}

/** Everything the serializer reads, all of it optional for old snapshots. */
export interface FenceProps {
  fen: string;
  orientation?: string;
  arrows?: ChessBoardArrow[];
  highlights?: ChessBoardHighlight[];
  extraLines?: string[];
  extraAnnotations?: string[];
}

/**
 * One annotation token, or null when we do not model it — a circle, a move
 * quality icon, a typo. Null means "keep the token verbatim", never "drop it".
 */
function readAnnotationToken(
  token: string
): { arrow?: ChessBoardArrow; highlight?: ChessBoardHighlight } | null {
  const arrow = ARROW_RE.exec(token);
  if (arrow) {
    const [, from, to, suffix] = arrow;
    return {
      arrow: {
        from,
        to,
        color: suffix
          ? ANNOTATION_COLORS[suffix as AnnotationColorKey]
          : ARROW_DEFAULT_COLOR,
      },
    };
  }

  const highlight = HIGHLIGHT_RE.exec(token);
  if (highlight) {
    const [, square, suffix] = highlight;
    return {
      highlight: {
        square,
        color: suffix
          ? ANNOTATION_COLORS[suffix as AnnotationColorKey]
          : HIGHLIGHT_DEFAULT_COLOR,
      },
    };
  }

  return null;
}

/**
 * Split a fence body the way the plugin does.
 *
 * Returns null only when there is no position to build a board from; every
 * other input is representable, because anything unrecognised has a verbatim
 * home to go to.
 */
export function readFenceBody(value: string): FenceBody | null {
  // A vault synced on Windows can hand us CRLF; a stray \r kept in an extra
  // line would be written back out for good.
  const lines = value
    .split('\n')
    .map(line => (line.endsWith('\r') ? line.slice(0, -1) : line));

  const head = lines[0] ?? '';
  const fen = (
    head.startsWith(FEN_KEY) ? head.slice(FEN_KEY.length) : head
  ).trim();
  if (fen === '') return null;

  let orientation: 'white' | 'black' | undefined;
  const arrows: ChessBoardArrow[] = [];
  const highlights: ChessBoardHighlight[] = [];
  const extraLines: string[] = [];
  const extraAnnotations: string[] = [];

  for (const line of lines.slice(1)) {
    if (line.startsWith(ORIENTATION_KEY)) {
      const value = line.slice(ORIENTATION_KEY.length);
      // Any other value makes the plugin throw. Repairing it would change how
      // the note renders in Obsidian, so it stays as the author left it.
      if (value === 'black' || value === 'white') {
        orientation = value;
        continue;
      }
      extraLines.push(line);
      continue;
    }

    if (line.startsWith(ANNOTATIONS_KEY)) {
      for (const token of line.slice(ANNOTATIONS_KEY.length).split(' ')) {
        if (token === '') continue;
        const parsed = readAnnotationToken(token);
        if (parsed?.arrow) arrows.push(parsed.arrow);
        else if (parsed?.highlight) highlights.push(parsed.highlight);
        else extraAnnotations.push(token);
      }
      continue;
    }

    // `strict: false`, a piece style, a blank line, a key from a plugin
    // version newer than the one this vault runs — none of it is ours to read.
    extraLines.push(line);
  }

  return { fen, orientation, arrows, highlights, extraLines, extraAnnotations };
}

/** `#abc` -> `#aabbcc`, so the lookup below can be a plain table. */
function normalizeColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return value;
}

const ARROW_SUFFIXES = ['r', 'g', 'b', 'y'] as const;
const HIGHLIGHT_SUFFIXES = ['y', 'g', 'b'] as const;

/**
 * The suffix for a colour, or `''` for the family's default and for anything
 * we cannot name.
 *
 * A colour outside the palette degrades to the default rather than inventing a
 * token: the plugin parses no other colour spelling, and the `#`-prefixed
 * token space is already claimed upstream by the checkmate icons.
 */
function colorSuffix(
  color: string | undefined,
  defaultColor: string,
  available: readonly AnnotationColorKey[]
): string {
  const value = normalizeColor(color);
  if (value === undefined || value === defaultColor) return '';
  for (const key of available) {
    if (ANNOTATION_COLORS[key] === value) return `/${key}`;
  }
  return '';
}

/** Placement field only: a diagram with no king needs `strict: false`. */
function hasBothKings(fen: string): boolean {
  const placement = fen.trim().split(/\s+/)[0] ?? '';
  return placement.includes('k') && placement.includes('K');
}

/**
 * Build a fence body in canonical order: the FEN, the orientation when it is
 * flipped, everything we kept verbatim, then a single annotations line.
 *
 * `orientation: white` is deliberately never written — it is the plugin's
 * default, and adding it would grow every existing two-line fence in the vault.
 */
export function writeFenceBody(props: FenceProps): string {
  const lines = [`fen: ${props.fen}`];

  if (props.orientation === 'black') lines.push('orientation: black');

  const extraLines = props.extraLines ?? [];
  lines.push(...extraLines);

  // A position without kings fails the plugin's validator, so a diagram built
  // here would render as an error in Obsidian without this line.
  if (
    !hasBothKings(props.fen) &&
    !extraLines.some(line => line.startsWith('strict:'))
  ) {
    lines.push('strict: false');
  }

  const tokens = [
    ...(props.arrows ?? [])
      .filter(arrow => SQUARE_RE.test(arrow.from) && SQUARE_RE.test(arrow.to))
      .map(
        arrow =>
          `A${arrow.from}-${arrow.to}${colorSuffix(
            arrow.color,
            ARROW_DEFAULT_COLOR,
            ARROW_SUFFIXES
          )}`
      ),
    ...(props.highlights ?? [])
      .filter(highlight => SQUARE_RE.test(highlight.square))
      .map(
        highlight =>
          `H${highlight.square}${colorSuffix(
            highlight.color,
            HIGHLIGHT_DEFAULT_COLOR,
            HIGHLIGHT_SUFFIXES
          )}`
      ),
    ...(props.extraAnnotations ?? []),
  ];
  if (tokens.length > 0) lines.push(`annotations: ${tokens.join(' ')}`);

  return lines.join('\n');
}
