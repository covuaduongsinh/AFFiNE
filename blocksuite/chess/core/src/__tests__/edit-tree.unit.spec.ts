import { describe, expect, it } from 'vitest';

import {
  deleteFrom,
  playMove,
  promoteVariation,
  setComment,
  setNags,
} from '../edit-tree';
import { childrenAt, mainLine, nodeAt, positionAt } from '../move-tree';
import { parsePgn, serializePgn } from '../pgn';
import { legalMoves } from '../position';
import { moveToSan, sanToMove } from '../san';
import type { Game } from '../types';

const GAME = `[Event "Editing"]
[Result "*"]

1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *
`;

/** Resolve a SAN against the position a path points at. */
function moveAt(game: Game, path: number[], san: string) {
  return sanToMove(positionAt(game, path), san);
}

describe('playMove', () => {
  it('appends a first continuation as the main line', () => {
    const game = parsePgn('[Event "x"]\n\n*\n');
    const result = playMove(game, [], moveAt(game, [], 'd4'));

    expect(result).toEqual({ path: [0], created: true });
    expect(mainLine(game).map(n => n.san)).toEqual(['d4']);
  });

  it('reuses a continuation that already exists instead of duplicating it', () => {
    const game = parsePgn(GAME);
    const result = playMove(game, [], moveAt(game, [], 'e4'));

    expect(result).toEqual({ path: [0], created: false });
    expect(game.moves).toHaveLength(1);
  });

  it('appends a genuinely new continuation as a variation', () => {
    const game = parsePgn(GAME);
    const before = childrenAt(game, [0]).length;
    const result = playMove(game, [0], moveAt(game, [0], 'e6'));

    expect(result.created).toBe(true);
    expect(childrenAt(game, [0])).toHaveLength(before + 1);
    expect(nodeAt(game, result.path)?.san).toBe('e6');
  });

  it('records the FEN either side of the new move', () => {
    const game = parsePgn('[Event "x"]\n\n*\n');
    const { path } = playMove(game, [], moveAt(game, [], 'e4'));
    const node = nodeAt(game, path);

    expect(node?.fenBefore).toContain('w KQkq - 0 1');
    expect(node?.fenAfter).toContain('b KQkq e3');
  });

  it('produces a game that serializes and parses back unchanged', () => {
    const game = parsePgn(GAME);
    playMove(game, [0], moveAt(game, [0], 'e6'));

    const reparsed = parsePgn(serializePgn(game));
    expect(childrenAt(reparsed, [0]).map(n => n.san)).toEqual([
      'e5',
      'c5',
      'e6',
    ]);
  });

  it('accepts every legal move from a position', () => {
    const game = parsePgn('[Event "x"]\n\n*\n');
    const position = positionAt(game, []);
    for (const move of legalMoves(position)) {
      const { path } = playMove(game, [], move);
      expect(nodeAt(game, path)?.san).toBe(moveToSan(position, move));
    }
    expect(game.moves).toHaveLength(20);
  });
});

describe('deleteFrom', () => {
  it('removes the move and everything after it', () => {
    const game = parsePgn(GAME);
    const path = deleteFrom(game, [0, 0]);

    expect(path).toEqual([0]);
    expect(childrenAt(game, [0]).map(n => n.san)).toEqual(['c5']);
  });

  it('refuses to delete the starting position', () => {
    const game = parsePgn(GAME);
    expect(deleteFrom(game, [])).toEqual([]);
    expect(game.moves).toHaveLength(1);
  });
});

describe('promoteVariation', () => {
  it('makes a sideline the main line', () => {
    const game = parsePgn(GAME);
    expect(childrenAt(game, [0]).map(n => n.san)).toEqual(['e5', 'c5']);

    const path = promoteVariation(game, [0, 1]);

    expect(path).toEqual([0, 0]);
    expect(childrenAt(game, [0]).map(n => n.san)).toEqual(['c5', 'e5']);
    // The main line runs from the root, so 1. e4 still leads it.
    expect(mainLine(game).map(n => n.san)).toEqual(['e4', 'c5', 'Nf3']);
  });

  it('does nothing when the move is already the main line', () => {
    const game = parsePgn(GAME);
    expect(promoteVariation(game, [0, 0])).toEqual([0, 0]);
    expect(childrenAt(game, [0]).map(n => n.san)).toEqual(['e5', 'c5']);
  });
});

describe('annotations', () => {
  it('sets and clears a comment', () => {
    const game = parsePgn(GAME);
    setComment(game, [0], 'The most popular first move.');
    expect(nodeAt(game, [0])?.comment).toBe('The most popular first move.');
    expect(serializePgn(game)).toContain('{The most popular first move.}');

    setComment(game, [0], '   ');
    expect(nodeAt(game, [0])?.comment).toBeUndefined();
  });

  it('strips braces that would break the PGN', () => {
    const game = parsePgn(GAME);
    setComment(game, [0], 'brace { here } and there');
    expect(nodeAt(game, [0])?.comment).toBe('brace  here  and there');
    // Round-trip must survive: an unbalanced brace would truncate the game.
    expect(() => parsePgn(serializePgn(game))).not.toThrow();
  });

  it('sets NAGs and writes them back as $N', () => {
    const game = parsePgn(GAME);
    setNags(game, [0], [1, 14]);
    expect(serializePgn(game)).toContain('$1');
    expect(serializePgn(game)).toContain('$14');
    expect(parsePgn(serializePgn(game)).moves[0].nags).toEqual([1, 14]);
  });
});
