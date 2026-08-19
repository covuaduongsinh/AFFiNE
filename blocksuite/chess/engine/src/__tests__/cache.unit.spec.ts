import { describe, expect, it } from 'vitest';

import { createMemoryCache, evalCacheKey, fen4 } from '../cache';
import type { PositionEval } from '../types';

const EVAL: PositionEval = {
  score: { type: 'cp', value: 12 },
  pv: ['e2e4'],
  depth: 14,
};

describe('fen4 / evalCacheKey', () => {
  it('drops the move clocks so two FENs of the same position collide', () => {
    const a = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const b = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 5 3';
    expect(fen4(a)).toBe(fen4(b));
    expect(
      evalCacheKey({
        engineVersion: 'arasan-25.3',
        depth: 14,
        multipv: 2,
        fen: a,
      })
    ).toBe(
      evalCacheKey({
        engineVersion: 'arasan-25.3',
        depth: 14,
        multipv: 2,
        fen: b,
      })
    );
  });

  it('keeps different depths and engines apart', () => {
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';
    const a = evalCacheKey({
      engineVersion: 'a',
      depth: 12,
      multipv: 1,
      fen,
    });
    const b = evalCacheKey({
      engineVersion: 'a',
      depth: 14,
      multipv: 1,
      fen,
    });
    const c = evalCacheKey({
      engineVersion: 'b',
      depth: 12,
      multipv: 1,
      fen,
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('createMemoryCache', () => {
  it('evicts the least recently used entry', () => {
    const cache = createMemoryCache(2);
    cache.set('a', EVAL);
    cache.set('b', { ...EVAL, depth: 10 });
    cache.get('a');
    cache.set('c', { ...EVAL, depth: 8 });
    expect(cache.get('a')?.depth).toBe(14);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')?.depth).toBe(8);
    expect(cache.size).toBe(2);
  });

  it('clears', () => {
    const cache = createMemoryCache();
    cache.set('a', EVAL);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});
