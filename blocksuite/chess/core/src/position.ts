import { clonePosition } from './fen';
import { fileOf, onBoard, rankOf, squareOf } from './square';
import {
  BISHOP,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  type Color,
  colorOf,
  EMPTY,
  FLAG_CAPTURE,
  FLAG_DOUBLE_PAWN,
  FLAG_EP_CAPTURE,
  FLAG_KING_CASTLE,
  FLAG_NORMAL,
  FLAG_PROMOTION,
  FLAG_QUEEN_CASTLE,
  KING,
  KNIGHT,
  type Move,
  NO_SQUARE,
  PAWN,
  type Piece,
  pieceOf,
  type PieceType,
  type Position,
  QUEEN,
  ROOK,
  type Square,
  typeOf,
  WHITE,
} from './types';

/** 0x88 direction offsets. Rank steps are ±16, file steps ±1. */
const KNIGHT_OFFSETS = [33, 31, 18, 14, -14, -18, -31, -33];
const BISHOP_OFFSETS = [17, 15, -15, -17];
const ROOK_OFFSETS = [16, 1, -1, -16];
const KING_OFFSETS = [17, 16, 15, 1, -1, -15, -16, -17];

/** Pawn capture offsets, indexed by colour. */
const PAWN_CAPTURES: Record<Color, number[]> = {
  [WHITE]: [17, 15],
  [BLACK]: [-15, -17],
};
const PAWN_PUSH: Record<Color, number> = { [WHITE]: 16, [BLACK]: -16 };
/** Rank a pawn stands on before its double push. */
const PAWN_HOME_RANK: Record<Color, number> = { [WHITE]: 1, [BLACK]: 6 };
/** Rank a pawn promotes on. */
const PAWN_PROMOTION_RANK: Record<Color, number> = { [WHITE]: 7, [BLACK]: 0 };

const PROMOTION_TYPES: PieceType[] = [QUEEN, ROOK, BISHOP, KNIGHT];

const SLIDING_OFFSETS: Partial<Record<PieceType, number[]>> = {
  [BISHOP]: BISHOP_OFFSETS,
  [ROOK]: ROOK_OFFSETS,
  [QUEEN]: KING_OFFSETS,
};

/**
 * Is `sq` attacked by any piece of `byColor`?
 *
 * Walks outward from the target square rather than scanning every enemy piece,
 * which keeps the cost proportional to board geometry instead of material.
 */
export function isSquareAttacked(
  pos: Position,
  sq: Square,
  byColor: Color
): boolean {
  const board = pos.board;

  // Pawns: look back along the directions an enemy pawn would capture *from*.
  const enemyPawn = pieceOf(byColor, PAWN);
  for (const offset of PAWN_CAPTURES[byColor]) {
    const from = sq - offset;
    if (!onBoard(from)) continue;
    if (board[from] === enemyPawn) return true;
  }

  for (const offset of KNIGHT_OFFSETS) {
    const from = sq + offset;
    if (!onBoard(from)) continue;
    if (board[from] === pieceOf(byColor, KNIGHT)) return true;
  }

  for (const offset of KING_OFFSETS) {
    const from = sq + offset;
    if (!onBoard(from)) continue;
    if (board[from] === pieceOf(byColor, KING)) return true;
  }

  for (const offset of BISHOP_OFFSETS) {
    let from = sq + offset;
    while (onBoard(from)) {
      const piece = board[from];
      if (piece !== EMPTY) {
        if (colorOf(piece) === byColor) {
          const type = typeOf(piece);
          if (type === BISHOP || type === QUEEN) return true;
        }
        break;
      }
      from += offset;
    }
  }

  for (const offset of ROOK_OFFSETS) {
    let from = sq + offset;
    while (onBoard(from)) {
      const piece = board[from];
      if (piece !== EMPTY) {
        if (colorOf(piece) === byColor) {
          const type = typeOf(piece);
          if (type === ROOK || type === QUEEN) return true;
        }
        break;
      }
      from += offset;
    }
  }

  return false;
}

