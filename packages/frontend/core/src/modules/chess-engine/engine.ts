import type { Game } from '@blocksuite/chess-core';
import {
  type AnalyzeRequest,
  type EngineBestMove,
  type EngineEvent,
  type EngineHost,
  type EngineInfo,
  evalCacheKey,
  type GameScan,
  type PositionEval,
  scanGame,
} from '@blocksuite/chess-engine';
import { LiveData } from '@toeverything/infra';

import type { AsyncEvalCache } from './cache';
import { createAsyncMemoryCache } from './cache';
import { NullEngineHost } from './hosts/null-host';

export type ChessEngineStatus =
  | 'idle'
  | 'thinking'
  | 'scanning'
  | 'unavailable'
  | 'crashed';

export interface ChessEngineOptions {
  host: EngineHost;
  cache?: AsyncEvalCache;
  isEnabled?: () => boolean;
  liveDebounceMs?: number;
  defaultScanDepth?: number;
  now?: () => number;
}

const LIVE_DEBOUNCE_MS = 150;
const DEFAULT_SCAN_DEPTH = 14;

/**
 * Renderer-side engine session: one host, one job at a time, FEN cache,
 * and a single active block so a page of games does not stampede Arasan.
 */
export class ChessEngine {
  readonly status$ = new LiveData<ChessEngineStatus>('unavailable');
  readonly available$ = new LiveData(false);
  readonly activeBlock$ = new LiveData<string | null>(null);
  readonly lastInfo$ = new LiveData<EngineInfo | null>(null);
  readonly lastBestMove$ = new LiveData<EngineBestMove | null>(null);
  readonly scanProgress$ = new LiveData<{ done: number; total: number } | null>(
    null
  );

  private readonly host: EngineHost;
  private readonly cache: AsyncEvalCache;
  private readonly isEnabled: () => boolean;
  private readonly liveDebounceMs: number;
  private readonly defaultScanDepth: number;
  private readonly now: () => number;
  private readonly unsubscribeHost: () => void;

  private activeBlockId: string | null = null;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private liveJobId: string | null = null;
  private liveFen: string | null = null;
  private lastInfoFlush: ReturnType<typeof setTimeout> | null = null;
  private pendingInfo: EngineInfo | null = null;
  private scanAbort: AbortController | null = null;
  private queue: Promise<void> = Promise.resolve();
  private crashed = false;

  constructor(options: ChessEngineOptions) {
    this.host = options.host;
    this.cache = options.cache ?? createAsyncMemoryCache();
    this.isEnabled = options.isEnabled ?? (() => true);
    this.liveDebounceMs = options.liveDebounceMs ?? LIVE_DEBOUNCE_MS;
    this.defaultScanDepth = options.defaultScanDepth ?? DEFAULT_SCAN_DEPTH;
    this.now = options.now ?? Date.now;
    this.unsubscribeHost = this.host.subscribe(event =>
      this.onHostEvent(event)
    );
    this.refreshAvailability().catch(() => {});
  }

  get hostId(): string {
    return this.host.id;
  }

  get activeBlock(): string | null {
    return this.activeBlockId;
  }

  attachCache(cache: AsyncEvalCache): void {
    this.cache = cache;
  }

  setActiveBlock(id: string | null): void {
    if (this.activeBlockId === id) return;
    this.activeBlockId = id;
    this.activeBlock$.next(id);
    if (this.liveTimer) {
      clearTimeout(this.liveTimer);
      this.liveTimer = null;
    }
    if (this.liveJobId) {
      this.host.stop(this.liveJobId).catch(() => {});
      this.liveJobId = null;
    }
  }

  async available(): Promise<boolean> {
    if (!this.isEnabled() || this.host instanceof NullEngineHost) {
      return false;
    }
    await this.host.ready;
    const hostOk =
      'isAvailable' in this.host && typeof this.host.isAvailable === 'function'
        ? this.host.isAvailable()
        : this.host.id !== 'null';
    if (!hostOk) return false;
    // A false `exit` (broken stdin after `stop`) used to pin crashed=true
    // forever, so Scan failed while Analyze still showed the last eval.
    if (this.crashed) {
      this.crashed = false;
      this.available$.next(true);
      if (this.status$.value === 'crashed') this.status$.next('idle');
    }
    return true;
  }

