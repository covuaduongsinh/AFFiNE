import { describe, expect, it } from 'vitest';

import { chessBoardMarkdownAdapterMatcher } from '../adapters/markdown.js';
import {
  ANNOTATION_COLORS,
  ARROW_DEFAULT_COLOR,
  HIGHLIGHT_DEFAULT_COLOR,
} from '../adapters/obsidian-fence.js';
import {
  ChessBoardBlockSchema,
  DEFAULT_BOARD_SIZE,
  START_FEN,
} from '../model.js';

/**
 * The adapter's `toMatch` / `fromMatch` predicates decide whether a board
 * survives a Markdown round-trip at all, so they are worth pinning down
 * without standing up a whole editor.
 */
const codeNode = (lang: string | null, value: string, meta?: string | null) =>
  ({
    node: { type: 'code', lang, value, meta: meta ?? null },
  }) as Parameters<typeof chessBoardMarkdownAdapterMatcher.toMatch>[0];

const blockNode = (flavour: string) =>
  ({
    node: { flavour },
  }) as Parameters<typeof chessBoardMarkdownAdapterMatcher.fromMatch>[0];

describe('chess board markdown adapter', () => {
  it('claims the flavour it is registered for', () => {
    expect(chessBoardMarkdownAdapterMatcher.flavour).toBe(
      ChessBoardBlockSchema.model.flavour
    );
    expect(chessBoardMarkdownAdapterMatcher.flavour).toBe('affine:chess-board');
  });

  it('matches a fenced block tagged fen', () => {
    expect(
      chessBoardMarkdownAdapterMatcher.toMatch(codeNode('fen', START_FEN))
    ).toBe(true);
  });

  it('matches a fenced block tagged chessboard', () => {
    expect(
      chessBoardMarkdownAdapterMatcher.toMatch(
        codeNode('chessboard', `fen: ${START_FEN}`)
      )
    ).toBe(true);
  });

  it('leaves other code fences alone', () => {
    expect(
      chessBoardMarkdownAdapterMatcher.toMatch(codeNode('ts', 'const a = 1;'))
    ).toBe(false);
    expect(
      chessBoardMarkdownAdapterMatcher.toMatch(codeNode(null, START_FEN))
    ).toBe(false);
  });

  it('matches its own blocks on the way out and nothing else', () => {
    expect(
      chessBoardMarkdownAdapterMatcher.fromMatch(
        blockNode('affine:chess-board')
      )
    ).toBe(true);
    expect(
      chessBoardMarkdownAdapterMatcher.fromMatch(blockNode('affine:paragraph'))
    ).toBe(false);
  });
});

/**
 * Runs an adapter direction against a stub walker and returns every node it
 * opened — enough to assert imports and exports without standing up a doc.
 */
function runEnter(
  enter: ((o: never, context: never) => void) | undefined,
  node: unknown
) {
  const opened: Record<string, unknown>[] = [];
  const walkerContext = {
    openNode(opening: Record<string, unknown>) {
      opened.push(opening);
      return walkerContext;
    },
    closeNode() {
      return walkerContext;
    },
  };
  enter?.(node as never, { walkerContext } as never);
  return opened;
}

const KINGLESS_FEN = '8/8/4P3/8/8/8/8/8 w - - 0 1';

