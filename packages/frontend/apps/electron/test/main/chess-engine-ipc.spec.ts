import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  tmpDir: '',
  appOn: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.tmpDir || os.tmpdir(),
    on: electronMock.appOn,
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  shell: { openPath: vi.fn() },
}));

vi.mock('../../src/main/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import type { EngineBestMove, EngineInfo } from '@blocksuite/chess-engine';

import { listArasanBinaries } from '../../src/main/chess-engine/binary';
import { chessEngineSubjects } from '../../src/main/chess-engine/events';
import { chessEngineHandlers } from '../../src/main/chess-engine/handlers';
import { nativeEngine } from '../../src/main/chess-engine/manager';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const binaries = listArasanBinaries();
const describeIfPresent = binaries.length > 0 ? describe : describe.skip;

/**
 * Same dispatch the preload uses: namespace:key → allHandlers[namespace][key].
 * This is the IPC contract without launching a BrowserWindow.
 */
async function invokeIpc(channel: string, ...args: unknown[]) {
  const [namespace, key] = channel.split(':');
  const handlers = { chessEngine: chessEngineHandlers } as const;
  const handler = handlers[namespace as 'chessEngine']?.[key as 'status'];
  if (!handler) {
    throw new Error(`handler not found for ${channel}`);
  }
  return handler({} as Electron.IpcMainInvokeEvent, ...args);
}

beforeEach(async () => {
  electronMock.tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'affine-chess-ipc-')
  );
});

afterEach(async () => {
  await nativeEngine.dispose();
  if (electronMock.tmpDir) {
    await fs.remove(electronMock.tmpDir);
    electronMock.tmpDir = '';
  }
});

describe('chessEngine IPC handlers', () => {
  test('status is available when Arasan is on disk', async () => {
    const status = await invokeIpc('chessEngine:status');
    expect(status).toEqual({
      available: binaries.length > 0,
      backend: 'native',
      version: '26.0',
    });
  });

  test('analyze rejects an illegal FEN before talking to the engine', async () => {
    await expect(
      invokeIpc('chessEngine:analyze', { jobId: 'bad', fen: 'not-a-fen' })
    ).rejects.toThrow();
  });
});

describeIfPresent('chessEngine IPC with live Arasan', () => {
  test('analyze streams info and bestmove over the event subjects', async () => {
    const infos: EngineInfo[] = [];
    const best: EngineBestMove[] = [];
    const infoSub = chessEngineSubjects.info$.subscribe(ev => infos.push(ev));
    const bestSub = chessEngineSubjects.bestMove$.subscribe(ev =>
      best.push(ev)
    );

    try {
      const status = await invokeIpc('chessEngine:status');
      expect(status).toMatchObject({ available: true, backend: 'native' });

      await invokeIpc('chessEngine:analyze', {
        jobId: 'ipc-1',
        fen: START_FEN,
        depth: 8,
      });

      await vi.waitFor(
        () => {
          expect(best.length).toBeGreaterThan(0);
        },
        { timeout: 20_000 }
      );

      expect(infos.some(info => info.jobId === 'ipc-1')).toBe(true);
      expect(best[0]?.jobId).toBe('ipc-1');
      expect(best[0]?.bestmove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    } finally {
      infoSub.unsubscribe();
      bestSub.unsubscribe();
    }
  });

  test('stop cancels an infinite search', async () => {
    const best: EngineBestMove[] = [];
    const sub = chessEngineSubjects.bestMove$.subscribe(ev => best.push(ev));

    try {
      await invokeIpc('chessEngine:analyze', {
        jobId: 'ipc-live',
        fen: START_FEN,
      });
      await invokeIpc('chessEngine:stop', 'ipc-live');
      await vi.waitFor(
        () => {
          expect(best.some(item => item.jobId === 'ipc-live')).toBe(true);
        },
        { timeout: 10_000 }
      );
    } finally {
      sub.unsubscribe();
    }
  });
});
