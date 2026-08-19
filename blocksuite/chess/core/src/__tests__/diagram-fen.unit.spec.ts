import { describe, expect, it } from 'vitest';

import { detectChessText } from '../detect';
import { parseDiagramFen, parseFen, toFen } from '../fen';

const KINGLESS_FEN = '8/8/4P3/8/8/8/8/8 w - - 0 1';
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

describe('parseDiagramFen', () => {
  it('accepts positions without kings', () => {
    expect(toFen(parseDiagramFen(KINGLESS_FEN))).toBe(KINGLESS_FEN);
    expect(toFen(parseDiagramFen(EMPTY_FEN))).toBe(EMPTY_FEN);
  });

  it('keeps every other rejection parseFen has', () => {
    // Seven ranks.
    expect(() => parseDiagramFen('8/8/8/8/8/8/8 w - - 0 1')).toThrow();
    // Two white kings.
    expect(() => parseDiagramFen('KK6/8/8/8/8/8/8/8 w - - 0 1')).toThrow();
    // Bad side to move.
    expect(() => parseDiagramFen('8/8/8/8/8/8/8/8 x - - 0 1')).toThrow();
  });

  it('parseFen itself still requires both kings', () => {
    expect(() => parseFen(KINGLESS_FEN)).toThrow(/kings/);
  });
});

describe('detectChessText with diagram positions', () => {
  it('recognises a king-less FEN as a position', () => {
    expect(detectChessText(KINGLESS_FEN)).toEqual({
      kind: 'fen',
      fen: KINGLESS_FEN,
    });
  });
});
