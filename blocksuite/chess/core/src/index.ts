/**
 * `@blocksuite/chess-core` — chess rules, FEN and PGN, with no runtime
 * dependencies.
 *
 * The move generator is verified against the standard perft reference set, so
 * castling, en passant, promotion and pin handling are known-correct rather than
 * assumed. Everything above it (SAN, PGN, the move tree) is built on that base.
 */

export {
  deleteFrom,
  playMove,
  type PlayMoveResult,
  promoteVariation,
  setComment,
  setNags,
} from './edit-tree';
export {
  clonePosition,
  FenError,
  findPieces,
  occupiedSquares,
  parseFen,
  START_FEN,
  startPosition,
  toFen,
} from './fen';
export {
  back,
  childrenAt,
  countMoves,
  findByFen,
  forward,
  mainLine,
  mainLinePath,
  nodeAt,
  positionAt,
  switchBranch,
  walk,
} from './move-tree';
export {
  parsePgn,
  parsePgnGames,
  PgnError,
  serializePgn,
  serializePgnGames,
} from './pgn';
export {
  applyMove,
  findMove,
  generatePseudoLegalMoves,
  inCheck,
  isCheckmate,
  isInsufficientMaterial,
  isKingAttacked,
  isSquareAttacked,
  isStalemate,
  legalMoves,
  makeMove,
  perft,
  unmakeMove,
} from './position';
export { moveToSan, moveToUci, normalizeSan, SanError, sanToMove } from './san';
export {
  algebraicToSquare,
  charToType,
  fileOf,
  onBoard,
  pieceToChar,
  rankOf,
  squareOf,
  squareToAlgebraic,
  typeToSanChar,
} from './square';
export {
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
  type Game,
  type GameHeader,
  type GameResult,
  KING,
  KNIGHT,
  type Move,
  type MoveNode,
  type MovePath,
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