  /**
   * Debounced live analysis of the focused block. Ignored when the block is
   * not active, the flag is off, or the host is unavailable.
   */
  analyzePosition(options: {
    blockId: string;
    fen: string;
    depth?: number;
    multipv?: number;
  }): void {
    if (this.activeBlockId !== options.blockId) return;
    if (!this.isEnabled() || this.crashed) return;
    if (this.status$.value === 'scanning') return;

    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => {
      this.liveTimer = null;
      this.enqueue(async () => {
        if (this.activeBlockId !== options.blockId) return;
        if (!(await this.available())) return;
        if (this.liveJobId && this.liveFen === options.fen) return;
        if (this.liveJobId) {
          await this.host.stop(this.liveJobId);
          this.liveJobId = null;
        }
        const jobId = createJobId();
        this.liveJobId = jobId;
        this.liveFen = options.fen;
        this.status$.next('thinking');
        await this.host.analyze({
          jobId,
          fen: options.fen,
          depth: options.depth,
          multipv: options.multipv ?? 3,
        });
      }).catch(() => {});
    }, this.liveDebounceMs);
  }

  async stop(jobId?: string): Promise<void> {
    this.scanAbort?.abort();
    await this.cancelLive(jobId);
    if (
      this.status$.value === 'thinking' ||
      this.status$.value === 'scanning'
    ) {
      this.status$.next('idle');
    }
  }

  async evaluate(
    fen: string,
    depth: number,
    multipv = 2
  ): Promise<PositionEval> {
    if (!(await this.available())) {
      throw new Error('chess engine is unavailable');
    }
    await this.host.ready;
    const key = evalCacheKey({
      engineVersion: this.host.engineVersion,
      depth,
      multipv,
      fen,
    });
    const cached = await this.cache.get(key);
    if (cached) {
      this.emitCached(cached, fen);
      return cached;
    }

    const jobId = createJobId();
    const result = await this.runFinite(jobId, {
      jobId,
      fen,
      depth,
      multipv,
    });
    await this.cache.set(key, result);
    return result;
  }

  async scan(
    game: Game,
    options: {
      depth?: number;
      signal?: AbortSignal;
      onProgress?: (done: number, total: number) => void;
    } = {}
  ): Promise<GameScan> {
    if (!this.isEnabled()) {
      throw new Error('chess engine is disabled');
    }
    if (!(await this.available())) {
      throw new Error('chess engine is unavailable');
    }

    const depth = options.depth ?? this.defaultScanDepth;
    this.status$.next('scanning');
    this.scanProgress$.next({ done: 0, total: 1 });
    this.scanAbort?.abort();
    await this.cancelLive();
    this.scanAbort = new AbortController();
    const signal = options.signal
      ? anySignal(options.signal, this.scanAbort.signal)
      : this.scanAbort.signal;

    return this.enqueue(async () => {
      this.status$.next('scanning');
      try {
        const report = await scanGame(
          game,
          fen => this.evaluate(fen, depth, 2),
          {
            engineId: this.host.id,
            engineVersion: this.host.engineVersion,
            depth,
            now: this.now,
            signal,
            onProgress: (done, total) => {
              this.scanProgress$.next({ done, total });
              options.onProgress?.(done, total);
            },
          }
        );
        return report;
      } finally {
        this.scanAbort = null;
        this.scanProgress$.next(null);
        if (this.status$.value === 'scanning') this.status$.next('idle');
      }
    });
  }

  async dispose(): Promise<void> {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    if (this.lastInfoFlush) clearTimeout(this.lastInfoFlush);
    this.scanAbort?.abort();
    this.unsubscribeHost();
    await this.host.dispose();
  }

  private async cancelLive(jobId?: string): Promise<void> {
    if (this.liveTimer) {
      clearTimeout(this.liveTimer);
      this.liveTimer = null;
    }
    const liveId = jobId ?? this.liveJobId ?? undefined;
    this.liveJobId = null;
    this.liveFen = null;
    await this.host.stop(liveId);
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async refreshAvailability(): Promise<void> {
    const ok = await this.available();
    this.available$.next(ok);
    if (!ok) {
      this.status$.next(this.crashed ? 'crashed' : 'unavailable');
      return;
    }
    if (
      this.status$.value === 'unavailable' ||
      this.status$.value === 'crashed'
    ) {
      this.status$.next('idle');
    }
  }

  private onHostEvent(event: EngineEvent) {
    if (event.type === 'info') {
      if (event.multipv === 1) this.publishInfo(event);
      return;
    }
    if (event.type === 'bestmove') {
      this.lastBestMove$.next(event);
      if (this.liveJobId === event.jobId) {
        this.liveJobId = null;
        if (this.status$.value === 'thinking') this.status$.next('idle');
      }
      return;
    }
    this.crashed = true;
    this.status$.next('crashed');
  }

  private publishInfo(info: EngineInfo) {
    this.pendingInfo = info;
    if (this.lastInfoFlush) return;
    this.lastInfo$.next(info);
    this.pendingInfo = null;
    this.lastInfoFlush = setTimeout(() => {
      this.lastInfoFlush = null;
      if (this.pendingInfo) {
        const next = this.pendingInfo;
        this.pendingInfo = null;
        this.lastInfo$.next(next);
      }
    }, 120);
  }

  private emitCached(evaled: PositionEval, _fen: string) {
    const jobId = `cache-${createJobId()}`;
    this.lastInfo$.next({
      jobId,
      depth: evaled.depth,
      multipv: 1,
      score: evaled.score,
      pv: evaled.pv,
    });
    this.lastBestMove$.next({
      jobId,
      bestmove: evaled.pv[0] ?? '',
    });
  }

  private runFinite(jobId: string, req: AnalyzeRequest): Promise<PositionEval> {
    return new Promise((resolve, reject) => {
      let last: EngineInfo | undefined;
      const off = this.host.subscribe(event => {
        if (
          event.type === 'info' &&
          event.jobId === jobId &&
          event.multipv === 1
        ) {
          last = event;
        }
        if (event.type === 'bestmove' && event.jobId === jobId) {
          off();
          resolve({
            score: last?.score ?? { type: 'cp', value: 0 },
            pv: last?.pv?.length
              ? last.pv
              : event.bestmove
                ? [event.bestmove]
                : [],
            depth: last?.depth ?? req.depth ?? 0,
          });
        }
        if (event.type === 'exit') {
          off();
          reject(new Error('engine exited'));
        }
      });
      this.host.analyze(req).catch(error => {
        off();
        reject(error);
      });
    });
  }
}

function createJobId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `job-${Math.random().toString(36).slice(2)}`;
}

function anySignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}
