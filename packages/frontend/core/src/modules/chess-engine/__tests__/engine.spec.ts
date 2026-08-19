import { parsePgn } from '@blocksuite/chess-core';
import type {
  AnalyzeRequest,
  EngineEvent,
  EngineHost,
} from '@blocksuite/chess-engine';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createAsyncMemoryCache } from '../cache';
import { ChessEngine } from '../engine';
import { NullEngineHost } from '../hosts/null-host';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

class MockHost implements EngineHost {
  readonly id = 'mock';
  readonly engineVersion = 'mock-1';
  readonly ready = Promise.resolve();
  readonly analyzes: AnalyzeRequest[] = [];
  readonly stops: Array<string | undefined> = [];
  private readonly listeners = new Set<(event: EngineEvent) => void>();
  private readonly pending = new Map<string, AnalyzeRequest>();

  async analyze(req: AnalyzeRequest): Promise<void> {
    this.analyzes.push(req);
    this.pending.set(req.jobId, req);
    if (req.depth !== undefined) {
      this.complete(req.jobId, 24, ['e2e4']);
    }
  }

  async stop(jobId?: string): Promise<void> {
    this.stops.push(jobId);
    const id = jobId ?? [...this.pending.keys()].at(-1);
    if (id) this.complete(id, 10, ['e2e4']);
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    this.listeners.clear();
  }

  emitInfo(info: {
    jobId: string;
    depth?: number;
    multipv?: number;
    score: number;
    pv: string[];
  }) {
    this.emit({
      type: 'info',
      jobId: info.jobId,
      depth: info.depth ?? 8,
      multipv: info.multipv ?? 1,
      score: { type: 'cp', value: info.score },
      pv: info.pv,
    });
  }

  complete(jobId: string, score: number, pv: string[]) {
    const req = this.pending.get(jobId);
    if (!req) return;
    this.pending.delete(jobId);
    this.emit({
      type: 'info',
      jobId,
      depth: req.depth ?? 8,
      multipv: 1,
      score: { type: 'cp', value: score },
      pv,
    });
    this.emit({ type: 'bestmove', jobId, bestmove: pv[0] ?? '' });
  }

  crash() {
    this.emit({ type: 'exit', code: 1 });
  }

  private emit(event: EngineEvent) {
    for (const listener of this.listeners) listener(event);
  }
}

const engines: ChessEngine[] = [];

afterEach(async () => {
  await Promise.all(engines.splice(0).map(engine => engine.dispose()));
  vi.useRealTimers();
});

function createEngine(
  host: EngineHost,
  extra: {
    enabled?: boolean;
    cache?: ReturnType<typeof createAsyncMemoryCache>;
  } = {}
) {
  const engine = new ChessEngine({
    host,
    cache: extra.cache ?? createAsyncMemoryCache(),
    isEnabled: () => extra.enabled ?? true,
    liveDebounceMs: 150,
  });
  engines.push(engine);
  return engine;
}

describe('ChessEngine', () => {
  test('is unavailable with a null host or a disabled flag', async () => {
    const off = createEngine(new MockHost(), { enabled: false });
    expect(await off.available()).toBe(false);

    const none = createEngine(new NullEngineHost());
    expect(await none.available()).toBe(false);
    await expect(none.evaluate(START, 10)).rejects.toThrow(/unavailable/);
  });

  test('evaluate caches a finite search and skips the host on the second call', async () => {
    const host = new MockHost();
    const engine = createEngine(host);
    engine.setActiveBlock('g1');

    const first = await engine.evaluate(START, 10, 2);
    expect(first.score).toEqual({ type: 'cp', value: 24 });
    expect(host.analyzes).toHaveLength(1);

    const second = await engine.evaluate(START, 10, 2);
    expect(second).toEqual(first);
    expect(host.analyzes).toHaveLength(1);
  });

  test('publishes the focused block so views can hide another game’s eval', () => {
    const engine = createEngine(new MockHost());
    expect(engine.activeBlock$.value).toBeNull();
    engine.setActiveBlock('g1');
    expect(engine.activeBlock$.value).toBe('g1');
    engine.setActiveBlock(null);
    expect(engine.activeBlock$.value).toBeNull();
  });

  test('debounces live analysis and only talks for the active block', async () => {
    vi.useFakeTimers();
    const host = new MockHost();
    const engine = createEngine(host);
    engine.setActiveBlock('g1');

    engine.analyzePosition({ blockId: 'other', fen: START });
    engine.analyzePosition({ blockId: 'g1', fen: START });
    engine.analyzePosition({ blockId: 'g1', fen: AFTER_E4 });

    expect(host.analyzes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(150);
    await vi.runAllTimersAsync();

    expect(host.analyzes).toHaveLength(1);
    expect(host.analyzes[0]?.fen).toBe(AFTER_E4);
  });

  test('lastInfo follows MultiPV 1, not a later line', () => {
    const host = new MockHost();
    const engine = createEngine(host);
    host.emitInfo({
      jobId: 'j1',
      multipv: 1,
      score: 40,
      pv: ['e2e4'],
    });
    host.emitInfo({
      jobId: 'j1',
      multipv: 3,
      score: 0,
      pv: [],
    });
    expect(engine.lastInfo$.value?.score).toEqual({ type: 'cp', value: 40 });
    expect(engine.lastInfo$.value?.pv).toEqual(['e2e4']);
  });

  test('scan walks the main line through evaluate', async () => {
    const host = new MockHost();
    const engine = createEngine(host);
    const game = parsePgn('1. e4 e5 *');
    const ticks: Array<[number, number]> = [];

    const report = await engine.scan(game, {
      depth: 8,
      onProgress: (done, total) => ticks.push([done, total]),
    });

    expect(report.nodes.length).toBe(2);
    expect(report.engineId).toBe('mock');
    expect(ticks.at(-1)?.[0]).toBe(ticks.at(-1)?.[1]);
    expect(host.analyzes.length).toBeGreaterThan(0);
  });

  test('stop aborts a pending live job', async () => {
    const host = new MockHost();
    const engine = createEngine(host);
    engine.setActiveBlock('g1');
    engine.analyzePosition({ blockId: 'g1', fen: START });
    await engine.stop();
    expect(
      engine.status$.value === 'idle' || engine.status$.value === 'unavailable'
    ).toBe(true);
  });

  test('marks the session crashed when the host exits', async () => {
    const host = new MockHost();
    const engine = createEngine(host);
    host.crash();
    expect(engine.status$.value).toBe('crashed');
    expect(await engine.available()).toBe(true);
    expect(engine.status$.value).toBe('idle');
  });

  test('scan still runs after a spurious host exit', async () => {
    const host = new MockHost();
    const engine = createEngine(host);
    host.crash();
    const game = parsePgn('1. e4 e5 *');
    const report = await engine.scan(game, { depth: 8 });
    expect(report.nodes.length).toBe(2);
  });
});
