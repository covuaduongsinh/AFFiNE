import {
  BISHOP,
  colorOf,
  EMPTY,
  KING,
  KNIGHT,
  PAWN,
  type Piece,
  type PieceType,
  QUEEN,
  ROOK,
  type Square,
  typeOf,
  WHITE,
} from './types';

/** True when a 0x88 index refers to a real square. */
export const onBoard = (sq: Square): boolean => (sq & 0x88) === 0;

/** 0-based file, `a` = 0. */
export const fileOf = (sq: Square): number => sq & 7;

/** 0-based rank, rank 1 = 0. */
export const rankOf = (sq: Square): number => sq >> 4;

export const squareOf = (file: number, rank: number): Square =>
  (rank << 4) | file;

const FILE_CHARS = 'abcdefgh';

/** `0` -> `"a1"`. */
export function squareToAlgebraic(sq: Square): string {
  return `${FILE_CHARS[fileOf(sq)]}${rankOf(sq) + 1}`;
}

/** `"a1"` -> `0`. Returns -1 when the text is not a square. */
export function algebraicToSquare(text: string): Square {
  if (text.length !== 2) return -1;
  const file = FILE_CHARS.indexOf(text[0]);
  const rank = text.charCodeAt(1) - 49; // '1'
  if (file < 0 || rank < 0 || rank > 7) return -1;
  return squareOf(file, rank);
}

const TYPE_TO_CHAR: Record<number, string> = {
  [PAWN]: 'p',
  [KNIGHT]: 'n',
  [BISHOP]: 'b',
  [ROOK]: 'r',
  [QUEEN]: 'q',
  [KING]: 'k',
};

const CHAR_TO_TYPE: Record<string, PieceType> = {
  p: PAWN,
  n: KNIGHT,
  b: BISHOP,
  r: ROOK,
  q: QUEEN,
  k: KING,
};

/** Piece code -> FEN character, uppercase for white. */
export function pieceToChar(piece: Piece): string {
  if (piece === EMPTY) return '';
  const ch = TYPE_TO_CHAR[typeOf(piece)];
  return colorOf(piece) === WHITE ? ch.toUpperCase() : ch;
}

/** FEN character -> piece type, or undefined when the character is not a piece. */
export function charToType(ch: string): PieceType | undefined {
  return CHAR_TO_TYPE[ch.toLowerCase()];
}

/** Uppercase SAN letter for a piece type; the empty string for pawns. */
export function typeToSanChar(type: PieceType): string {
  return type === PAWN ? '' : TYPE_TO_CHAR[type].toUpperCase();
}
