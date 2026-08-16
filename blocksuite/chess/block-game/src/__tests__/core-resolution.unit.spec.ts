import {
  deleteFrom,
  parsePgn,
  playMove,
  positionAt,
  promoteVariation,
  sanToMove,
  serializePgn,
  setComment,
  setNags,
} from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

/**
 * Guards the package boundary rather than the logic.
 *
 * These helpers are consumed through the package name from another workspace
 * package, and a missing re-export in `chess-core`'s barrel only shows up at
 * bundle time — long after `tsc` is happy, because `tsc` follows project
 * references while the bundler follows the `exports` map. Importing them here
 * the way the app does turns that class of mistake into a test failure.
 */
describe('chess-core public surface', () => {
  it('exports every tree-editing helper the blocks rely on', () => {
    const helpers = {
      playMove,
      deleteFrom,
      promoteVariation,
      setComment,
      setNags,
    };
    for (const [name, fn] of Object.entries(helpers)) {
      expect(typeof fn, `${name} should be exported`).toBe('function');
    }
  });

  it('plays a move through the package entry point', () => {
    const game = parsePgn('[Event "x"]\n\n1. e4 *\n');
    const move = sanToMove(positionAt(game, [0]), 'e5');

    const { path, created } = playMove(game, [0], move);

    expect(created).toBe(true);
    expect(path).toEqual([0, 0]);
    expect(serializePgn(game)).toContain('e5');
    expect(() => parsePgn(serializePgn(game))).not.toThrow();
  });
});
