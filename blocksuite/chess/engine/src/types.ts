import type { MovePath } from '@blocksuite/chess-core';

/** Engine score: centipawns or mate-in-N, always from the side to move. */
export type Score = { type: 'cp' | 'mate'; value: number };

export type MoveLabel = 'best' | 'inaccuracy' | 'mistake' | 'blunder';

export interface AnalyzeRequest {
  /** Caller-issued id; stale events for a superseded job are dropped. */
  jobId: string;
  /** Full 6-field FEN, already validated with `parseFen`. */
  fen: string;
  /** Omit for `go infinite` (live analysis). */
  depth?: number;
  movetimeMs?: number;
  /** Distinct principal variations to ask for. Defaults to 1. */
  multipv?: number;
}

export interface EngineInfo {
  jobId: string;
  depth: number;
  seldepth?: number;
  multipv: number;
  score: Score;
  /** UCI tokens, e.g. `e2e4`. */
  pv: string[];
  nodes?: number;
  nps?: number;
  timeMs?: number;
}

export interface EngineBestMove {
  jobId: string;
  bestmove: string;
  ponder?: string;
}

export type EngineEvent =
  | ({ type: 'info' } & EngineInfo)
  | ({ type: 'bestmove' } & EngineBestMove)
  | { type: 'exit'; code: number };

/**
 * One backend — native process, WASM worker, or (later) a server.
 *
 * `analyze` does not resolve with the final eval: scores stream through
 * `subscribe`. The caller folds `info` by `(jobId, multipv)` and settles when
 * `bestmove` arrives.
 */
export interface EngineHost {
  readonly id: string;
  readonly engineVersion: string;
  readonly ready: Promise<void>;
  analyze(req: AnalyzeRequest): Promise<void>;
  stop(jobId?: string): Promise<void>;
  subscribe(listener: (event: EngineEvent) => void): () => void;
  dispose(): Promise<void>;
}

/** Snapshot stored in the eval cache and consumed by {@link scanGame}. */
export interface PositionEval {
  score: Score;
  /** Best line, UCI. `pv[0]` is the engine's first choice. */
  pv: string[];
  depth: number;
}

export interface ScannedMove {
  path: MovePath;
  playedUci: string;
  bestUci: string;
  bestPvSan: string[];
  scoreBefore: Score;
  scoreAfter: Score;
  /** Centipawn loss for the mover; never negative. */
  cpl: number;
  label: MoveLabel;
}

export interface GameScan {
  engineId: string;
  engineVersion: string;
  depth: number;
  createdAt: number;
  whiteAcpl: number;
  blackAcpl: number;
  nodes: ScannedMove[];
}
