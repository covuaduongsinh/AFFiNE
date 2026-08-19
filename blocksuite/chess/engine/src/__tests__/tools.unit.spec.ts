import {
  parsePgn,
  serializePgn,
  START_FEN,
  toFen,
} from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import { applyScanToGame } from '../apply';
import {
  CHESS_TOOL_NAMES,
  type ChessGameSnapshot,
  type ChessToolContext,
  isChessToolName,
  runChessTool,
} from '../tools';
import type { GameScan, PositionEval } from '../types';

const SCHOLAR = `[Event "Scholar's mate"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0
`;

const FIXED_EVAL: PositionEval = {
  score: { type: 'cp', value: 76 },
  pv: ['e2e4', 'e7e5'],
  depth: 14,
};

function scholarScan(): GameScan {
  return {
    engineId: 'mock',
    engineVersion: 'test-1',
    depth: 12,
    createdAt: 1,
    whiteAcpl: 10,
    blackAcpl: 80,
    nodes: [
      {
        path: [0],
        playedUci: 'e2e4',
        bestUci: 'e2e4',
        bestPvSan: ['e4'],
        scoreBefore: { type: 'cp', value: 20 },
        scoreAfter: { type: 'cp', value: 15 },
        cpl: 0,
        label: 'best',
      },
      {
        path: [0, 0, 0, 0, 0, 0],
        playedUci: 'g8f6',
        bestUci: 'g8e7',
        bestPvSan: ['Ne7'],
        scoreBefore: { type: 'cp', value: 70 },
        scoreAfter: { type: 'cp', value: 900 },
        cpl: 800,
        label: 'blunder',
      },
    ],
  };
}

function context(
  extra: Partial<ChessToolContext> & {
    game?: ChessGameSnapshot | null;
  } = {}
): { ctx: ChessToolContext; writes: ChessGameSnapshot[] } {
  const writes: ChessGameSnapshot[] = [];
  const game =
    extra.game === undefined
      ? { pgn: SCHOLAR, currentPath: [] as number[], analysisJson: '' }
      : extra.game;
  const ctx: ChessToolContext = {
    engineEnabled: extra.engineEnabled ?? true,
    lastScan: extra.lastScan ?? null,
    evaluate:
      extra.evaluate ??
      (async (_fen, depth, _multipv) => ({ ...FIXED_EVAL, depth })),
    scan: extra.scan ?? (async () => scholarScan()),
    readGame: extra.readGame ?? (() => game),
    writeGame:
      extra.writeGame ??
      (next => {
        writes.push(next);
        if (game) {
          game.pgn = next.pgn;
          game.currentPath = next.currentPath;
          game.analysisJson = next.analysisJson;
        }
      }),
  };
  return { ctx, writes };
}

describe('isChessToolName', () => {
  it('accepts only the whitelist', () => {
    for (const name of CHESS_TOOL_NAMES) {
      expect(isChessToolName(name)).toBe(true);
    }
    expect(isChessToolName('bash')).toBe(false);
    expect(isChessToolName('chess.explorer')).toBe(false);
  });
});

describe('runChessTool', () => {
  it('denies tools outside the whitelist', async () => {
    const { ctx } = context();
    const result = await runChessTool(ctx, 'bash', { command: 'rm' });
    expect(result).toEqual({
      ok: false,
      code: 'unknown_tool',
      error: 'tool bash is not allowed',
    });
  });

  it('fails analyze and scan when the engine flag is off', async () => {
    const { ctx } = context({ engineEnabled: false });
    const analyze = await runChessTool(ctx, 'chess.analyze', {
      fen: START_FEN,
    });
    expect(analyze.ok).toBe(false);
    if (!analyze.ok) expect(analyze.code).toBe('engine_disabled');
    const scan = await runChessTool(ctx, 'chess.scan_game', {});
    expect(scan.ok).toBe(false);
    if (!scan.ok) expect(scan.code).toBe('engine_disabled');
  });

  it('returns the same eval the context evaluate() produced', async () => {
    const { ctx } = context();
    const result = await runChessTool(ctx, 'chess.analyze', {
      fen: START_FEN,
      depth: 14,
      multipv: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = result.payload as {
      fen: string;
      score: PositionEval['score'];
      pv: string[];
      pvSan: string[];
      depth: number;
    };
    expect(payload.fen).toBe(START_FEN);
    expect(payload.score).toEqual(FIXED_EVAL.score);
    expect(payload.pv).toEqual(FIXED_EVAL.pv);
    expect(payload.pvSan[0]).toBe('e4');
    expect(payload.depth).toBe(14);
  });

  it('analyzes the focused position when fen is omitted', async () => {
    const game = parsePgn(SCHOLAR);
    const afterE4 = toFen(game.moves[0] ? parsePgn(SCHOLAR).setup : game.setup);
    const { ctx } = context({
      game: {
        pgn: SCHOLAR,
        currentPath: [0],
        analysisJson: '',
      },
    });
    const result = await runChessTool(ctx, 'chess.analyze', {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.payload as { fen: string }).fen).toBe(
      game.moves[0].fenAfter
    );
    expect(afterE4).toBeTruthy();
  });

  it('rejects an unreadable FEN', async () => {
    const { ctx } = context();
    const result = await runChessTool(ctx, 'chess.analyze', {
      fen: 'not-a-fen',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_fen');
  });

  it('fails read/scan/write when no game is focused', async () => {
    const { ctx } = context({
      readGame: () => null,
    });
    for (const name of [
      'chess.read_doc',
      'chess.scan_game',
      'chess.write_doc',
    ]) {
      const result = await runChessTool(ctx, name, {});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('no_game');
    }
  });

  it('scan_game with apply writes PGN and analysis in one writeGame call', async () => {
    const { ctx, writes } = context();
    const result = await runChessTool(ctx, 'chess.scan_game', {
      depth: 12,
      apply: true,
    });
    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].analysisJson).toContain('blunder');
    expect(writes[0].pgn).toMatch(/\[%eval/);
    expect(writes[0].pgn).toMatch(/\?\?|\$4/);
    expect(ctx.lastScan?.nodes.some(n => n.label === 'blunder')).toBe(true);

    const expected = parsePgn(SCHOLAR);
    applyScanToGame(expected, scholarScan());
    expect(writes[0].pgn).toBe(serializePgn(expected));
  });

  it('write_doc apply_scan uses lastScan and is a single write', async () => {
    const { ctx, writes } = context({ lastScan: scholarScan() });
    const result = await runChessTool(ctx, 'chess.write_doc', {
      action: 'apply_scan',
    });
    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].pgn).toMatch(/\[%eval/);
  });

  it('set_nags keeps praise marks', async () => {
    const { ctx, writes } = context({
      game: { pgn: '1. e4! e5 *', currentPath: [0], analysisJson: '' },
    });
    const result = await runChessTool(ctx, 'chess.write_doc', {
      action: 'set_nags',
      path: [0],
      nags: [2],
    });
    expect(result.ok).toBe(true);
    const game = parsePgn(writes[0].pgn);
    expect(game.moves[0].nags).toEqual(expect.arrayContaining([1, 2]));
  });

  it('make_puzzle takes the first blunder from lastScan', async () => {
    const { ctx } = context({ lastScan: scholarScan() });
    const result = await runChessTool(ctx, 'chess.make_puzzle', {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = result.payload as {
      fen: string;
      solutionSan: string;
      playedUci: string;
    };
    expect(payload.playedUci).toBe('g8f6');
    expect(payload.solutionSan).toBe('Ne7');
    expect(payload.fen).toContain(' b ');
  });
});
