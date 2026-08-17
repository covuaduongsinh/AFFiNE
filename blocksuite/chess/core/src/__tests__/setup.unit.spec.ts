import { describe, expect, it } from 'vitest';

import { START_FEN } from '../fen';
import { readPlacement, writeFen } from '../setup';

describe('readPlacement', () => {
  it('reads the start position', () => {
    const placement = readPlacement(START_FEN);
    expect(placement.size).toBe(32);
    expect(placement.get('e1')).toBe('K');
    expect(placement.get('e8')).toBe('k');
    expect(placement.get('a2')).toBe('P');
    expect(placement.get('h8')).toBe('r');
  });

  it('accepts positions parseFen would reject', () => {
    expect(readPlacement('8/8/8/8/8/8/8/8 w - - 0 1').size).toBe(0);
    const kingless = readPlacement('QQQQQQQQ/8/8/8/8/8/8/8');
    expect(kingless.size).toBe(8);
    expect(kingless.get('a8')).toBe('Q');
  });

  it('clips overflow and truncated input without throwing', () => {
    expect(readPlacement('').size).toBe(0);
    const overflowing = readPlacement('rrrrrrrrrr/8');
    expect(overflowing.size).toBe(8);
    expect(overflowing.get('a8')).toBe('r');
    expect(overflowing.get('h8')).toBe('r');
  });
});

describe('writeFen', () => {
  it('round-trips the start position', () => {
    const fen = writeFen({
      placement: readPlacement(START_FEN),
      turn: 'w',
      castling: 'KQkq',
    });
    expect(fen).toBe(START_FEN);
  });

  it('serializes an empty board, with empty castling as "-"', () => {
    expect(writeFen({ placement: new Map(), turn: 'b', castling: '' })).toBe(
      '8/8/8/8/8/8/8/8 b - - 0 1'
    );
  });

  it('serializes placements parseFen would reject', () => {
    const placement = new Map([
      ['e4', 'Q'],
      ['e5', 'Q'],
    ]);
    expect(writeFen({ placement, turn: 'w', castling: '' })).toBe(
      '8/8/8/4Q3/4Q3/8/8/8 w - - 0 1'
    );
  });
});
