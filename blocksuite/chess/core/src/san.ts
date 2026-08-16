import { clonePosition } from './fen';
import { isKingAttacked, legalMoves, makeMove } from './position';
import {
  algebraicToSquare,
  fileOf,
  rankOf,
  squareToAlgebraic,
  typeToSanChar,
} from './square';
import {
  EMPTY,
  FLAG_CAPTURE,
  FLAG_EP_CAPTURE,
  FLAG_KING_CASTLE,
  FLAG_PROMOTION,
  FLAG_QUEEN_CASTLE,
  type Move,
  PAWN,
  type PieceType,
  type Position,
  typeOf,
} from './types';

const FILE_CHARS = 'abcdefgh';

export class SanError extends Error {
  override name = 'SanError';
}

/**
 * Render a move as Standard Algebraic Notation, including the disambiguation
 * and check/mate suffix that the PGN standard requires.
 *
 * `pos` must be the position *before* the move.
 */
export function moveToSan(pos: Position, move: Move, legal?: Move[]): string {
  let san: string;

  if (move.flags & FLAG_KING_CASTLE) {
    san = 'O-O';
  } else if (move.flags & FLAG_QUEEN_CASTLE) {
    san = 'O-O-O';
  } else {
    const type = typeOf(move.piece);
    const isCapture = (move.flags & (FLAG_CAPTURE | FLAG_EP_CAPTURE)) !== 0;
    const target = squareToAlgebraic(move.to);

    if (type === PAWN) {
      // A pawn capture always names its origin file, so it never needs more.
      san = isCapture ? `${FILE_CHARS[fileOf(move.from)]}x${target}` : target;
    } else {
      const disambiguation = disambiguate(pos, move, legal);
      san = `${typeToSanChar(type)}${disambiguation}${isCapture ? 'x' : ''}${target}`;
    }

    if (move.flags & FLAG_PROMOTION) {
      san += `=${typeToSanChar(move.promotion as PieceType)}`;
    }
  }

  return san + checkSuffix(pos, move);
}

/**
 * The smallest origin hint that separates this move from every other legal move
 * of the same piece type to the same square: file, else rank, else both.
 */
function disambiguate(pos: Position, move: Move, legal?: Move[]): string {
  const type = typeOf(move.piece);
  const candidates = (legal ?? legalMoves(pos)).filter(
    other =>
      other.to === move.to &&
      other.from !== move.from &&
      typeOf(other.piece) === type
  );

  if (candidates.length === 0) return '';

  const sameFile = candidates.some(
    other => fileOf(other.from) === fileOf(move.from)
  );
  const sameRank = candidates.some(
    other => rankOf(other.from) === rankOf(move.from)
  );

  if (!sameFile) return FILE_CHARS[fileOf(move.from)];
  if (!sameRank) return String(rankOf(move.from) + 1);
  return squareToAlgebraic(move.from);
}

/** `#` for checkmate, `+` for check, empty otherwise. */
function checkSuffix(pos: Position, move: Move): string {
  const scratch = clonePosition(pos);
  makeMove(scratch, move);
  const givesCheck = isKingAttacked(scratch, scratch.turn);
  if (!givesCheck) return '';
  const hasReply = legalMoves(scratch).length > 0;
  return hasReply ? '+' : '#';
}

/**
 * Strip everything that does not change which move is meant, so that the many
 * SAN dialects found in real PGN files compare equal:
 * `0-0`/`O-O`, `e8Q`/`e8=Q`, `exd6e.p.`, and `!?`/`+`/`#` suffixes.
 */
function normalizeSan(san: string): string {
  return san
    .trim()
    .replace(/\s+/g, '')
    .replace(/e\.p\.?$/i, '')
    .replace(/[+#]+/g, '')
    .replace(/[!?]+/g, '')
    .replace(/0/g, 'O')
    .replace(/=/g, '');
}

/**
 * Resolve a SAN token against the legal moves of `pos`.
 *
 * Matching is done by rendering each legal move and comparing normalized forms,
 * which guarantees the parser and the writer can never disagree.
 */
export function sanToMove(pos: Position, san: string): Move {
  const wanted = normalizeSan(san);
  if (wanted === '') throw new SanError(`Empty move token`);

  const legal = legalMoves(pos);
  for (const move of legal) {
    if (normalizeSan(moveToSan(pos, move, legal)) === wanted) return move;
  }

  const relaxed = matchLongAlgebraic(legal, wanted);
  if (relaxed) return relaxed;

  throw new SanError(`Illegal or unparsable move "${san}"`);
}

/**
 * Fallback for the long algebraic form (`e2e4`, `e7e8q`) that some tools emit
 * into PGN comments and that UCI engines speak natively.
 */
function matchLongAlgebraic(legal: Move[], token: string): Move | undefined {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(token);
  if (!match) return undefined;

  const from = algebraicToSquare(match[1]);
  const to = algebraicToSquare(match[2]);
  const promotionChar = match[3]?.toLowerCase();

  return legal.find(move => {
    if (move.from !== from || move.to !== to) return false;
    if (move.promotion === EMPTY) return true;
    return (
      typeToSanChar(move.promotion as PieceType).toLowerCase() ===
      (promotionChar ?? 'q')
    );
  });
}

/** Long algebraic (UCI) rendering of a move, e.g. `e7e8q`. */
export function moveToUci(move: Move): string {
  const promotion =
    move.promotion === EMPTY
      ? ''
      : typeToSanChar(move.promotion as PieceType).toLowerCase();
  return `${squareToAlgebraic(move.from)}${squareToAlgebraic(move.to)}${promotion}`;
}

/** Exposed so callers can normalize user input the same way the parser does. */
export { normalizeSan };
