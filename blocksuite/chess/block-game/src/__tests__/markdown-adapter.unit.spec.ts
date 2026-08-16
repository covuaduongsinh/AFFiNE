import { parsePgn } from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import { chessGameMarkdownAdapterMatcher } from '../adapters/markdown';
import { chessGameSlashMenuConfig } from '../configs/slash-menu';
import { ChessGameBlockSchema, EMPTY_PGN } from '../model';

const codeNode = (lang: string | null, value: string) =>
  ({
    node: { type: 'code', lang, value, meta: null },
  }) as Parameters<typeof chessGameMarkdownAdapterMatcher.toMatch>[0];

const blockNode = (flavour: string) =>
  ({
    node: { flavour },
  }) as Parameters<typeof chessGameMarkdownAdapterMatcher.fromMatch>[0];

describe('chess game markdown adapter', () => {
  it('claims the flavour it is registered for', () => {
    expect(chessGameMarkdownAdapterMatcher.flavour).toBe('affine:chess-game');
    expect(chessGameMarkdownAdapterMatcher.flavour).toBe(
      ChessGameBlockSchema.model.flavour
    );
  });

  it('matches a fenced block tagged pgn', () => {
    expect(
      chessGameMarkdownAdapterMatcher.toMatch(codeNode('pgn', '1. e4 e5 *'))
    ).toBe(true);
  });

  it('leaves other fences alone', () => {
    expect(
      chessGameMarkdownAdapterMatcher.toMatch(
        codeNode('fen', '8/8/8/8/8/8/8/8')
      )
    ).toBe(false);
    expect(
      chessGameMarkdownAdapterMatcher.toMatch(codeNode(null, '1. e4'))
    ).toBe(false);
  });

  it('matches its own blocks on the way out and nothing else', () => {
    expect(
      chessGameMarkdownAdapterMatcher.fromMatch(blockNode('affine:chess-game'))
    ).toBe(true);
    expect(
      chessGameMarkdownAdapterMatcher.fromMatch(blockNode('affine:chess-board'))
    ).toBe(false);
  });
});

describe('chess game schema', () => {
  it('defaults to an empty game at the starting position', () => {
    const props = ChessGameBlockSchema.model.props?.({} as never);
    expect(props).toMatchObject({
      pgn: EMPTY_PGN,
      currentPath: [],
      orientation: 'white',
    });
  });

  it('parses its own default PGN', () => {
    const game = parsePgn(EMPTY_PGN);
    expect(game.moves).toEqual([]);
    expect(game.result).toBe('*');
  });

  it('holds no children, since a game carries no document content', () => {
    expect(ChessGameBlockSchema.model.children).toEqual([]);
  });
});

describe('slash menu', () => {
  it('offers an empty game and a worked example', () => {
    const items = chessGameSlashMenuConfig.items;
    expect(Array.isArray(items)).toBe(true);
    if (!Array.isArray(items)) return;
    expect(items.map(item => item.name)).toEqual([
      'Chess game',
      'Chess game (example)',
    ]);
  });

  it('ships an example that actually parses', () => {
    const items = chessGameSlashMenuConfig.items;
    if (!Array.isArray(items)) throw new Error('expected a static item list');
    // The sample must be valid or the menu entry inserts a broken block.
    const sample = parsePgn(`[Event "Scholar's mate"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? {Guarding f7 was essential.} 4. Qxf7# 1-0
`);
    expect(sample.result).toBe('1-0');
    expect(sample.moves).toHaveLength(1);
  });
});
