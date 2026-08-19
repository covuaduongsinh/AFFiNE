import { BLACK, WHITE } from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import {
  classify,
  labelForScores,
  moverCpl,
  scoreToCp,
  whiteCp,
  winningChances,
} from '../classify';

describe('winningChances', () => {
  it('is 0 at equality and odd around the origin', () => {
    expect(winningChances(0)).toBe(0);
    expect(winningChances(200)).toBeCloseTo(-winningChances(-200), 8);
    expect(winningChances(10_000)).toBeGreaterThan(0.99);
  });
});

describe('classify', () => {
  it('calls a tiny loss best and a large swing a blunder', () => {
    expect(classify(20, 15)).toBe('best');
    // Thresholds are 0.1 / 0.2 / 0.3 win-chance, ≈ 55 / 111 / 168 cp from equality.
    expect(classify(0, -60)).toBe('inaccuracy');
    expect(classify(0, -120)).toBe('mistake');
    expect(classify(0, -180)).toBe('blunder');
    expect(classify(100, -100)).toBe('blunder');
  });

  it('does not call a still-winning retreat a blunder', () => {
    // +800 to +700 is a pawn on the raw scale, but both are winning.
    expect(classify(800, 700)).toBe('best');
  });
});

describe('moverCpl', () => {
  it('reads UCI scores as side-to-move and floors a gain at 0', () => {
    expect(moverCpl({ type: 'cp', value: 20 }, { type: 'cp', value: 15 })).toBe(
      35
    );
    expect(
      moverCpl({ type: 'cp', value: 20 }, { type: 'cp', value: -40 })
    ).toBe(0);
  });

  it('treats a missed mate as a huge loss', () => {
    expect(moverCpl({ type: 'mate', value: 2 }, { type: 'cp', value: 0 })).toBe(
      10_000
    );
  });
});

describe('score helpers', () => {
  it('flips a black-to-move score into White’s frame', () => {
    expect(scoreToCp({ type: 'mate', value: 3 })).toBe(10_000);
    expect(whiteCp({ type: 'cp', value: 30 }, WHITE)).toBe(30);
    expect(whiteCp({ type: 'cp', value: 30 }, BLACK)).toBe(-30);
  });

  it('labels from a before/after pair the same way classify does', () => {
    expect(
      labelForScores({ type: 'cp', value: 0 }, { type: 'cp', value: 170 })
    ).toBe('blunder');
  });
});
