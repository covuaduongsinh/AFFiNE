import { describe, expect, it } from 'vitest';

import { parseFen, START_FEN } from '../fen';
import { perft } from '../position';

/**
 * Perft node counts are the standard correctness probe for a move generator:
 * a single wrong count means castling, en passant, promotion or pin handling is
 * broken somewhere. The positions below are the well-known set that between them
 * exercise every rule that is easy to get wrong.
 *
 * Reference values: https://www.chessprogramming.org/Perft_Results
 */
const POSITIONS: {
  name: string;
  fen: string;
  counts: number[];
}[] = [
  {
    name: 'initial position',
    fen: START_FEN,
    counts: [20, 400, 8902, 197281, 4865609],
  },
  {
    name: 'kiwipete (castling, pins, en passant)',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862, 4085603],
  },
  {
    name: 'endgame with en passant discovered check',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    counts: [14, 191, 2812, 43238],
  },
  {
    name: 'promotion heavy, black to castle',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467],
  },
  {
    name: 'no castling rights, promotions available',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    counts: [44, 1486, 62379],
  },
  {
    name: 'symmetrical middlegame',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    counts: [46, 2079, 89890],
  },
];

describe('perft', () => {
  for (const { name, fen, counts } of POSITIONS) {
    describe(name, () => {
      const position = parseFen(fen);
      counts.forEach((expected, index) => {
        const depth = index + 1;
        it(`depth ${depth} visits ${expected} nodes`, () => {
          expect(perft(position, depth)).toBe(expected);
        });
      });
    });
  }

  it('depth 0 is the position itself', () => {
    expect(perft(parseFen(START_FEN), 0)).toBe(1);
  });
});