describe('importing fenced markdown', () => {
  const importNode = (lang: string, value: string, meta?: string | null) =>
    runEnter(
      chessBoardMarkdownAdapterMatcher.toBlockSnapshot.enter,
      codeNode(lang, value, meta)
    );

  it('reads the Obsidian chessboard form with a fen: line', () => {
    const [block] = importNode('chessboard', `fen: ${START_FEN}`);
    expect(block).toMatchObject({
      flavour: 'affine:chess-board',
      props: { fen: START_FEN, orientation: 'white', editable: false },
    });
  });

  it('reads an orientation: line from the body', () => {
    const [block] = importNode(
      'chessboard',
      `fen: ${START_FEN}\norientation: black`
    );
    expect(block).toMatchObject({ props: { orientation: 'black' } });
  });

  it('keeps option keys it does not model, verbatim and in order', () => {
    const [block] = importNode(
      'chessboard',
      `fen: ${START_FEN}\nstrict: false\npieceStyle: cburnett`
    );
    expect(block).toMatchObject({
      props: {
        fen: START_FEN,
        extraLines: ['strict: false', 'pieceStyle: cburnett'],
      },
    });
  });

  it('keeps a blank line inside the fence', () => {
    const [block] = importNode('chessboard', `fen: ${START_FEN}\n\nstrict: f`);
    expect(block).toMatchObject({ props: { extraLines: ['', 'strict: f'] } });
  });

  it('reads the position from line 0 even when a later line says fen:', () => {
    // The plugin only ever reads lines[0]; a second fen: line is decoration.
    const [block] = importNode(
      'chessboard',
      `fen: ${START_FEN}\nfen: ${KINGLESS_FEN}`
    );
    expect(block).toMatchObject({
      props: { fen: START_FEN, extraLines: [`fen: ${KINGLESS_FEN}`] },
    });
  });

  it('imports a bare position followed by an option line', () => {
    // Four fences in the real vault are written this way. Reading the fen:
    // key rather than line 0 used to make the whole fence disappear.
    const [block] = importNode('chessboard', `${KINGLESS_FEN}\nstrict: false`);
    expect(block).toMatchObject({
      props: { fen: KINGLESS_FEN, extraLines: ['strict: false'] },
    });
  });

  it('keeps a malformed orientation value rather than repairing it', () => {
    // The plugin throws on this, and rewriting it would change what the
    // author's Obsidian shows.
    const [block] = importNode(
      'chessboard',
      `fen: ${START_FEN}\norientation: BLACK`
    );
    expect(block).toMatchObject({
      props: { orientation: 'white', extraLines: ['orientation: BLACK'] },
    });
  });

  it('still reads the bare fen fence', () => {
    const [block] = importNode('fen', START_FEN);
    expect(block).toMatchObject({ props: { fen: START_FEN } });
  });

  it('keeps honouring orientation carried in the fence meta', () => {
    const [block] = importNode('fen', START_FEN, 'orientation=black');
    expect(block).toMatchObject({ props: { orientation: 'black' } });
  });

  it('accepts a king-less diagram position', () => {
    const [block] = importNode('chessboard', `fen: ${KINGLESS_FEN}`);
    expect(block).toMatchObject({ props: { fen: KINGLESS_FEN } });
  });

  it('leaves fences without a readable position alone', () => {
    expect(importNode('chessboard', 'pieceStyle: cburnett')).toHaveLength(0);
    expect(importNode('chessboard', 'fen: not a position')).toHaveLength(0);
    expect(importNode('fen', 'not a position')).toHaveLength(0);
  });
});

describe('importing annotations', () => {
  const importAnnotations = (line: string) => {
    const [block] = runEnter(
      chessBoardMarkdownAdapterMatcher.toBlockSnapshot.enter,
      codeNode('chessboard', `fen: ${START_FEN}\n${line}`)
    );
    return block?.props as {
      arrows: { from: string; to: string; color?: string }[];
      highlights: { square: string; color: string }[];
      extraAnnotations: string[];
    };
  };

  it('reads arrows, defaulting to yellow', () => {
    expect(importAnnotations('annotations: Ae1-e8 Ad2-d4/r').arrows).toEqual([
      { from: 'e1', to: 'e8', color: ARROW_DEFAULT_COLOR },
      { from: 'd2', to: 'd4', color: ANNOTATION_COLORS.r },
    ]);
  });

  it('reads highlights, defaulting to red rather than yellow', () => {
    // The two families genuinely disagree on their default colour.
    expect(importAnnotations('annotations: Hf5 He5/g').highlights).toEqual([
      { square: 'f5', color: HIGHLIGHT_DEFAULT_COLOR },
      { square: 'e5', color: ANNOTATION_COLORS.g },
    ]);
    expect(HIGHLIGHT_DEFAULT_COLOR).not.toBe(ARROW_DEFAULT_COLOR);
  });

  it('accumulates tokens across several annotations lines', () => {
    const props = importAnnotations('annotations: Ae1-e8\nannotations: Hf6/g');
    expect(props.arrows).toHaveLength(1);
    expect(props.highlights).toHaveLength(1);
  });

  it('ignores runs of spaces between tokens', () => {
    expect(importAnnotations('annotations: Ae1-e8   Hf5').highlights).toEqual([
      { square: 'f5', color: HIGHLIGHT_DEFAULT_COLOR },
    ]);
  });

  it('carries tokens it cannot draw instead of dropping them', () => {
    // Outlines, move-quality icons, a suffix this plugin version lacks, and
    // outright typos: all of them are somebody's notes.
    const props = importAnnotations(
      'annotations: Cd4 Sd5/b !!f7 ??g5 Hd4/r Ae1e8 Ae9-e8'
    );
    expect(props.arrows).toEqual([]);
    expect(props.highlights).toEqual([]);
    expect(props.extraAnnotations).toEqual([
      'Cd4',
      'Sd5/b',
      '!!f7',
      '??g5',
      'Hd4/r',
      'Ae1e8',
      'Ae9-e8',
    ]);
  });
});

