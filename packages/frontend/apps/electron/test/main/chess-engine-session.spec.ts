import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { EngineBestMove, EngineInfo } from '@blocksuite/chess-engine';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createChildProcessIo } from '../../src/main/chess-engine/io';
import { UciSession } from '../../src/main/chess-engine/session';

const fixture = fileURLToPath(
  new URL('./fixtures/fake-uci-engine.mjs', import.meta.url)
);

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const sessions: UciSession[] = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map(session => session.dispose()));
});

function startSession(extraArgs: string[] = []) {
  const child = spawn(process.execPath, [fixture, ...extraArgs], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  });
  const session = new UciSession(createChildProcessIo(child), {
    engineVersion: 'fake-0.1',
    threads: 1,
    hashMb: 16,
    handshakeTimeoutMs: 5_000,
    stopTimeoutMs: 2_000,
    quitTimeoutMs: 1_000,
  });
  sessions.push(session);
  return session;
}

describe('UciSession', () => {
  test('handshakes and reports the engine name', async () => {
    const session = startSession();
    await session.handshake();
    expect(session.name).toBe('FakeArasan 0.1');
  });

  test('streams info and bestmove for a finite search', async () => {
    const session = startSession();
    const infos: EngineInfo[] = [];
    const best: EngineBestMove[] = [];
    session.subscribe(event => {
      if (event.type === 'info') infos.push(event);
      if (event.type === 'bestmove') best.push(event);
    });

    await session.analyze({
      jobId: 'job-1',
      fen: START_FEN,
      depth: 8,
    });

    await vi.waitFor(() => {
      expect(best).toHaveLength(1);
    });

    expect(infos[0]?.jobId).toBe('job-1');
    expect(infos[0]?.score).toEqual({ type: 'cp', value: 24 });
    expect(infos[0]?.pv).toEqual(['e2e4', 'e7e5']);
    expect(best[0]).toMatchObject({
      jobId: 'job-1',
      bestmove: 'e2e4',
      ponder: 'e7e5',
    });
    expect(session.currentJobId).toBeNull();
  });

  test('stop ends an infinite search', async () => {
    const session = startSession();
    const best: EngineBestMove[] = [];
    session.subscribe(event => {
      if (event.type === 'bestmove') best.push(event);
    });

    await session.analyze({ jobId: 'live', fen: START_FEN });
    await session.stop('live');

    expect(best).toEqual([
      expect.objectContaining({ jobId: 'live', bestmove: 'e2e4' }),
    ]);
  });

  test('emits exit when the process dies mid-search', async () => {
    const session = startSession(['--crash-on-go']);
    const exits: number[] = [];
    session.subscribe(event => {
      if (event.type === 'exit') exits.push(event.code);
    });
    await session.handshake();
    await session.analyze({ jobId: 'boom', fen: START_FEN, depth: 4 });
    await vi.waitFor(() => {
      expect(exits.length).toBeGreaterThan(0);
    });
  });
});
