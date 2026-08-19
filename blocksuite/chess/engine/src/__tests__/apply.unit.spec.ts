import { BLACK, parsePgn, serializePgn, WHITE } from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import {
  applyScanToGame,
  evalGlyph,
  formatPgnEval,
  mergeEvalComment,
  parseGameScan,
  serializeGameScan,
} from '../apply';
import type { GameScan, ScannedMove } from '../types';

function move(
  path: number[],
  extra: Partial<ScannedMove> & Pick<ScannedMove, 'label' | 'scoreAfter'>
): ScannedMove {
  return {
    path,
    playedUci: 'e2e4',
    bestUci: 'e2e4',
    bestPvSan: ['e4'],
    scoreBefore: { type: 'cp', value: 20 },
    cpl: 0,
    ...extra,
  };
}

function scan(nodes: ScannedMove[]): GameScan {
  return {
    engineId: 'mock',
    engineVersion: 'test-1',
    depth: 12,
    createdAt: 1,
    whiteAcpl: 8,
    blackAcpl: 40,
    nodes,
  };
}

describe('formatPgnEval / mergeEvalComment', () => {
  it('writes White-centric pawns and mate marks', () => {
    expect(formatPgnEval({ type: 'cp', value: 32 }, WHITE)).toBe('0.32');
    expect(formatPgnEval({ type: 'cp', value: 80 }, BLACK)).toBe('-0.80');
    expect(formatPgnEval({ type: 'cp', value: 0 }, WHITE)).toBe('0.00');
    expect(formatPgnEval({ type: 'mate', value: 3 }, WHITE)).toBe('#3');
    expect(formatPgnEval({ type: 'mate', value: 3 }, BLACK)).toBe('#-3');
    expect(evalGlyph({ type: 'cp', value: 32 }, WHITE)).toBe('[%eval 0.32]');
  });

  it('appends an eval token and replaces a previous one', () => {
    expect(mergeEvalComment(undefined, '[%eval 0.32]')).toBe('[%eval 0.32]');
    expect(mergeEvalComment('The opening.', '[%eval 0.32]')).toBe(
      'The opening. [%eval 0.32]'
    );
    expect(
      mergeEvalComment('note [%eval 1.00] more [%clk 0:01:00]', '[%eval 0.32]')
    ).toBe('note [%eval 0.32] more [%clk 0:01:00]');
  });
});

describe('parseGameScan / serializeGameScan', () => {
  it('round-trips a report and rejects junk', () => {
    const report = scan([
      move([0], { label: 'best', scoreAfter: { type: 'cp', value: -20 } }),
    ]);
    expect(parseGameScan(serializeGameScan(report))).toEqual(report);
    expect(parseGameScan('')).toBeNull();
    expect(parseGameScan('{')).toBeNull();
    expect(parseGameScan('{"engineId":1,"nodes":[]}')).toBeNull();
  });
});

describe('applyScanToGame', () => {
  it('merges [%eval] into comments and judgment NAGs without dropping !', () => {
    const game = parsePgn('1. e4! {The opening.} e5 *');
    applyScanToGame(
      game,
      scan([
        move([0], {
          label: 'best',
          scoreAfter: { type: 'cp', value: -32 },
        }),
        move([0, 0], {
          playedUci: 'e7e5',
          label: 'blunder',
          scoreAfter: { type: 'cp', value: 400 },
          cpl: 200,
        }),
      ])
    );

    expect(game.moves[0].comment).toBe('The opening. [%eval 0.32]');
    expect(game.moves[0].nags).toEqual([1]);
    expect(game.moves[0].children[0].comment).toBe('[%eval 4.00]');
    expect(game.moves[0].children[0].nags).toEqual([4]);
  });

  it('replaces a previous judgment NAG instead of stacking ? and ??', () => {
    const game = parsePgn('1. e4? e5 *');
    applyScanToGame(
      game,
      scan([
        move([0], {
          label: 'blunder',
          scoreAfter: { type: 'cp', value: -10 },
        }),
      ])
    );
    expect(game.moves[0].nags).toEqual([4]);
  });

  it('round-trips the [%eval] comment through serializePgn / parsePgn', () => {
    const game = parsePgn('1. e4 e5 *');
    applyScanToGame(
      game,
      scan([
        move([0], {
          label: 'inaccuracy',
          scoreAfter: { type: 'mate', value: -3 },
        }),
      ])
    );
    const again = parsePgn(serializePgn(game));
    expect(again.moves[0].comment).toBe('[%eval #3]');
    expect(again.moves[0].nags).toContain(6);
  });
});
