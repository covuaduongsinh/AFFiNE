import {
  type Game,
  mainLine,
  moveToUci,
  parseFen,
  toFen,
  WHITE,
} from '@blocksuite/chess-core';

import { fen4 } from './cache.js';
import { labelForScores, moverCpl } from './classify.js';
import { pvUciToSan } from './pv.js';
import type { GameScan, PositionEval, ScannedMove } from './types.js';

const ACPL_CAP = 1000;

export interface ScanAnalyze {
  (fen: string): Promise<PositionEval>;
}

export interface ScanOptions {
  engineId: string;
  engineVersion: string;
  depth: number;
  now?: () => number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Scan the main line of a game: one analysis per position, then compare
 * consecutive evals. Variations are left alone.
 */
export async function scanGame(
  game: Game,
  analyze: ScanAnalyze,
  options: ScanOptions
): Promise<GameScan> {
  const line = mainLine(game);
  const positions = [toFen(game.setup), ...line.map(node => node.fenAfter)];

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const fen of positions) {
    const key = fen4(fen);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(fen);
  }

  const evals = new Map<string, PositionEval>();
  let done = 0;
  options.onProgress?.(0, unique.length);
  for (const fen of unique) {
    options.signal?.throwIfAborted();
    evals.set(fen4(fen), await analyze(fen));
    done++;
    options.onProgress?.(done, unique.length);
  }

  const nodes: ScannedMove[] = [];
  const whiteCpls: number[] = [];
  const blackCpls: number[] = [];

  for (const [index, node] of line.entries()) {
    const before = evals.get(fen4(node.fenBefore));
    const after = evals.get(fen4(node.fenAfter));
    if (!before || !after) continue;

    const cpl = moverCpl(before.score, after.score);
    const turn = parseFen(node.fenBefore).turn;
    const capped = Math.min(cpl, ACPL_CAP);
    if (turn === WHITE) whiteCpls.push(capped);
    else blackCpls.push(capped);

    nodes.push({
      path: Array.from({ length: index + 1 }, () => 0),
      playedUci: moveToUci(node.move),
      bestUci: before.pv[0] ?? '',
      bestPvSan: pvUciToSan(node.fenBefore, before.pv),
      scoreBefore: before.score,
      scoreAfter: after.score,
      cpl,
      label: labelForScores(before.score, after.score),
    });
  }

  return {
    engineId: options.engineId,
    engineVersion: options.engineVersion,
    depth: options.depth,
    createdAt: (options.now ?? Date.now)(),
    whiteAcpl: average(whiteCpls),
    blackAcpl: average(blackCpls),
    nodes,
  };
}
