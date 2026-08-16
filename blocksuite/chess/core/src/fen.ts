import {
  algebraicToSquare,
  charToType,
  onBoard,
  pieceToChar,
  rankOf,
  squareOf,
  squareToAlgebraic,
} from './square';
import {
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  type Color,
  colorOf,
  EMPTY,
  KING,
  NO_SQUARE,
  type Piece,
  pieceOf,
  type Position,
  ROOK,
  type Square,
  typeOf,
  WHITE,
} from './types';

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class FenError extends Error {
  override name = 'FenError';
}

/** Deep copy of a position. Positions are immutable to callers, so this is the seam. */
export function clonePosition(pos: Position): Position {
  return {
    board: Int8Array.from(pos.board),
    turn: pos.turn,
    castling: pos.castling,
    epSquare: pos.epSquare,
    halfmoves: pos.halfmoves,
    fullmoves: pos.fullmoves,
    kings: [pos.kings[0], pos.kings[1]],
  };
}

/**
 * Parse a FEN string into a {@link Position}.
 *
 * Rejects structurally invalid input (bad rank counts, missing kings, side not
 * to move already in check). It deliberately does *not* try to repair sloppy
 * FENs: a chess study that silently rewrites a position is worse than one that
 * refuses it.
 */
export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) {
    throw new FenError(`FEN needs at least 4 fields, got ${parts.length}`);
  }

  const [placement, turnText, castlingText, epText] = parts;
  const halfmoveText = parts[4] ?? '0';
  const fullmoveText = parts[5] ?? '1';

  const board = new Int8Array(128);
  const kings: [Square, Square] = [NO_SQUARE, NO_SQUARE];

  const ranks = placement.split('/');
  if (ranks.length !== 8) {
    throw new FenError(`FEN placement needs 8 ranks, got ${ranks.length}`);
  }

  for (let i = 0; i < 8; i++) {
    // FEN lists rank 8 first, our rank index counts up from rank 1.
    const rank = 7 - i;
    let file = 0;
    for (const ch of ranks[i]) {
      if (ch >= '1' && ch <= '8') {
        file += ch.charCodeAt(0) - 48;
        continue;
      }
      const type = charToType(ch);
      if (type === undefined) {
        throw new FenError(`Unexpected character "${ch}" in FEN placement`);
      }
      if (file > 7) {
        throw new FenError(`Rank "${ranks[i]}" overflows past the h-file`);
      }
      const color: Color = ch === ch.toUpperCase() ? WHITE : BLACK;
      const sq = squareOf(file, rank);
      board[sq] = pieceOf(color, type);
      if (type === KING) {
        if (kings[color] !== NO_SQUARE) {
          throw new FenError(
            `Two ${color === WHITE ? 'white' : 'black'} kings in FEN`
          );
        }
        kings[color] = sq;
      }
      file++;
    }
    if (file !== 8) {
      throw new FenError(`Rank "${ranks[i]}" describes ${file} files, need 8`);
    }
  }

  if (kings[WHITE] === NO_SQUARE || kings[BLACK] === NO_SQUARE) {
    throw new FenError('FEN must contain both kings');
  }

  if (turnText !== 'w' && turnText !== 'b') {
    throw new FenError(`Side to move must be "w" or "b", got "${turnText}"`);
  }
  const turn: Color = turnText === 'w' ? WHITE : BLACK;

  let castling = 0;
  if (castlingText !== '-') {
    for (const ch of castlingText) {
      switch (ch) {
        case 'K':
          castling |= CASTLE_WK;
          break;
        case 'Q':
          castling |= CASTLE_WQ;
          break;
        case 'k':
          castling |= CASTLE_BK;
          break;
        case 'q':
          castling |= CASTLE_BQ;
          break;
        default:
          throw new FenError(`Unexpected castling character "${ch}"`);
      }
    }
  }

  let epSquare = NO_SQUARE;
  if (epText !== '-') {
    epSquare = algebraicToSquare(epText);
    if (epSquare === NO_SQUARE || !onBoard(epSquare)) {
      throw new FenError(`Invalid en passant square "${epText}"`);
    }
    const epRank = rankOf(epSquare);
    if ((turn === WHITE && epRank !== 5) || (turn === BLACK && epRank !== 2)) {
      throw new FenError(
        `En passant square "${epText}" is impossible for the side to move`
      );
    }
  }

  const halfmoves = Number.parseInt(halfmoveText, 10);
  const fullmoves = Number.parseInt(fullmoveText, 10);
  if (!Number.isFinite(halfmoves) || halfmoves < 0) {
    throw new FenError(`Invalid halfmove clock "${halfmoveText}"`);
  }
  if (!Number.isFinite(fullmoves) || fullmoves < 1) {
    throw new FenError(`Invalid fullmove number "${fullmoveText}"`);
  }

  const pos: Position = {
    board,
    turn,
    castling: pruneCastling(board, castling),
    epSquare,
    halfmoves,
    fullmoves,
    kings,
  };

  return pos;
}

