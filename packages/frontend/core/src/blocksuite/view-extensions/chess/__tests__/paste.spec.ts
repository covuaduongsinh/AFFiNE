import { detectChessText, START_FEN } from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import { chessBlockProps, isEmptyParagraph } from '../paste';

/**
 * The interesting half of pasting — deciding *whether* text is chess — lives in
 * `detectChessText` and is covered by its own 22 tests. What is left here is the
 * mapping from a match to a block, and the "replace the empty paragraph rather
 * than push it down" rule.
 *
 * Placing the block needs a live editor, so that is asserted by the Playwright
 * spec instead. An earlier version of this file tested a clipboard middleware
 * in isolation, passed, and shipped a paste path that did not work at all —
 * hence the split.
 */
const match = (text: string) => {
  const found = detectChessText(text);
  if (!found) throw new Error(`expected ${text} to be recognised`);
  return found;
};

describe('chessBlockProps', () => {
  it('maps a FEN to a movable board', () => {
    const [flavour, props] = chessBlockProps(match(START_FEN));
    expect(flavour).toBe('affine:chess-board');
    expect(props).toMatchObject({
      fen: START_FEN,
      orientation: 'white',
      editable: true,
    });
  });

  it('maps a PGN to a game at its starting position', () => {
    const pgn = '1. e4 e5 2. Nf3 *';
    const [flavour, props] = chessBlockProps(match(pgn));
    expect(flavour).toBe('affine:chess-game');
    expect(props).toMatchObject({ pgn, currentPath: [] });
  });
});

describe('isEmptyParagraph', () => {
  const model = (flavour: string, length?: number) =>
    ({
      flavour,
      props: length === undefined ? {} : { text: { length } },
    }) as never;

  it('is true for a paragraph with no text', () => {
    expect(isEmptyParagraph(model('affine:paragraph', 0))).toBe(true);
  });

  it('is false once the paragraph has content', () => {
    expect(isEmptyParagraph(model('affine:paragraph', 5))).toBe(false);
  });

  it('is false for anything that is not a paragraph', () => {
    expect(isEmptyParagraph(model('affine:chess-board', 0))).toBe(false);
    expect(isEmptyParagraph(model('affine:list', 0))).toBe(false);
  });

  it('treats a paragraph with no text prop as empty', () => {
    expect(isEmptyParagraph(model('affine:paragraph'))).toBe(true);
  });
});