/** Is the given side's king currently attacked? */
export function isKingAttacked(pos: Position, color: Color): boolean {
  const king = pos.kings[color];
  if (king === NO_SQUARE) return false;
  return isSquareAttacked(pos, king, (color ^ 1) as Color);
}

/** Is the side to move in check? */
export function inCheck(pos: Position): boolean {
  return isKingAttacked(pos, pos.turn);
}

/** Record needed to undo a move made in place. */
interface Undo {
  move: Move;
  castling: number;
  epSquare: Square;
  halfmoves: number;
  fullmoves: number;
  kings: [Square, Square];
}

/**
 * Apply `move` to `pos` in place and return the record needed to undo it.
 *
 * Used internally for legality filtering and perft. Callers outside this module
 * should prefer {@link applyMove}, which leaves the input untouched.
 */
export function makeMove(pos: Position, move: Move): Undo {
  const undo: Undo = {
    move,
    castling: pos.castling,
    epSquare: pos.epSquare,
    halfmoves: pos.halfmoves,
    fullmoves: pos.fullmoves,
    kings: [pos.kings[0], pos.kings[1]],
  };

  const board = pos.board;
  const us = pos.turn;
  const them = (us ^ 1) as Color;
  const movingType = typeOf(move.piece);

  board[move.to] = move.piece;
  board[move.from] = EMPTY;

  if (move.flags & FLAG_EP_CAPTURE) {
    // The captured pawn stands beside the destination, not on it.
    board[move.to - PAWN_PUSH[us]] = EMPTY;
  }

  if (move.flags & FLAG_PROMOTION) {
    board[move.to] = pieceOf(us, move.promotion as PieceType);
  }

  if (movingType === KING) {
    pos.kings[us] = move.to;
    if (move.flags & FLAG_KING_CASTLE) {
      board[move.to - 1] = board[move.to + 1];
      board[move.to + 1] = EMPTY;
    } else if (move.flags & FLAG_QUEEN_CASTLE) {
      board[move.to + 1] = board[move.to - 2];
      board[move.to - 2] = EMPTY;
    }
    pos.castling &=
      us === WHITE ? ~(CASTLE_WK | CASTLE_WQ) : ~(CASTLE_BK | CASTLE_BQ);
  }

  // A rook leaving or being captured on a corner kills the matching right.
  pos.castling &= castlingMaskFor(move.from);
  pos.castling &= castlingMaskFor(move.to);

  pos.epSquare =
    move.flags & FLAG_DOUBLE_PAWN ? move.from + PAWN_PUSH[us] : NO_SQUARE;

  pos.halfmoves =
    movingType === PAWN || move.flags & (FLAG_CAPTURE | FLAG_EP_CAPTURE)
      ? 0
      : pos.halfmoves + 1;

  if (us === BLACK) pos.fullmoves++;
  pos.turn = them;

  return undo;
}

/** Reverse a {@link makeMove}. */
export function unmakeMove(pos: Position, undo: Undo): void {
  const board = pos.board;
  const move = undo.move;
  const us = colorOf(move.piece);

  pos.turn = us;
  pos.castling = undo.castling;
  pos.epSquare = undo.epSquare;
  pos.halfmoves = undo.halfmoves;
  pos.fullmoves = undo.fullmoves;
  pos.kings[0] = undo.kings[0];
  pos.kings[1] = undo.kings[1];

  board[move.from] = move.piece;
  board[move.to] = EMPTY;

  if (move.flags & FLAG_EP_CAPTURE) {
    board[move.to - PAWN_PUSH[us]] = move.captured;
  } else if (move.captured !== EMPTY) {
    board[move.to] = move.captured;
  }

  if (move.flags & FLAG_KING_CASTLE) {
    board[move.to + 1] = board[move.to - 1];
    board[move.to - 1] = EMPTY;
  } else if (move.flags & FLAG_QUEEN_CASTLE) {
    board[move.to - 2] = board[move.to + 1];
    board[move.to + 1] = EMPTY;
  }
}

