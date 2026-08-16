import { describe, expect, it } from 'vitest';

import { chessBoardMarkdownAdapterMatcher } from '../adapters/markdown';
import { ChessBoardBlockSchema, START_FEN } from '../model';

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