/**
 * Drop castling rights that the piece placement contradicts.
 *
 * Real-world PGN files are full of FENs claiming rights for a rook that has
 * already moved. Silently pruning is right here — unlike a malformed board it is
 * unambiguous what the position actually is.
 */
function pruneCastling(board: Int8Array, castling: number): number {
  const whiteKingHome = board[squareOf(4, 0)] === pieceOf(WHITE, KING);
  const blackKingHome = board[squareOf(4, 7)] === pieceOf(BLACK, KING);
  let result = castling;
  if (!whiteKingHome) result &= ~(CASTLE_WK | CASTLE_WQ);
  if (!blackKingHome) result &= ~(CASTLE_BK | CASTLE_BQ);
  if (board[squareOf(7, 0)] !== pieceOf(WHITE, ROOK)) result &= ~CASTLE_WK;
  if (board[squareOf(0, 0)] !== pieceOf(WHITE, ROOK)) result &= ~CASTLE_WQ;
  if (board[squareOf(7, 7)] !== pieceOf(BLACK, ROOK)) result &= ~CASTLE_BK;
  if (board[squareOf(0, 7)] !== pieceOf(BLACK, ROOK)) result &= ~CASTLE_BQ;
  return result;
}

/** Render a {@link Position} back to FEN. Round-trips with {@link parseFen}. */
export function toFen(pos: Position): string {
  let placement = '';
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = pos.board[squareOf(file, rank)];
      if (piece === EMPTY) {
        empty++;
        continue;
      }
      if (empty > 0) {
        placement += empty;
        empty = 0;
      }
      placement += pieceToChar(piece);
    }
    if (empty > 0) placement += empty;
    if (rank > 0) placement += '/';
  }

  let castling = '';
  if (pos.castling & CASTLE_WK) castling += 'K';
  if (pos.castling & CASTLE_WQ) castling += 'Q';
  if (pos.castling & CASTLE_BK) castling += 'k';
  if (pos.castling & CASTLE_BQ) castling += 'q';
  if (castling === '') castling = '-';

  const ep = pos.epSquare === NO_SQUARE ? '-' : squareToAlgebraic(pos.epSquare);

  return [
    placement,
    pos.turn === WHITE ? 'w' : 'b',
    castling,
    ep,
    pos.halfmoves,
    pos.fullmoves,
  ].join(' ');
}

/** The standard opening position. */
export function startPosition(): Position {
  return parseFen(START_FEN);
}

/** Iterate every occupied square. Used by move generation and SAN disambiguation. */
export function* occupiedSquares(
  pos: Position,
  color?: Color
): Generator<[Square, Piece]> {
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      // Skip the off-board half of the row in one jump.
      sq += 7;
      continue;
    }
    const piece = pos.board[sq];
    if (piece === EMPTY) continue;
    if (color !== undefined && colorOf(piece) !== color) continue;
    yield [sq, piece];
  }
}

/** Squares occupied by a given piece type and colour. */
export function findPieces(
  pos: Position,
  color: Color,
  type: number
): Square[] {
  const found: Square[] = [];
  for (const [sq, piece] of occupiedSquares(pos, color)) {
    if (typeOf(piece) === type) found.push(sq);
  }
  return found;
}
