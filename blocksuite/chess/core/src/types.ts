/**
 * Core value types for the chess engine.
 *
 * Board representation is 0x88: squares live in a 128-entry array where a square
 * is on the board iff `(sq & 0x88) === 0`. This makes off-board detection a single
 * bitwise test, which keeps move generation short and hard to get wrong.
 *
 * a1 is 0 and h8 is 119, so `file = sq & 7` and `rank = sq >> 4` (both 0-based).
 */

export const WHITE = 0;
export const BLACK = 1;

export type Color = typeof WHITE | typeof BLACK;

export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export type PieceType =
  | typeof PAWN
  | typeof KNIGHT
  | typeof BISHOP
  | typeof ROOK
  | typeof QUEEN
  | typeof KING;

/**
 * A piece is encoded as `(color << 3) | type`, so white pieces are 1..6 and black
 * pieces are 9..14. 0 means an empty square.
 */
export type Piece = number;

export const pieceOf = (color: Color, type: PieceType): Piece =>
  (color << 3) | type;
export const typeOf = (piece: Piece): PieceType => (piece & 7) as PieceType;
export const colorOf = (piece: Piece): Color => ((piece >> 3) & 1) as Color;

/** Castling rights bitmask. */
export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

/** Move flags bitmask. */
export const FLAG_NORMAL = 1;
export const FLAG_CAPTURE = 2;
export const FLAG_DOUBLE_PAWN = 4;
export const FLAG_EP_CAPTURE = 8;
export const FLAG_PROMOTION = 16;
export const FLAG_KING_CASTLE = 32;
export const FLAG_QUEEN_CASTLE = 64;

/** A square index in the 0x88 board, or {@link NO_SQUARE}. */
export type Square = number;
export const NO_SQUARE = -1;

export interface Move {
  from: Square;
  to: Square;
  /** The piece that moves, in `(color << 3) | type` encoding. */
  piece: Piece;
  /** The captured piece, or {@link EMPTY}. For en passant this is the pawn taken. */
  captured: Piece;
  /** Promotion piece type, or {@link EMPTY} when the move is not a promotion. */
  promotion: PieceType | typeof EMPTY;
  flags: number;
}

/**
 * A complete, self-contained chess position — everything a FEN string carries.
 *
 * Positions are treated as immutable by the public API. Internally move
 * generation mutates a scratch copy through make/unmake for speed.
 */
export interface Position {
  /** 128-entry 0x88 board. */
  board: Int8Array;
  turn: Color;
  castling: number;
  epSquare: Square;
  halfmoves: number;
  fullmoves: number;
  /** King square per colour, kept in sync so check tests stay O(1) to start. */
  kings: [Square, Square];
}

/** Standard PGN Seven Tag Roster plus the tags a chess study actually uses. */
export interface GameHeader {
  Event?: string;
  Site?: string;
  Date?: string;
  Round?: string;
  White?: string;
  Black?: string;
  Result?: string;
  ECO?: string;
  Opening?: string;
  WhiteElo?: string;
  BlackElo?: string;
  TimeControl?: string;
  /** Starting position when the game does not begin from the initial array. */
  FEN?: string;
  SetUp?: string;
  Annotator?: string;
  /** Any tag not covered above is preserved verbatim so round-trips stay lossless. */
  [key: string]: string | undefined;
}

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

/**
 * One move in the game tree.
 *
 * `children[0]` is the main continuation; `children[1..]` are variations, in the
 * order they appeared in the source PGN. Keeping variations as ordinary children
 * rather than a separate field is what makes navigation and serialization
 * uniform.
 */
export interface MoveNode {
  id: string;
  /** Standard Algebraic Notation, exactly as this engine renders it. */
  san: string;
  move: Move;
  /** FEN of the position this move was played in. */
  fenBefore: string;
  /** FEN of the position after this move. */
  fenAfter: string;
  /** Numeric Annotation Glyphs attached to the move, e.g. `$1` for `!`. */
  nags: number[];
  /** Comment appearing before the move token. */
  commentBefore?: string;
  /** Comment appearing after the move token. */
  comment?: string;
  children: MoveNode[];
}

export interface Game {
  headers: GameHeader;
  /** Position the move tree starts from. */
  setup: Position;
  /** Comment appearing before the first move. */
  commentBefore?: string;
  /** Top-level moves; `moves[0]` starts the main line. */
  moves: MoveNode[];
  result: GameResult;
}

/** A path through the move tree: the index of the chosen child at each ply. */
export type MovePath = number[];