describe('exporting to markdown', () => {
  const exportProps = (props: Record<string, unknown>) =>
    runEnter(chessBoardMarkdownAdapterMatcher.fromBlockSnapshot.enter, {
      node: { flavour: 'affine:chess-board', props },
    });

  it('writes the Obsidian chessboard form', () => {
    const [node] = exportProps({ fen: START_FEN, orientation: 'white' });
    expect(node).toMatchObject({
      type: 'code',
      lang: 'chessboard',
      value: `fen: ${START_FEN}`,
    });
  });

  it('adds an orientation line only when flipped', () => {
    const [node] = exportProps({ fen: START_FEN, orientation: 'black' });
    expect(node).toMatchObject({
      value: `fen: ${START_FEN}\norientation: black`,
    });
  });

  it('writes carried lines after the position, before annotations', () => {
    const [node] = exportProps({
      fen: START_FEN,
      orientation: 'black',
      extraLines: ['strict: false', 'pieceStyle: cburnett'],
      highlights: [{ square: 'f5', color: HIGHLIGHT_DEFAULT_COLOR }],
    });
    expect(node?.value).toBe(
      `fen: ${START_FEN}\norientation: black\nstrict: false\npieceStyle: cburnett\nannotations: Hf5`
    );
  });

  it('serialises a board saved before the carrier props existed', () => {
    const [node] = exportProps({ fen: START_FEN });
    expect(node?.value).toBe(`fen: ${START_FEN}`);
  });

  it('writes each palette colour as its suffix, defaults bare', () => {
    const [node] = exportProps({
      fen: START_FEN,
      arrows: [
        { from: 'e1', to: 'e8' },
        { from: 'a1', to: 'a8', color: ARROW_DEFAULT_COLOR },
        { from: 'b1', to: 'b8', color: ANNOTATION_COLORS.r },
        { from: 'c1', to: 'c8', color: ANNOTATION_COLORS.g },
        { from: 'd1', to: 'd8', color: ANNOTATION_COLORS.b },
      ],
      highlights: [
        { square: 'f5', color: HIGHLIGHT_DEFAULT_COLOR },
        { square: 'f6', color: ANNOTATION_COLORS.y },
        { square: 'f7', color: ANNOTATION_COLORS.g },
        { square: 'f8', color: ANNOTATION_COLORS.b },
      ],
    });
    expect(node?.value).toBe(
      `fen: ${START_FEN}\nannotations: Ae1-e8 Aa1-a8 Ab1-b8/r Ac1-c8/g Ad1-d8/b Hf5 Hf6/y Hf7/g Hf8/b`
    );
  });

  it('degrades a colour outside the palette to the family default', () => {
    // Inventing a token would be worse: this plugin version parses no other
    // colour spelling, and `#`-prefixed tokens are already spoken for.
    const [node] = exportProps({
      fen: START_FEN,
      arrows: [{ from: 'e1', to: 'e8', color: 'var(--chess-arrow)' }],
      highlights: [{ square: 'f5', color: 'rgba(21, 128, 61, 0.72)' }],
    });
    expect(node?.value).toBe(`fen: ${START_FEN}\nannotations: Ae1-e8 Hf5`);
  });

  it('reads a three-digit hex as the colour it names', () => {
    const [node] = exportProps({
      fen: START_FEN,
      highlights: [{ square: 'f5', color: '#B3CE6E' }],
    });
    expect(node?.value).toBe(`fen: ${START_FEN}\nannotations: Hf5/g`);
  });

  it('refuses to write an arrow the plugin would mis-slice', () => {
    // Arrow squares are read with substring(1, 6), so only `e2-e4` fits.
    const [node] = exportProps({
      fen: START_FEN,
      arrows: [{ from: 'e10', to: 'e8' }],
    });
    expect(node?.value).toBe(`fen: ${START_FEN}`);
  });

  it('marks a king-less diagram non-strict so Obsidian still draws it', () => {
    const [node] = exportProps({ fen: KINGLESS_FEN });
    expect(node?.value).toBe(`fen: ${KINGLESS_FEN}\nstrict: false`);
  });

  it('does not add a second strict line to a fence that has one', () => {
    const [node] = exportProps({
      fen: KINGLESS_FEN,
      extraLines: ['strict: false'],
    });
    expect(node?.value).toBe(`fen: ${KINGLESS_FEN}\nstrict: false`);
  });
});

/**
 * What the vault actually has to survive.
 *
 * A note is the author's: taking one into AFFiNE and back out again must not
 * rewrite it. `strict: false` is the sharp case — 412 real lines depend on it,
 * and without it a king-less diagram renders as red error text in Obsidian.
 */
