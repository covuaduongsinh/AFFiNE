import { parseFen, START_FEN } from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import { matchMove, review } from '../sm2';

const fresh = { ef: 2.5, interval: 0, repetitions: 0 };
const DAY = 86_400_000;

describe('review', () => {
  it('resets on Again', () => {
    const now = 1_000;
    const next = review({ ef: 2.5, interval: 6, repetitions: 3 }, 1, now);
    expect(next.repetitions).toBe(0);
    expect(next.interval).toBe(1);
    expect(next.due).toBe(now + DAY);
    expect(next.ef).toBeGreaterThanOrEqual(1.3);
  });

  it('uses interval 1 then 6 then round(6*ef)', () => {
    const now = 0;
    const first = review(fresh, 4, now);
    expect(first.interval).toBe(1);
    expect(first.repetitions).toBe(1);
    expect(first.due).toBe(DAY);

    const second = review(first, 4, now);
    expect(second.interval).toBe(6);
    expect(second.repetitions).toBe(2);

    const third = review(second, 4, now);
    expect(third.interval).toBe(Math.round(6 * third.ef));
    expect(third.repetitions).toBe(3);
  });

  it('floors ease at 1.3', () => {
    const next = review({ ef: 1.3, interval: 1, repetitions: 0 }, 1, 0);
    expect(next.ef).toBe(1.3);
  });
});

describe('matchMove', () => {
  it('accepts Scholar’s mate Qxf7#', () => {
    const fen =
      'rnbqkb1r/pppp1ppp/5n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    expect(matchMove(fen, 'Qxf7#', 'Qxf7#')).toBe(true);
    expect(matchMove(fen, 'Qh5', 'Qxf7#')).toBe(false);
    expect(matchMove(START_FEN, 'e4', '')).toBe(false);
    expect(parseFen(fen).fullmoves).toBe(4);
  });
});