/** Castling rights that survive a piece touching `sq`. */
function castlingMaskFor(sq: Square): number {
  switch (sq) {
    case 0: // a1
      return ~CASTLE_WQ;
    case 7: // h1
      return ~CASTLE_WK;
    case 112: // a8
      return ~CASTLE_BQ;
    case 119: // h8
      return ~CASTLE_BK;
    default:
      return ~0;
  }
}

function pushMove(
  moves: Move[],
  pos: Position,
  from: Square,
  to: Square,
  flags: number
): void {
  const piece = pos.board[from];
  const captured =
    flags & FLAG_EP_CAPTURE
      ? pieceOf((pos.turn ^ 1) as Color, PAWN)
      : pos.board[to];
  const type = typeOf(piece);

  if (type === PAWN && rankOf(to) === PAWN_PROMOTION_RANK[pos.turn]) {
    for (const promotion of PROMOTION_TYPES) {
      moves.push({
        from,
        to,
        piece,
        captured,
        promotion,
        flags: flags | FLAG_PROMOTION,
      });
    }
    return;
  }

  moves.push({ from, to, piece, captured, promotion: EMPTY, flags });
}

/**
 * All pseudo-legal moves for the side to move — legal except that they may
 * leave the mover's own king in check.
 */
export function generatePseudoLegalMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const board = pos.board;
  const us = pos.turn;
  const them = (us ^ 1) as Color;

  for (let from = 0; from < 128; from++) {
    if (from & 0x88) {
      from += 7;
      continue;
    }
    const piece = board[from];
    if (piece === EMPTY || colorOf(piece) !== us) continue;
    const type = typeOf(piece);

    if (type === PAWN) {
      const push = PAWN_PUSH[us];
      const oneStep = from + push;
      if (onBoard(oneStep) && board[oneStep] === EMPTY) {
        pushMove(moves, pos, from, oneStep, FLAG_NORMAL);
        const twoStep = from + push * 2;
        if (
          rankOf(from) === PAWN_HOME_RANK[us] &&
          onBoard(twoStep) &&
          board[twoStep] === EMPTY
        ) {
          pushMove(moves, pos, from, twoStep, FLAG_DOUBLE_PAWN);
        }
      }
      for (const offset of PAWN_CAPTURES[us]) {
        const to = from + offset;
        if (!onBoard(to)) continue;
        const target = board[to];
        if (target !== EMPTY && colorOf(target) === them) {
          pushMove(moves, pos, from, to, FLAG_CAPTURE);
        } else if (to === pos.epSquare) {
          pushMove(moves, pos, from, to, FLAG_EP_CAPTURE);
        }
      }
      continue;
    }

    if (type === KNIGHT || type === KING) {
      const offsets = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
      for (const offset of offsets) {
        const to = from + offset;
        if (!onBoard(to)) continue;
        const target = board[to];
        if (target === EMPTY) {
          pushMove(moves, pos, from, to, FLAG_NORMAL);
        } else if (colorOf(target) === them) {
          pushMove(moves, pos, from, to, FLAG_CAPTURE);
        }
      }
      continue;
    }

    const offsets = SLIDING_OFFSETS[type];
    if (!offsets) continue;
    for (const offset of offsets) {
      let to = from + offset;
      while (onBoard(to)) {
        const target = board[to];
        if (target === EMPTY) {
          pushMove(moves, pos, from, to, FLAG_NORMAL);
        } else {
          if (colorOf(target) === them) {
            pushMove(moves, pos, from, to, FLAG_CAPTURE);
          }
          break;
        }
        to += offset;
      }
    }
  }

  generateCastles(moves, pos, us);
  return moves;
}

