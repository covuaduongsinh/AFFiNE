import { cpus } from 'node:os';

import {
  type AnalyzeRequest,
  type EngineEvent,
  type ParsedUciLine,
  parseUciLine,
  withJobId,
  withJobIdBestMove,
} from '@blocksuite/chess-engine';

import type { UciIo } from './io';

export interface UciSessionOptions {
  engineVersion: string;
  /** UCI `Hash` is megabytes in Arasan 26 (default 32, max 64000). */
  hashMb?: number;
  threads?: number;
  handshakeTimeoutMs?: number;
  stopTimeoutMs?: number;
  quitTimeoutMs?: number;
}

interface Waiter {
  match: (line: ParsedUciLine) => boolean;
  resolve: (line: ParsedUciLine) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const defaultThreads = () => Math.min(4, Math.max(1, cpus().length - 1));

/**
 * One UCI conversation. The caller owns the process; this object owns the
 * protocol: handshake, one in-flight `go`, `stop`, and a clean `quit`.
 */
export class UciSession {
  readonly engineVersion: string;
  private readonly io: UciIo;
  private readonly hashMb: number;
  private readonly threads: number;
  private readonly handshakeTimeoutMs: number;
  private readonly stopTimeoutMs: number;
  private readonly quitTimeoutMs: number;

  private jobId: string | null = null;
  private engineName = '';
  private ready = false;
  private closed = false;
  private waiters: Waiter[] = [];
  private readonly listeners = new Set<(event: EngineEvent) => void>();
  private readonly unsubscribeLine: () => void;
  private readonly unsubscribeClose: () => void;

  constructor(io: UciIo, options: UciSessionOptions) {
    this.io = io;
    this.engineVersion = options.engineVersion;
    this.hashMb = options.hashMb ?? 64;
    this.threads = options.threads ?? defaultThreads();
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 8_000;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 2_000;
    this.quitTimeoutMs = options.quitTimeoutMs ?? 500;
    this.unsubscribeLine = io.onLine(line => this.handleLine(line));
    this.unsubscribeClose = io.onClose(code => this.handleClose(code));
  }

  get name(): string {
    return this.engineName;
  }

  get currentJobId(): string | null {
    return this.jobId;
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async handshake(): Promise<void> {
    if (this.ready) return;
    this.io.send('uci');
    await this.waitFor(line => line.kind === 'uciok', this.handshakeTimeoutMs);
    this.io.send(`setoption name Hash value ${this.hashMb}`);
    this.io.send(`setoption name Threads value ${this.threads}`);
    this.io.send('setoption name OwnBook value false');
    this.io.send('setoption name Ponder value false');
    this.io.send('setoption name Use tablebases value false');
    this.io.send('setoption name Position learning value false');
    this.io.send('isready');
    await this.waitFor(
      line => line.kind === 'readyok',
      this.handshakeTimeoutMs
    );
    this.ready = true;
  }

  /**
   * Start a search. Resolves once the `go` command is written — scores arrive
   * on the subscriber as `info` / `bestmove`.
   */
  async analyze(request: AnalyzeRequest): Promise<void> {
    if (this.closed) throw new Error('uci session is closed');
    await this.handshake();
    if (this.jobId) {
      await this.stop();
    }
    this.io.send('isready');
    await this.waitFor(
      line => line.kind === 'readyok',
      this.handshakeTimeoutMs
    );
    this.jobId = request.jobId;
    const multipv = request.multipv ?? 1;
    this.io.send(`setoption name MultiPV value ${multipv}`);
    this.io.send(`position fen ${request.fen}`);
    const go = ['go'];
    if (request.depth !== undefined) {
      go.push('depth', String(request.depth));
    } else if (request.movetimeMs !== undefined) {
      go.push('movetime', String(request.movetimeMs));
    } else {
      go.push('infinite');
    }
    this.io.send(go.join(' '));
  }

  async stop(jobId?: string): Promise<void> {
    if (jobId && this.jobId && jobId !== this.jobId) return;
    if (!this.jobId || this.closed) return;
    this.io.send('stop');
    try {
      await this.waitFor(line => line.kind === 'bestmove', this.stopTimeoutMs);
    } catch {
      // Engine ignored stop; the next analyze() will still replace the job.
    }
  }

  async dispose(): Promise<void> {
    if (this.closed) return;
    this.io.send('quit');
    const closed = new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        this.io.kill();
        resolve();
      }, this.quitTimeoutMs);
      const off = this.io.onClose(() => {
        clearTimeout(timeout);
        off();
        resolve();
      });
    });
    await closed;
  }

  private handleLine(raw: string) {
    const parsed = parseUciLine(raw);
    if (parsed.kind === 'id' && parsed.key === 'name') {
      this.engineName = parsed.value;
    }
    if (parsed.kind === 'info' && this.jobId) {
      this.emit({ type: 'info', ...withJobId(parsed.info, this.jobId) });
    }
    if (parsed.kind === 'bestmove' && this.jobId) {
      this.emit({
        type: 'bestmove',
        ...withJobIdBestMove(parsed, this.jobId),
      });
      this.jobId = null;
    }
    this.settleWaiters(parsed);
  }

  private handleClose(code: number | null) {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.jobId = null;
    this.unsubscribeLine();
    this.unsubscribeClose();
    const error = new Error('uci engine exited');
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters = [];
    this.emit({ type: 'exit', code: code ?? 1 });
  }

  private emit(event: EngineEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private waitFor(
    match: (line: ParsedUciLine) => boolean,
    timeoutMs: number
  ): Promise<ParsedUciLine> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        match,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter(item => item !== waiter);
          reject(new Error('uci timeout'));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  private settleWaiters(line: ParsedUciLine) {
    const pending = this.waiters;
    this.waiters = [];
    for (const waiter of pending) {
      if (waiter.match(line)) {
        clearTimeout(waiter.timer);
        waiter.resolve(line);
      } else {
        this.waiters.push(waiter);
      }
    }
  }
}
