/**
 * `@blocksuite/chess-core` — chess rules, FEN and PGN, with no runtime
 * dependencies.
 *
 * The move generator is verified against the standard perft reference set, so
 * castling, en passant, promotion and pin handling are known-correct rather than
 * assumed. Everything above it (SAN, PGN, the move tree) is built on that base.
 */

export {
  BOARD_SVG_PALETTE,
  type BoardSvgArrow,
  type BoardSvgHighlight,
  type BoardSvgOptions,
  type BoardSvgPalette,
  DIAGRAM_BOOK_PALETTE,
  fenToSvg,
} from './board-svg.js';
export { type ChessTextMatch, detectChessText } from './detect.js';
export {
  type ChessFontDiagramOptions,
  fenToChessFontText,
} from './diagram-font.js';
export {
  deleteFrom,
  playMove,
  type PlayMoveResult,
  promoteVariation,
  setComment,
  setNags,
} from './edit-tree.js';
export {
  clonePosition,
  FenError,
  findPieces,
  occupiedSquares,
  parseDiagramFen,
  parseFen,
  START_FEN,
  startPosition,
  toFen,
} from './fen.js';
export {
  captionFromHeaders,
  formatMovePreview,
  lichessExportUrl,
  type LichessRef,
  lichessUserGamesUrl,
  parseLichessRef,
} from './import.js';
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
} from './move-tree.js';
export {
  importPgnGames,
  parsePgn,
  parsePgnGames,
  PgnError,
  type PgnImportResult,
  type PgnImportSkip,
  serializePgn,
  serializePgnGames,
} from './pgn.js';
export {
  type ChessPieceSet,
  PIECE_SETS,
  PIECE_SETS_METADATA,
  PIECE_SHAPES,
  PIECE_VIEWBOX_SIZE,
  type PieceLetter,
  type PieceSetMetadata,
} from './piece-shapes.js';
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
} from './position.js';
export {
  moveToSan,
  moveToUci,
  normalizeSan,
  SanError,
  sanToMove,
  uciToMove,
} from './san.js';
export { type FenParts, readPlacement, writeFen } from './setup.js';
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
} from './square.js';
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
} from './types.js';
