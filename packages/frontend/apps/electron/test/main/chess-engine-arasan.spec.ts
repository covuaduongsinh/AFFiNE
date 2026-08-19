import { afterEach, describe, expect, test, vi } from 'vitest';

import { listArasanBinaries } from '../../src/main/chess-engine/binary';
import { spawnArasanProcess } from '../../src/main/chess-engine/process';
import { UciSession } from '../../src/main/chess-engine/session';

const binaries = listArasanBinaries();
const describeIfPresent = binaries.length > 0 ? describe : describe.skip;

const sessions: UciSession[] = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map(session => session.dispose()));
});

describeIfPresent('pinned Arasan binary', () => {
  test('handshakes as a UCI engine', async () => {
    let lastError: unknown;
    for (const binary of binaries) {
      const { io } = spawnArasanProcess({ binary });
      const session = new UciSession(io, {
        engineVersion: '26.0',
        threads: 1,
        hashMb: 16,
        handshakeTimeoutMs: 15_000,
        quitTimeoutMs: 2_000,
      });
      sessions.push(session);
      try {
        await session.handshake();
        expect(session.name.toLowerCase()).toContain('arasan');

        const best: string[] = [];
        session.subscribe(event => {
          if (event.type === 'bestmove') best.push(event.bestmove);
        });
        await session.analyze({
          jobId: 'smoke',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          depth: 6,
        });
        await vi.waitFor(() => {
          expect(best.length).toBeGreaterThan(0);
        });
        expect(best[0]).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        return;
      } catch (error) {
        lastError = error;
        await session.dispose();
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('no Arasan binary completed handshake');
  });
});
