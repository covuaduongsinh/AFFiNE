import type { AnalyzeRequest, EngineHost } from '@blocksuite/chess-engine';

/** Web / no-engine backend. Analyze is a silent no-op. */
export class NullEngineHost implements EngineHost {
  readonly id = 'null';
  readonly engineVersion = 'none';
  readonly ready = Promise.resolve();

  analyze(_req: AnalyzeRequest): Promise<void> {
    return Promise.resolve();
  }

  stop(_jobId?: string): Promise<void> {
    return Promise.resolve();
  }

  subscribe(): () => void {
    return () => {};
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}
