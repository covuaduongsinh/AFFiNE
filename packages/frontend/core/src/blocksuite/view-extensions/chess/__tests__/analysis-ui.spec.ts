import { BLACK, WHITE } from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import {
  formatScore,
  labelForPath,
  pathKey,
  splitMoveComment,
  uciToArrow,
  whiteBarShare,
} from '../analysis-ui';

describe('whiteBarShare / formatScore', () => {
  it('puts equality in the middle and writes 0.00', () => {
    expect(whiteBarShare({ type: 'cp', value: 0 }, WHITE)).toBeCloseTo(0.5);
    expect(formatScore({ type: 'cp', value: 0 }, WHITE)).toBe('0.00');
  });

  it('flips a black-to-move score into White’s frame', () => {
    expect(formatScore({ type: 'cp', value: 80 }, WHITE)).toBe('+0.80');
    expect(formatScore({ type: 'cp', value: 80 }, BLACK)).toBe('-0.80');
    expect(formatScore({ type: 'mate', value: 3 }, WHITE)).toBe('#3');
    expect(formatScore({ type: 'mate', value: 3 }, BLACK)).toBe('#-3');
    expect(whiteBarShare({ type: 'cp', value: 200 }, WHITE)).toBeGreaterThan(
      0.5
    );
    expect(whiteBarShare({ type: 'cp', value: 200 }, BLACK)).toBeLessThan(0.5);
  });
});

describe('uciToArrow / pathKey', () => {
  it('reads the first ply of a UCI token', () => {
    expect(uciToArrow('e2e4')).toEqual({
      from: 'e2',
      to: 'e4',
      color: 'var(--affine-primary-color, #1e88e5)',
    });
    expect(uciToArrow('e7e8q')?.from).toBe('e7');
    expect(uciToArrow('e4')).toBeNull();
  });

  it('joins a move path for the scan map', () => {
    expect(pathKey([0, 0, 1])).toBe('0,0,1');
    expect(pathKey([])).toBe('');
  });

  it('splits [%eval] out of a free-text comment', () => {
    expect(splitMoveComment('The opening. [%eval 0.32] more')).toEqual([
      { kind: 'text', value: 'The opening. ' },
      { kind: 'eval', value: '0.32' },
      { kind: 'text', value: ' more' },
    ]);
    expect(splitMoveComment('[%eval #3]')).toEqual([
      { kind: 'eval', value: '#3' },
    ]);
  });

  it('looks up a scan label by path', () => {
    const labels = new Map([['0,0', 'blunder' as const]]);
    expect(labelForPath(labels, [0, 0])).toBe('blunder');
    expect(labelForPath(labels, [0])).toBeUndefined();
  });
});
