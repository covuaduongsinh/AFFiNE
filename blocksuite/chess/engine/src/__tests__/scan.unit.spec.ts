import { parsePgn } from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import { fen4 } from '../cache';
import { scanGame } from '../scan';
import type { PositionEval } from '../types';

/**
 * Scholar's mate, already tagged a blunder in the PGN. The mock scores make
 * Nf6 a real blunder and everything else a best move, so the scan is doing
 * the classifying rather than reading the annotation.
 */
const SCHOLAR = `[Event "Scholar's mate"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0
`;

function evalOf(score: number, pv: string[]): PositionEval {
  return { score: { type: 'cp', value: score }, pv, depth: 12 };
}

describe('scanGame', () => {
  it('labels the main line from consecutive evals and reports ACPL', async () => {
    const game = parsePgn(SCHOLAR);
    const byFen = new Map<string, PositionEval>();

    const set = (fen: string, score: number, pv: string[]) => {
      byFen.set(fen4(fen), evalOf(score, pv));
    };

    // Walk the tree once so the mock keys match what scan will ask for.
    const start = game.moves[0].fenBefore;
    set(start, 20, ['e2e4']);
    set(game.moves[0].fenAfter, 15, ['e7e5']); // after e4
    const e5 = game.moves[0].children[0];
    set(e5.fenAfter, 25, ['f1c4']); // after e5
    const bc4 = e5.children[0];
    set(bc4.fenAfter, 20, ['b8c6']); // after Bc4
    const nc6 = bc4.children[0];
    set(nc6.fenAfter, 80, ['d1h5']); // after Nc6
    const qh5 = nc6.children[0];
    set(qh5.fenAfter, 70, ['g8e7']); // after Qh5 — Nf6 is the blunder
    const nf6 = qh5.children[0];
    set(nf6.fenAfter, 900, ['d1f7']); // after Nf6, White is mating
    const qxf7 = nf6.children[0];
    set(qxf7.fenAfter, -10000, []); // mate, Black to move but it's over

    const seen: string[] = [];
    const report = await scanGame(
      game,
      async fen => {
        seen.push(fen4(fen));
        const value = byFen.get(fen4(fen));
        if (!value) throw new Error(`unexpected fen ${fen}`);
        return value;
      },
      {
        engineId: 'mock',
        engineVersion: 'test-1',
        depth: 12,
        now: () => 1,
      }
    );

    expect(new Set(seen).size).toBe(seen.length);
    expect(report.engineId).toBe('mock');
    expect(report.createdAt).toBe(1);
    expect(report.nodes).toHaveLength(7);

    const nf6Scan = report.nodes.find(node => node.playedUci === 'g8f6');
    expect(nf6Scan?.label).toBe('blunder');
    expect(nf6Scan?.bestUci).toBe('g8e7');
    expect(nf6Scan?.cpl).toBeGreaterThan(500);

    const e4 = report.nodes.find(node => node.playedUci === 'e2e4');
    expect(e4?.label).toBe('best');
    expect(e4?.bestPvSan[0]).toBe('e4');

    expect(report.blackAcpl).toBeGreaterThan(report.whiteAcpl);
  });

  it('reports zeros on an empty game and can be aborted', async () => {
    const empty = parsePgn('*');
    const report = await scanGame(empty, async () => evalOf(0, []), {
      engineId: 'mock',
      engineVersion: 'test-1',
      depth: 10,
    });
    expect(report.nodes).toEqual([]);
    expect(report.whiteAcpl).toBe(0);
    expect(report.blackAcpl).toBe(0);

    const game = parsePgn('1. e4 e5 *');
    const controller = new AbortController();
    controller.abort();
    await expect(
      scanGame(game, async () => evalOf(0, ['e2e4']), {
        engineId: 'mock',
        engineVersion: 'test-1',
        depth: 10,
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it('calls onProgress once per unique position', async () => {
    const game = parsePgn('1. e4 e5 *');
    const ticks: Array<[number, number]> = [];
    await scanGame(game, async () => evalOf(0, []), {
      engineId: 'mock',
      engineVersion: 'test-1',
      depth: 8,
      onProgress: (done, total) => ticks.push([done, total]),
    });
    expect(ticks[0]).toEqual([0, 3]);
    expect(ticks.at(-1)).toEqual([3, 3]);
    expect(ticks.map(([done]) => done)).toEqual([0, 1, 2, 3]);
  });
});
