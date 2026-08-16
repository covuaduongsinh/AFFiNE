import { describe, expect, it } from 'vitest';

import { parseFen, START_FEN, startPosition, toFen } from '../fen';
import {
  childrenAt,
  countMoves,
  forward,
  mainLine,
  nodeAt,
  positionAt,
} from '../move-tree';
import { parsePgn, parsePgnGames, PgnError, serializePgn } from '../pgn';
import { isCheckmate, isStalemate, legalMoves } from '../position';
import { moveToSan, sanToMove } from '../san';
import type { Game, MoveNode } from '../types';

/** A game exercising nested variations, comments, NAGs and a promotion. */
const ANNOTATED_GAME = `[Event "Nested variation torture test"]
[Site "Ha Noi"]
[Date "2026.08.16"]
[Round "1"]
[White "Nguyen Van A"]
[Black "Tran Thi B"]
[Result "1-0"]
[ECO "C50"]

1. e4 {King's pawn, the most common first move.} e5 (1... c5 {The Sicilian.}
2. Nf3 d6 (2... Nc6 3. d4) 3. d4) 2. Nf3! Nc6 (2... Nf6 3. Nxe5 $6 d6) 3. Bc4 $1
Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Nxc3 9. bxc3 Bxc3
10. Qb3 Bxa1 11. Bxf7+ Kf8 12. Bg5 Ne7 13. Ne5 Bxd4 14. Bg6 d5 15. Qf3+ Bf5
16. Bxf5 Bxe5 17. Be6+ Bf6 18. Bxf6 Ke8 19. Bxg7 1-0
`;

function assertRoundTrip(pgn: string): Game {
  const first = parsePgn(pgn);
  const rendered = serializePgn(first);
  const second = parsePgn(rendered);

  expect(strip(second.moves)).toEqual(strip(first.moves));
  expect(second.result).toBe(first.result);
  return first;
}

/** Node ids are allocation order, not content; drop them before comparing. */
function strip(nodes: MoveNode[]): unknown[] {
  return nodes.map(node => ({
    san: node.san,
    fenBefore: node.fenBefore,
    fenAfter: node.fenAfter,
    nags: node.nags,
    commentBefore: node.commentBefore,
    comment: node.comment,
    children: strip(node.children),
  }));
}

describe('PGN parsing', () => {
  it('reads the seven tag roster and extra tags', () => {
    const game = parsePgn(ANNOTATED_GAME);
    expect(game.headers.White).toBe('Nguyen Van A');
    expect(game.headers.Black).toBe('Tran Thi B');
    expect(game.headers.ECO).toBe('C50');
    expect(game.result).toBe('1-0');
  });

  it('attaches comments to the move they follow', () => {
    const game = parsePgn(ANNOTATED_GAME);
    expect(game.moves[0].san).toBe('e4');
    expect(game.moves[0].comment).toBe(
      "King's pawn, the most common first move."
    );
  });

  it('turns suffix annotations into NAGs', () => {
    const game = parsePgn(ANNOTATED_GAME);
    // 2. Nf3! is the second main-line move.
    const line = mainLine(game);
    const nf3 = line[2];
    expect(nf3.san).toBe('Nf3');
    expect(nf3.nags).toEqual([1]);
  });

  it('reads explicit $N glyphs', () => {
    const game = parsePgn(ANNOTATED_GAME);
    // 2... Nf6 3. Nxe5 $6 lives in the first variation off 2... Nc6.
    const variation = childrenAt(game, [0, 0, 0]);
    expect(variation).toHaveLength(2);
    expect(variation[1].san).toBe('Nf6');
    const nxe5 = variation[1].children[0];
    expect(nxe5.san).toBe('Nxe5');
    expect(nxe5.nags).toEqual([6]);
  });

  it('stores a variation as a sibling of the move it replaces', () => {
    const game = parsePgn(ANNOTATED_GAME);
    // After 1. e4 the replies are 1... e5 (main) and 1... c5 (variation).
    const replies = childrenAt(game, [0]);
    expect(replies.map(node => node.san)).toEqual(['e5', 'c5']);
    expect(replies[1].comment).toBe('The Sicilian.');
  });

  it('nests variations inside variations', () => {
    const game = parsePgn(ANNOTATED_GAME);
    // 1... c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4
    const sicilian = childrenAt(game, [0])[1];
    const nf3 = sicilian.children[0];
    expect(nf3.san).toBe('Nf3');
    expect(nf3.children.map(node => node.san)).toEqual(['d6', 'Nc6']);
    expect(nf3.children[1].children[0].san).toBe('d4');
  });

  it('round-trips through serialization without losing anything', () => {
    const game = assertRoundTrip(ANNOTATED_GAME);
    expect(countMoves(game)).toBeGreaterThan(40);
  });

  it('keeps every FEN consistent with replaying the moves', () => {
    const game = parsePgn(ANNOTATED_GAME);
    let path: number[] = [];
    let position = startPosition();

    for (const node of mainLine(game)) {
      expect(node.fenBefore).toBe(toFen(position));
      const move = sanToMove(position, node.san);
      expect(moveToSan(position, move)).toBe(node.san);
      position = parseFen(node.fenAfter);
      const next = forward(game, path);
      expect(next).toBeDefined();
      path = next as number[];
      expect(toFen(positionAt(game, path))).toBe(node.fenAfter);
    }
  });
});

