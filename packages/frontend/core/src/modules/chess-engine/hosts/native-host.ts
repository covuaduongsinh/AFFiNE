import type {
  AnalyzeRequest,
  EngineBestMove,
  EngineEvent,
  EngineHost,
  EngineInfo,
} from '@blocksuite/chess-engine';

export interface NativeEngineApi {
  status: () => Promise<{
    available: boolean;
    backend: string;
    version: string;
  }>;
  analyze: (req: AnalyzeRequest) => Promise<void>;
  stop: (jobId?: string) => Promise<void>;
}

export interface NativeEngineEvents {
  onInfo: (fn: (info: EngineInfo) => void) => () => void;
  onBestMove: (fn: (move: EngineBestMove) => void) => () => void;
  onExit: (fn: (event: { code: number }) => void) => () => void;
}

/** Renderer-side adapter over Electron `chessEngine` IPC. */
export class NativeEngineHost implements EngineHost {
  readonly id = 'arasan-native';
  engineVersion = 'unknown';
  readonly ready: Promise<void>;

  private available = false;
  private readonly listeners = new Set<(event: EngineEvent) => void>();
  private readonly unsubscribers: Array<() => void>;

  constructor(
    private readonly api: NativeEngineApi,
    events: NativeEngineEvents
  ) {
    this.unsubscribers = [
      events.onInfo(info => this.emit({ type: 'info', ...info })),
      events.onBestMove(move => this.emit({ type: 'bestmove', ...move })),
      events.onExit(event => this.emit({ type: 'exit', code: event.code })),
    ];
    this.ready = this.api
      .status()
      .then(status => {
        this.available = status.available;
        this.engineVersion = status.version;
      })
      .catch(() => {
        this.available = false;
      });
  }

  isAvailable(): boolean {
    return this.available;
  }

  analyze(req: AnalyzeRequest): Promise<void> {
    return this.api.analyze(req);
  }

  stop(jobId?: string): Promise<void> {
    return this.api.stop(jobId);
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async dispose(): Promise<void> {
    for (const off of this.unsubscribers) off();
    this.listeners.clear();
  }

  private emit(event: EngineEvent) {
    for (const listener of this.listeners) listener(event);
  }
}