function generateCastles(moves: Move[], pos: Position, us: Color): void {
  const board = pos.board;
  const them = (us ^ 1) as Color;
  const homeRank = us === WHITE ? 0 : 7;
  const kingFrom = squareOf(4, homeRank);
  if (pos.kings[us] !== kingFrom) return;
  // Castling out of check is illegal, and it is cheaper to test once here.
  if (isSquareAttacked(pos, kingFrom, them)) return;

  const kingSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
  const queenSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;

  if (pos.castling & kingSide) {
    const f = squareOf(5, homeRank);
    const g = squareOf(6, homeRank);
    if (
      board[f] === EMPTY &&
      board[g] === EMPTY &&
      !isSquareAttacked(pos, f, them)
    ) {
      // The g-file square is verified by the shared legality filter.
      pushMove(moves, pos, kingFrom, g, FLAG_KING_CASTLE);
    }
  }

  if (pos.castling & queenSide) {
    const b = squareOf(1, homeRank);
    const c = squareOf(2, homeRank);
    const d = squareOf(3, homeRank);
    if (
      board[b] === EMPTY &&
      board[c] === EMPTY &&
      board[d] === EMPTY &&
      !isSquareAttacked(pos, d, them)
    ) {
      pushMove(moves, pos, kingFrom, c, FLAG_QUEEN_CASTLE);
    }
  }
}

/** Every fully legal move for the side to move. */
export function legalMoves(pos: Position): Move[] {
  const scratch = clonePosition(pos);
  const pseudo = generatePseudoLegalMoves(scratch);
  const legal: Move[] = [];
  const us = pos.turn;

  for (const move of pseudo) {
    const undo = makeMove(scratch, move);
    if (!isKingAttacked(scratch, us)) legal.push(move);
    unmakeMove(scratch, undo);
  }

  return legal;
}

/** Apply a move and return the resulting position. The input is not modified. */
export function applyMove(pos: Position, move: Move): Position {
  const next = clonePosition(pos);
  makeMove(next, move);
  return next;
}

/** Find the legal move matching a from/to pair, optionally a promotion choice. */
export function findMove(
  pos: Position,
  from: Square,
  to: Square,
  promotion?: PieceType
): Move | undefined {
  return legalMoves(pos).find(
    m =>
      m.from === from &&
      m.to === to &&
      (promotion === undefined ||
        m.promotion === EMPTY ||
        m.promotion === promotion)
  );
}

export function isCheckmate(pos: Position): boolean {
  return inCheck(pos) && legalMoves(pos).length === 0;
}

export function isStalemate(pos: Position): boolean {
  return !inCheck(pos) && legalMoves(pos).length === 0;
}

/**
 * Insufficient material by the FIDE "cannot possibly checkmate" reading:
 * lone kings, king+minor, and king+bishop vs king+bishop on the same colour.
 */
export function isInsufficientMaterial(pos: Position): boolean {
  const pieces: Piece[] = [];
  const bishopSquares: Square[] = [];

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const piece = pos.board[sq];
    if (piece === EMPTY) continue;
    const type = typeOf(piece);
    if (type === KING) continue;
    if (type === PAWN || type === ROOK || type === QUEEN) return false;
    pieces.push(piece);
    if (type === BISHOP) bishopSquares.push(sq);
  }

  if (pieces.length <= 1) return true;
  if (pieces.length === bishopSquares.length) {
    // All remaining material is bishops: drawn iff they share one square colour.
    const firstColor =
      (fileOf(bishopSquares[0]) + rankOf(bishopSquares[0])) & 1;
    return bishopSquares.every(
      sq => ((fileOf(sq) + rankOf(sq)) & 1) === firstColor
    );
  }
  return false;
}

/** Node count of the move tree at a fixed depth — the standard correctness probe. */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const scratch = clonePosition(pos);
  return perftInner(scratch, depth);
}

function perftInner(pos: Position, depth: number): number {
  const moves = generatePseudoLegalMoves(pos);
  const us = pos.turn;
  let nodes = 0;

  for (const move of moves) {
    const undo = makeMove(pos, move);
    if (!isKingAttacked(pos, us)) {
      nodes += depth === 1 ? 1 : perftInner(pos, depth - 1);
    }
    unmakeMove(pos, undo);
  }

  return nodes;
}
