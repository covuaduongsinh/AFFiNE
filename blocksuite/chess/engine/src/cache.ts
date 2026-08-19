import type { PositionEval } from './types.js';

export interface EvalCache {
  get(key: string): PositionEval | undefined;
  set(key: string, value: PositionEval): void;
  clear(): void;
  readonly size: number;
}

/** Placement, turn, castling and en passant — the parts that change eval. */
export function fen4(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

export function evalCacheKey(options: {
  engineVersion: string;
  depth: number;
  multipv: number;
  fen: string;
}): string {
  return `${options.engineVersion}|d${options.depth}|mpv${options.multipv}|${fen4(options.fen)}`;
}

/** In-memory LRU. Insertion order of a `Map` is the recency order we want. */
export function createMemoryCache(limit = 256): EvalCache {
  const store = new Map<string, PositionEval>();

  return {
    get(key: string) {
      const value = store.get(key);
      if (value === undefined) return undefined;
      store.delete(key);
      store.set(key, value);
      return value;
    },
    set(key: string, value: PositionEval) {
      if (store.has(key)) store.delete(key);
      store.set(key, value);
      while (store.size > limit) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
    clear() {
      store.clear();
    },
    get size() {
      return store.size;
    },
  };
}
