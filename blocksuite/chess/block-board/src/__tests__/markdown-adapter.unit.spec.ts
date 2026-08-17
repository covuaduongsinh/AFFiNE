import { describe, expect, it } from 'vitest';

import { chessBoardMarkdownAdapterMatcher } from '../adapters/markdown.js';
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

  it('skips option keys it does not model instead of rejecting', () => {
    const [block] = importNode(
      'chessboard',
      `fen: ${START_FEN}\nannotations: G:e2->e4\npieceStyle: cburnett`
    );
    expect(block).toMatchObject({ props: { fen: START_FEN } });
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
    });
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
