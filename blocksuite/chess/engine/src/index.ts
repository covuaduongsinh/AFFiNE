/**
 * `@blocksuite/chess-engine` — UCI text, eval classification and game scan.
 *
 * No I/O. Native spawn, WASM and IndexedDB live in the app shell; this package
 * is the part that can be tested with a mock host.
 */

export {
  applyScanToGame,
  evalGlyph,
  formatPgnEval,
  mergeEvalComment,
  parseGameScan,
  serializeGameScan,
} from './apply.js';
export {
  createMemoryCache,
  type EvalCache,
  evalCacheKey,
  fen4,
} from './cache.js';
export {
  classify,
  LABEL_NAG,
  labelForScores,
  MATE_CP,
  moverCpl,
  scoreToCp,
  whiteCp,
  winningChances,
} from './classify.js';
export {
  type ParsedUciLine,
  parseUciLine,
  withJobId,
  withJobIdBestMove,
} from './parse-info.js';
export { pvUciToSan } from './pv.js';
export { type ScanAnalyze, scanGame, type ScanOptions } from './scan.js';
export {
  CHESS_TOOL_NAMES,
  CHESS_TOOL_SCHEMAS,
  type ChessGameSnapshot,
  type ChessToolContext,
  type ChessToolErrorCode,
  type ChessToolName,
  type ChessToolResult,
  isChessToolName,
  runChessTool,
} from './tools.js';
export type {
  AnalyzeRequest,
  EngineBestMove,
  EngineEvent,
  EngineHost,
  EngineInfo,
  GameScan,
  MoveLabel,
  PositionEval,
  ScannedMove,
  Score,
} from './types.js';
