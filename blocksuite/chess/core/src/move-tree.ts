import { parseFen } from './fen';
import type { Game, MoveNode, MovePath, Position } from './types';

/**
 * Navigation over the move tree.
 *
 * A {@link MovePath} is the list of child indices taken at each ply, so `[]` is
 * the starting position, `[0]` the first main-line move and `[0, 1]` the first
 * alternative to the reply. Paths are plain arrays so they can live in a CRDT
 * document without any custom serialization.
 */

/** The node a path points at, or undefined when the path leaves the tree. */
export function nodeAt(game: Game, path: MovePath): MoveNode | undefined {
  let children = game.moves;
  let node: MoveNode | undefined;

  for (const index of path) {
    node = children[index];
    if (!node) return undefined;
    children = node.children;
  }

  return node;
}

/** The position a path points at. `[]` yields the game's starting position. */
export function positionAt(game: Game, path: MovePath): Position {
  if (path.length === 0) return game.setup;
  const node = nodeAt(game, path);
  if (!node) return game.setup;
  return parseFen(node.fenAfter);
}

/** The path one ply forward along a given branch, or undefined at the end. */
export function forward(
  game: Game,
  path: MovePath,
  branch = 0
): MovePath | undefined {
  const children = childrenAt(game, path);
  return children[branch] ? [...path, branch] : undefined;
}

/** The path one ply back, or undefined when already at the start. */
export function back(path: MovePath): MovePath | undefined {
  return path.length === 0 ? undefined : path.slice(0, -1);
}

/** Sibling branches available at a path — the alternatives to the move played. */
export function childrenAt(game: Game, path: MovePath): MoveNode[] {
  if (path.length === 0) return game.moves;
  const node = nodeAt(game, path);
  return node ? node.children : [];
}

/**
 * Switch to another variation at the current ply, keeping everything before it.
 * Returns undefined when that branch does not exist.
 */
export function switchBranch(
  game: Game,
  path: MovePath,
  branch: number
): MovePath | undefined {
  if (path.length === 0) return undefined;
  const parent = path.slice(0, -1);
  const siblings = childrenAt(game, parent);
  return siblings[branch] ? [...parent, branch] : undefined;
}

/** The main line as a flat list of nodes. */
export function mainLine(game: Game): MoveNode[] {
  const line: MoveNode[] = [];
  let children = game.moves;
  while (children.length > 0) {
    const node = children[0];
    line.push(node);
    children = node.children;
  }
  return line;
}

/** The path to the last move of the main line. */
export function mainLinePath(game: Game): MovePath {
  const path: MovePath = [];
  let children = game.moves;
  while (children.length > 0) {
    path.push(0);
    children = children[0].children;
  }
  return path;
}

/** Every node in the tree, depth first, main line before alternatives. */
export function* walk(
  game: Game
): Generator<{ node: MoveNode; path: MovePath }> {
  function* visit(
    children: MoveNode[],
    prefix: MovePath
  ): Generator<{ node: MoveNode; path: MovePath }> {
    for (let i = 0; i < children.length; i++) {
      const path = [...prefix, i];
      yield { node: children[i], path };
      yield* visit(children[i].children, path);
    }
  }
  yield* visit(game.moves, []);
}

/** Total number of moves stored in the tree, variations included. */
export function countMoves(game: Game): number {
  let total = 0;
  for (const _ of walk(game)) total++;
  return total;
}

/** Find the first node whose position after the move matches a FEN. */
export function findByFen(
  game: Game,
  fen: string
): { node: MoveNode; path: MovePath } | undefined {
  // Compare only the parts that define a position, ignoring the move clocks.
  const key = fen.split(' ').slice(0, 4).join(' ');
  for (const entry of walk(game)) {
    if (entry.node.fenAfter.split(' ').slice(0, 4).join(' ') === key) {
      return entry;
    }
  }
  return undefined;
}
