import { moveToUci, parseFen, sanToMove } from '@blocksuite/chess-core';

export type ReviewGrade = 1 | 3 | 4 | 5;

export function review(
  card: { ef: number; interval: number; repetitions: number },
  q: ReviewGrade,
  now: number
): { ef: number; interval: number; repetitions: number; due: number } {
  let ef = card.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;

  let { interval, repetitions } = card;
  if (q === 1) {
    repetitions = 0;
    interval = 1;
  } else if (repetitions === 0) {
    interval = 1;
    repetitions = 1;
  } else if (repetitions === 1) {
    interval = 6;
    repetitions = 2;
  } else {
    interval = Math.max(1, Math.round(interval * ef));
    repetitions += 1;
  }

  return {
    ef,
    interval,
    repetitions,
    due: now + interval * 86_400_000,
  };
}

export function matchMove(
  fen: string,
  playedSan: string,
  solutionSan: string
): boolean {
  if (!solutionSan) return false;
  try {
    const position = parseFen(fen);
    const played = sanToMove(position, playedSan);
    const solution = sanToMove(position, solutionSan);
    return moveToUci(played) === moveToUci(solution);
  } catch {
    return false;
  }
}
