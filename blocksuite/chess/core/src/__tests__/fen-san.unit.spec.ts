import { describe, expect, it } from 'vitest';

import { FenError, parseFen, START_FEN, startPosition, toFen } from '../fen';
import { applyMove, findMove, legalMoves } from '../position';
import { moveToSan, moveToUci, SanError, sanToMove, uciToMove } from '../san';
import { algebraicToSquare, squareToAlgebraic } from '../square';
import { CASTLE_WK, CASTLE_WQ, QUEEN, typeOf } from '../types';

describe('FEN', () => {
  it('round-trips the starting position', () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN);
  });

  it('round-trips a position with en passant and clocks set', () => {
    const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2';
    expect(toFen(parseFen(fen))).toBe(fen);
  });

  it('defaults the move clocks when they are omitted', () => {
    const position = parseFen('8/8/8/8/8/8/8/K6k w - -');
    expect(position.halfmoves).toBe(0);
    expect(position.fullmoves).toBe(1);
  });

  it('rejects a placement with the wrong number of ranks', () => {
    expect(() => parseFen('8/8/8/8/8/8/K6k w - - 0 1')).toThrow(FenError);
  });

  it('rejects a rank that does not describe eight files', () => {
    expect(() => parseFen('8/8/8/8/8/8/8/K5k w - - 0 1')).toThrow(FenError);
  });

  it('rejects a position without both kings', () => {
    expect(() => parseFen('8/8/8/8/8/8/8/K7 w - - 0 1')).toThrow(FenError);
  });

  it('rejects an en passant square the side to move could not use', () => {
    expect(() => parseFen('8/8/8/8/8/8/8/K6k w - c3 0 1')).toThrow(FenError);
  });

  it('drops castling rights the piece placement contradicts', () => {
    // Claims all four rights, but only the white king and h1 rook are home.
    const position = parseFen('4k3/8/8/8/8/8/8/4K2R w KQkq - 0 1');
    expect(position.castling & CASTLE_WK).toBe(CASTLE_WK);
    expect(position.castling & CASTLE_WQ).toBe(0);
    expect(toFen(position)).toContain(' K ');
  });
});

describe('square helpers', () => {
  it('maps between indices and algebraic names', () => {
    expect(squareToAlgebraic(0)).toBe('a1');
    expect(squareToAlgebraic(119)).toBe('h8');
    expect(algebraicToSquare('a1')).toBe(0);
    expect(algebraicToSquare('h8')).toBe(119);
    expect(algebraicToSquare('j9')).toBe(-1);
  });
});

describe('SAN disambiguation', () => {
  /**
   * Three white queens on a1, a5 and e1 can all reach e5. The mover on a1
   * shares a file with a5 and a rank with e1, which is the only situation that
   * forces the full origin square into the notation.
   */
  const THREE_QUEENS = '2k5/8/8/Q7/8/8/8/Q3Q2K w - - 0 1';

  it('uses file, rank or the whole square as needed', () => {
    const position = parseFen(THREE_QUEENS);
    const legal = legalMoves(position);
    const toE5 = legal.filter(
      move =>
        squareToAlgebraic(move.to) === 'e5' && typeOf(move.piece) === QUEEN
    );

    expect(toE5).toHaveLength(3);
    const sans = toE5.map(move => moveToSan(position, move, legal)).sort();
    expect(sans).toEqual([
      'Q5e5', // only the rank separates a5 from a1 and e1
      'Qa1e5', // a1 shares a file with a5 and a rank with e1
      'Qee5', // only the file separates e1 from a1 and a5
    ]);
  });

  it('parses back every SAN it produces', () => {
    const position = parseFen(THREE_QUEENS);
    const legal = legalMoves(position);
    for (const move of legal) {
      const san = moveToSan(position, move, legal);
      const parsed = sanToMove(position, san);
      expect(parsed.from).toBe(move.from);
      expect(parsed.to).toBe(move.to);
    }
  });

  it('never disambiguates a pawn capture beyond its file', () => {
    // Pawns on d4 and f4 can both take on e5.
    const position = parseFen('4k3/8/8/4p3/3P1P2/8/8/4K3 w - - 0 1');
    const legal = legalMoves(position);
    const captures = legal
      .filter(move => squareToAlgebraic(move.to) === 'e5')
      .map(move => moveToSan(position, move, legal));
    expect(captures.sort()).toEqual(['dxe5', 'fxe5']);
  });
});

describe('SAN special moves', () => {
  it('writes promotions with the piece suffix', () => {
    const position = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const legal = legalMoves(position);
    const promotions = legal
      .filter(move => squareToAlgebraic(move.to) === 'a8')
      .map(move => moveToSan(position, move, legal))
      .sort();
    expect(promotions).toEqual(['a8=B', 'a8=N', 'a8=Q+', 'a8=R+']);
  });

  it('accepts a promotion written without the equals sign', () => {
    const position = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(moveToSan(position, sanToMove(position, 'a8Q'))).toBe('a8=Q+');
  });

  it('accepts long algebraic and UCI-style tokens', () => {
    const position = startPosition();
    expect(moveToSan(position, sanToMove(position, 'e2e4'))).toBe('e4');
    expect(moveToUci(sanToMove(position, 'e4'))).toBe('e2e4');
  });

  it('resolves UCI tokens and rejects SAN', () => {
    const position = startPosition();
    expect(moveToUci(uciToMove(position, 'e2e4'))).toBe('e2e4');
    expect(moveToSan(position, uciToMove(position, 'g1f3'))).toBe('Nf3');
    expect(() => uciToMove(position, 'e4')).toThrow(SanError);
    expect(() => uciToMove(position, 'Nf3')).toThrow(SanError);
    expect(() => uciToMove(position, 'e2e5')).toThrow(SanError);
  });

  it('round-trips castling, en passant and promotions through UCI', () => {
    const castle = parseFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    expect(moveToUci(uciToMove(castle, 'e1g1'))).toBe('e1g1');

    const ep = parseFen(
      'rnbqkbnr/pppp1ppp/8/3Pp3/8/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 3'
    );
    expect(moveToSan(ep, uciToMove(ep, 'd5e6'))).toBe('dxe6');

    const promo = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(moveToSan(promo, uciToMove(promo, 'a7a8q'))).toBe('a8=Q+');
    expect(() => uciToMove(promo, 'a7a8')).toThrow(SanError);
  });

  it('handles en passant capture', () => {
    const position = parseFen(
      'rnbqkbnr/pppp1ppp/8/3Pp3/8/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 3'
    );
    const move = sanToMove(position, 'dxe6');
    expect(moveToSan(position, move)).toBe('dxe6');
    const after = applyMove(position, move);
    // The captured pawn stood on e5, not on the destination square.
    expect(toFen(after)).toContain('rnbqkbnr/pppp1ppp/4P3/8/8/8/PPP1PPPP');
  });

  it('rejects an illegal move rather than inventing one', () => {
    expect(() => sanToMove(startPosition(), 'Ke2')).toThrow(SanError);
    expect(() => sanToMove(startPosition(), '')).toThrow(SanError);
  });

  it('finds a move from a from/to pair, defaulting promotion to queen', () => {
    const position = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const move = findMove(
      position,
      algebraicToSquare('a7'),
      algebraicToSquare('a8')
    );
    expect(move).toBeDefined();
    expect(moveToSan(position, move!)).toBe('a8=Q+');
  });
});