describe('PGN edge cases', () => {
  it('accepts a game with no moves', () => {
    const game = parsePgn('[Event "Empty"]\n[Result "*"]\n\n*\n');
    expect(game.moves).toEqual([]);
    expect(game.result).toBe('*');
  });

  it('starts from a FEN tag when present', () => {
    // Back-rank mate: the white king on h1 is boxed in by its own f2/g2/h2 pawns.
    const pgn = `[Event "Endgame study"]
[SetUp "1"]
[FEN "r6k/8/8/8/8/8/5PPP/7K b - - 0 1"]
[Result "0-1"]

1... Ra1# 0-1
`;
    const game = parsePgn(pgn);
    expect(game.moves[0].san).toBe('Ra1#');
    expect(isCheckmate(parseFen(game.moves[0].fenAfter))).toBe(true);
    // The FEN tag must survive a round-trip or the study loses its position.
    expect(serializePgn(game)).toContain('r6k/8/8/8/8/8/5PPP/7K b - - 0 1');
  });

  it('reads rest-of-line comments', () => {
    const game = parsePgn('[Event "x"]\n\n1. e4 ; a trailing note\ne5 *\n');
    expect(game.moves[0].comment).toBe('a trailing note');
    expect(game.moves[0].children[0].san).toBe('e5');
  });

  it('accepts 0-0 as a spelling of O-O', () => {
    // Both sides must clear f- and g-files first, hence Nf6 rather than Nc6.
    const game = parsePgn(
      '[Event "x"]\n\n1. e4 e5 2. Nf3 Nf6 3. Bc4 Bc5 4. 0-0 0-0 *\n'
    );
    const sans = mainLine(game).map(n => n.san);
    expect(sans.filter(san => san === 'O-O')).toHaveLength(2);
  });

  it('splits a file containing several games', () => {
    const file = `${ANNOTATED_GAME}\n${ANNOTATED_GAME}`;
    expect(parsePgnGames(file)).toHaveLength(2);
  });

  it('rejects an illegal move instead of guessing', () => {
    expect(() => parsePgn('[Event "x"]\n\n1. e5 *\n')).toThrow();
  });

  it('rejects unbalanced variation parentheses', () => {
    expect(() => parsePgn('[Event "x"]\n\n1. e4 (1. d4 *\n')).toThrow(PgnError);
  });
});

describe('rules integration', () => {
  it('detects stalemate', () => {
    const position = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(legalMoves(position)).toHaveLength(0);
    expect(isStalemate(position)).toBe(true);
    expect(isCheckmate(position)).toBe(false);
  });

  it('detects the fastest checkmate', () => {
    const pgn = '[Event "Fool\'s mate"]\n\n1. f3 e5 2. g4 Qh4# 0-1\n';
    const game = parsePgn(pgn);
    const last = mainLine(game).at(-1) as MoveNode;
    expect(last.san).toBe('Qh4#');
    expect(isCheckmate(parseFen(last.fenAfter))).toBe(true);
  });

  it('navigates to a node by path', () => {
    const game = parsePgn(ANNOTATED_GAME);
    expect(nodeAt(game, [0, 1])?.san).toBe('c5');
    expect(nodeAt(game, [99])).toBeUndefined();
  });

  it('starts from the standard position by default', () => {
    expect(toFen(startPosition())).toBe(START_FEN);
  });
});