describe('round-tripping a fence', () => {
  const roundTrip = (body: string, lang = 'chessboard') => {
    const [block] = runEnter(
      chessBoardMarkdownAdapterMatcher.toBlockSnapshot.enter,
      codeNode(lang, body)
    );
    if (!block) throw new Error(`fence did not import: ${body}`);
    const [node] = runEnter(
      chessBoardMarkdownAdapterMatcher.fromBlockSnapshot.enter,
      { node: { flavour: 'affine:chess-board', props: block.props } }
    );
    return node?.value as string;
  };

  const identical = [
    ['a plain position', `fen: ${START_FEN}`],
    ['the commonest shape in the vault', `fen: ${KINGLESS_FEN}\nstrict: false`],
    ['a flipped board', `fen: ${START_FEN}\norientation: black`],
    [
      'a flipped, non-strict board',
      `fen: ${KINGLESS_FEN}\norientation: black\nstrict: false`,
    ],
    ['an unknown key', `fen: ${START_FEN}\npieceStyle: cburnett`],
    ['annotations', `fen: ${START_FEN}\nannotations: Ae1-e8/g Hf5 Cd4`],
    [
      'everything at once',
      `fen: ${KINGLESS_FEN}\norientation: black\nstrict: false\nannotations: Ae1-e8 Hf5/b !!f7`,
    ],
  ] as const;

  it.each(identical)('leaves %s byte-identical', (_name, body) => {
    expect(roundTrip(body)).toBe(body);
  });

  const normalised = [
    ['a bare position', KINGLESS_FEN, `fen: ${KINGLESS_FEN}\nstrict: false`],
    [
      'a bare position with an option line',
      `${KINGLESS_FEN}\nstrict: false`,
      `fen: ${KINGLESS_FEN}\nstrict: false`,
    ],
    [
      'two annotation lines',
      `fen: ${START_FEN}\nannotations: Ae1-e8\nannotations: Hf5`,
      `fen: ${START_FEN}\nannotations: Ae1-e8 Hf5`,
    ],
    [
      'interleaved token kinds',
      `fen: ${START_FEN}\nannotations: Hf5 Ae1-e8`,
      `fen: ${START_FEN}\nannotations: Ae1-e8 Hf5`,
    ],
  ] as const;

  it.each(normalised)(
    'rewrites %s into the canonical form',
    (_name, body, expected) => {
      expect(roundTrip(body)).toBe(expected);
    }
  );

  /**
   * The property that actually protects the vault: a note may be normalised
   * once, but it must never drift further on later trips.
   */
  it.each([
    ...identical.map(([name, body]) => [name, body] as const),
    ...normalised.map(([name, body]) => [name, body] as const),
  ])('settles after one pass for %s', (_name, body) => {
    const once = roundTrip(body);
    expect(roundTrip(once)).toBe(once);
  });

  it('carries a bare fen fence into the Obsidian form', () => {
    expect(roundTrip(START_FEN, 'fen')).toBe(`fen: ${START_FEN}`);
  });
});

describe('chess board schema', () => {
  it('defaults to the starting position, movable and unflipped', () => {
    const props = ChessBoardBlockSchema.model.props?.({} as never);
    expect(props).toMatchObject({
      fen: START_FEN,
      orientation: 'white',
      editable: true,
      arrows: [],
      highlights: [],
      extraLines: [],
      extraAnnotations: [],
    });
  });

  it('stays at version 1', () => {
    // Nothing migrates a saved block, and a version mismatch replaces the
    // board with an error panel — so additive props must not bump this.
    expect(ChessBoardBlockSchema.version).toBe(1);
  });

  it('may only sit where a diagram makes sense', () => {
    const parents = ChessBoardBlockSchema.model.parent;
    expect(parents).toContain('affine:note');
    expect(parents).toContain('affine:paragraph');
    // A board holds no text, so it must never accept children.
    expect(ChessBoardBlockSchema.model.children).toEqual([]);
  });
});

describe('chess board on the whiteboard', () => {
  it('may be parented directly to the surface', () => {
    expect(ChessBoardBlockSchema.model.parent).toContain('affine:surface');
  });

  it('ships the graphics props a canvas block needs', () => {
    const props = ChessBoardBlockSchema.model.props?.({} as never);
    expect(props).toMatchObject({
      index: 'a0',
      lockedBySelf: false,
      rotate: 0,
    });
    // Square by default, because a board is square.
    expect(props?.xywh).toBe(
      `[0,0,${DEFAULT_BOARD_SIZE},${DEFAULT_BOARD_SIZE}]`
    );
  });
});
