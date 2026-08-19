import type { Color } from '@blocksuite/chess-core';
import { WHITE } from '@blocksuite/chess-core';

import type { MoveLabel, Score } from './types.js';

/** Mate distances collapse to this many centipawns so they dominate any cp score. */
export const MATE_CP = 10_000;

/** Lichess public winning-chances curve. */
const WIN_CHANCE_K = 0.00368208;

export function scoreToCp(score: Score): number {
  if (score.type === 'mate') {
    if (score.value === 0) return 0;
    return Math.sign(score.value) * MATE_CP;
  }
  return score.value;
}

/** Score from White's point of view. `turn` is the side UCI reported for. */
export function whiteCp(score: Score, turn: Color): number {
  const cp = scoreToCp(score);
  return turn === WHITE ? cp : -cp;
}

/**
 * Win probability in `[-1, 1]` from a side-to-move centipawn score.
 *
 * The constant is the one Lichess publishes; we reimplement it rather than
 * import anything GPL.
 */
export function winningChances(cp: number): number {
  const clamped = Math.max(-MATE_CP, Math.min(MATE_CP, cp));
  return 2 / (1 + Math.exp(-WIN_CHANCE_K * clamped)) - 1;
}

/**
 * Classify a played move against the engine's best eval.
 *
 * Both numbers are centipawns from the mover's point of view (positive is good
 * for them). Thresholds are win-chance gaps, not raw pawns: dropping from +8
 * to +7 is not a blunder.
 */
export function classify(evalBest: number, evalPlayed: number): MoveLabel {
  const loss = winningChances(evalBest) - winningChances(evalPlayed);
  if (loss >= 0.3) return 'blunder';
  if (loss >= 0.2) return 'mistake';
  if (loss >= 0.1) return 'inaccuracy';
  return 'best';
}

/**
 * Centipawn loss for the mover, floored at 0.
 *
 * `before` is the UCI score of the position they faced (already their POV).
 * `after` is the UCI score of the position they left (opponent's POV).
 */
export function moverCpl(before: Score, after: Score): number {
  const evalBest = scoreToCp(before);
  const evalPlayed = -scoreToCp(after);
  return Math.max(0, evalBest - evalPlayed);
}

export function labelForScores(before: Score, after: Score): MoveLabel {
  return classify(scoreToCp(before), -scoreToCp(after));
}

/** NAG to write when the user applies a scan to the PGN. `best` writes nothing. */
export const LABEL_NAG: Record<MoveLabel, number | undefined> = {
  best: undefined,
  inaccuracy: 6,
  mistake: 2,
  blunder: 4,
};
