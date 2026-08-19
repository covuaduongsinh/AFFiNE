import { parsePgn, START_FEN } from '@blocksuite/chess-core';
import type {
  AnalyzeRequest,
  ChessGameSnapshot,
  EngineEvent,
  EngineHost,
} from '@blocksuite/chess-engine';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createAsyncMemoryCache } from '../../chess-engine/cache';
import { ChessEngine } from '../../chess-engine/engine';
import { cloneToolResult } from '../hosts/desktop-host';
import { NullCoachHost } from '../hosts/null-host';
import { ChessCoachSession } from '../session';

class MockEngineHost implements EngineHost {
  readonly id = 'mock';
  readonly engineVersion = 'mock-1';
  readonly ready = Promise.resolve();
  private readonly listeners = new Set<(event: EngineEvent) => void>();

  async analyze(req: AnalyzeRequest): Promise<void> {
    const listener = [...this.listeners];
    for (const emit of listener) {
      emit({
        type: 'info',
        jobId: req.jobId,
        depth: req.depth ?? 8,
        multipv: 1,
        score: { type: 'cp', value: 76 },
        pv: ['e2e4'],
      });
      emit({ type: 'bestmove', jobId: req.jobId, bestmove: 'e2e4' });
    }
  }

  async stop(): Promise<void> {}
  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async dispose(): Promise<void> {}
}

class RecordingCoachHost implements CoachHost {
  readonly id = 'test';
  replies: Array<{ requestId: string; ok: boolean }> = [];
  private listener: ((event: CoachClientEvent) => void) | null = null;

  async status(): Promise<CoachStatus> {
    return {
      available: true,
      provider: 'claude',
      providers: { claude: true, grok: false, api: false },
      claudePath: '/fake/claude',
      grokPath: null,
      api: null,
      hub: { url: 'http://127.0.0.1:1/mcp', token: 't' },
    };
  }
  async hubInfo() {
    return {
      url: 'http://127.0.0.1:1/mcp',
      token: 't',
      cliHint: 'claude mcp add affine-chess',
    };
  }
  async query(): Promise<void> {}
  async stop(): Promise<void> {}
  async setProvider() {}
  async saveApiKey() {}
  async clearApiKey() {}
  async replyTool(requestId: string, result: { ok: boolean }): Promise<void> {
    this.replies.push({ requestId, ok: result.ok });
  }
  subscribe(listener: (event: CoachClientEvent) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
  emit(event: CoachClientEvent) {
    this.listener?.(event);
  }
}

const sessions: ChessCoachSession[] = [];
const engines: ChessEngine[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  for (const engine of engines.splice(0)) void engine.dispose();
});

function makeSession(
  host: CoachHost,
  extra: { coach?: boolean; engineFlag?: boolean } = {}
) {
  const engine = new ChessEngine({
    host: new MockEngineHost(),
    cache: createAsyncMemoryCache(),
    isEnabled: () => extra.engineFlag ?? true,
  });
  engines.push(engine);
  const session = new ChessCoachSession(
    engine,
    host,
    () => extra.coach ?? true,
    () => extra.engineFlag ?? true
  );
  sessions.push(session);
  return { session, engine };
}

const SCHOLAR = `1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

describe('ChessCoachSession', () => {
  test('refuses unknown tools and replies to the host', async () => {
    const host = new RecordingCoachHost();
    const { session } = makeSession(host);
    host.emit({
      type: 'invoke',
      requestId: 'r1',
      name: 'bash',
      args: {},
    });
    await vi.waitFor(() => {
      expect(host.replies).toEqual([{ requestId: 'r1', ok: false }]);
    });
    expect(session.messages$.value.some(m => m.role === 'tool')).toBe(true);
  });

  test('a failed replyTool still settles and does not throw', async () => {
    const host = new RecordingCoachHost();
    let calls = 0;
    host.replyTool = async (requestId, result) => {
      calls += 1;
      if (calls === 1) {
        throw new Error('An object could not be cloned.');
      }
      host.replies.push({ requestId, ok: result.ok });
    };
    const { session } = makeSession(host);
    host.emit({
      type: 'invoke',
      requestId: 'r-clone',
      name: 'bash',
      args: {},
    });
    await vi.waitFor(() => {
      expect(host.replies).toEqual([{ requestId: 'r-clone', ok: false }]);
    });
    expect(session.messages$.value.some(m => m.role === 'tool')).toBe(true);
  });

  test('chess.analyze matches engine.evaluate on the same FEN', async () => {
    const { session, engine } = makeSession(new RecordingCoachHost());
    const viaEngine = await engine.evaluate(START_FEN, 12, 2);
    const viaTool = await session.runTool('chess.analyze', {
      fen: START_FEN,
      depth: 12,
      multipv: 2,
    });
    expect(viaTool.ok).toBe(true);
    if (!viaTool.ok) return;
    const payload = viaTool.payload as { score: unknown; pv: string[] };
    expect(payload.score).toEqual(viaEngine.score);
    expect(payload.pv).toEqual(viaEngine.pv);
  });

  test('scan+apply writes PGN once through the focused game adapter', async () => {
    const { session, engine } = makeSession(new RecordingCoachHost());
    engine.setActiveBlock('g1');
    const snap: ChessGameSnapshot = {
      pgn: SCHOLAR,
      currentPath: [],
      analysisJson: '',
    };
    const writes: ChessGameSnapshot[] = [];
    session.attachGame('g1', {
      get: () => snap,
      apply: next => {
        writes.push(next);
        snap.pgn = next.pgn;
        snap.analysisJson = next.analysisJson;
      },
    });
    const result = await session.runTool('chess.scan_game', {
      depth: 10,
      apply: true,
    });
    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].pgn).toMatch(/\[%eval/);
    parsePgn(writes[0].pgn);
  });

  test('engine flag off makes analyze fail clearly', async () => {
    const { session } = makeSession(new RecordingCoachHost(), {
      engineFlag: false,
    });
    const result = await session.runTool('chess.analyze', { fen: START_FEN });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('engine_disabled');
  });

  test('null host send explains the desktop requirement', async () => {
    const { session } = makeSession(new NullCoachHost());
    await session.send('hello');
    const last = session.messages$.value.at(-1);
    expect(last?.role).toBe('error');
    expect(last?.text).toMatch(/desktop|API key|Grok/i);
  });
});

describe('cloneToolResult', () => {
  test('keeps a plain analyze payload', () => {
    const result = cloneToolResult({
      ok: true,
      payload: { fen: START_FEN, score: { type: 'cp', value: 76 } },
    });
    expect(result).toEqual({
      ok: true,
      payload: { fen: START_FEN, score: { type: 'cp', value: 76 } },
    });
  });

  test('drops functions that Electron cannot clone', () => {
    const result = cloneToolResult({
      ok: true,
      payload: { score: { type: 'cp', value: 1 }, fn: () => 1 },
    });
    expect(result).toEqual({
      ok: true,
      payload: { score: { type: 'cp', value: 1 } },
    });
  });
});
