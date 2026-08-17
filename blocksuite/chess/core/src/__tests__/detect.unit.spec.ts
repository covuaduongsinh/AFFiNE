import { describe, expect, it } from 'vitest';

import { detectChessText } from '../detect';
import { START_FEN } from '../fen';

/**
 * These tests are mostly about what must NOT match. Paste detection runs on
 * every paste in the editor, so a false positive rewrites someone's prose into
 * a chess block — much worse than making them use the slash menu.
 */
describe('detectChessText: positions', () => {
  it('recognises a full FEN', () => {
    expect(detectChessText(START_FEN)).toEqual({
      kind: 'fen',
      fen: START_FEN,
    });
  });

  it('recognises a FEN without the move clocks', () => {
    const fen = '4k3/8/8/8/8/8/8/4K3 w - -';
    expect(detectChessText(fen)).toEqual({ kind: 'fen', fen });
  });

  it('tolerates surrounding whitespace', () => {
    expect(detectChessText(`\n  ${START_FEN}  \n`)).toEqual({
      kind: 'fen',
      fen: START_FEN,
    });
  });

  it('rejects a FEN-shaped string that is not a legal position', () => {
    // Eight ranks, but no kings.
    expect(detectChessText('8/8/8/8/8/8/8/8 w - - 0 1')).toBeNull();
  });

  it('rejects a placement with the wrong rank count', () => {
    expect(detectChessText('4k3/8/8/8/8/8/4K3 w - - 0 1')).toBeNull();
  });
});

describe('detectChessText: games', () => {
  it('recognises PGN with tag pairs', () => {
    const pgn = '[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 1-0';
    expect(detectChessText(pgn)).toEqual({ kind: 'pgn', pgn });
  });

  it('recognises bare movetext that starts with a move number', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 *';
    expect(detectChessText(pgn)).toEqual({ kind: 'pgn', pgn });
  });

  it('recognises movetext with variations and comments', () => {
    const pgn = '1. e4 e5 (1... c5 {The Sicilian.} 2. Nf3) 2. Nf3 *';
    expect(detectChessText(pgn)?.kind).toBe('pgn');
  });

  it('rejects tag pairs with no moves', () => {
    expect(detectChessText('[Event "Empty"]\n[Result "*"]\n\n*')).toBeNull();
  });

  it('rejects an illegal game', () => {
    expect(detectChessText('1. e5 e4 *')).toBeNull();
  });
});

describe('detectChessText: things that must stay prose', () => {
  const prose = [
    '',
    '   ',
    'e4',
    'I played e4 and he answered e5.',
    'Nf3 is the most popular second move.',
    'The score was 1-0.',
    'Meeting at 1. Discuss the roadmap.',
    'See section 1. Introduction',
    'https://example.com/a/b/c/d/e/f/g/h',
    'a/b/c/d/e/f/g/h',
    'TODO: 1. buy milk 2. call the coach',
  ];

  for (const text of prose) {
    it(`leaves ${JSON.stringify(text)} alone`, () => {
      expect(detectChessText(text)).toBeNull();
    });
  }

  it('ignores absurdly long input rather than parsing it', () => {
    expect(detectChessText('1. e4 '.repeat(30000))).toBeNull();
  });
});
