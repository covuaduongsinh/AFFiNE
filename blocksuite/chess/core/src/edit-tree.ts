import { toFen } from './fen.js';
import { childrenAt, nodeAt, positionAt, walk } from './move-tree.js';
import { applyMove } from './position.js';
import { moveToSan } from './san.js';
import type { Game, Move, MoveNode, MovePath } from './types.js';

/**
 * Editing operations on the move tree.
 *
 * These mutate the game in place. That is deliberate: PGN text is the source of
 * truth in the document, so the caller parses it, edits the throwaway tree, and
 * serializes the result straight back. Nothing survives long enough for shared
 * mutable state to matter.
 */

/** Smallest `n<k>` id not already used anywhere in the tree. */
function nextId(game: Game): string {
  const used = new Set<string>();
  for (const { node } of walk(game)) used.add(node.id);
  let index = used.size;
  while (used.has(`n${index}`)) index++;
  return `n${index}`;
}

export interface PlayMoveResult {
  path: MovePath;
  /** True when the move was appended; false when it already existed. */
  created: boolean;
}

/**
 * Play `move` from the position at `path`.
 *
 * If the move is already one of the continuations it is reused, so replaying a
 * line never duplicates it — which is what makes "step forward, try something,
 * step back" behave the way an annotator expects. Otherwise it is appended: as
 * the main line if there is none yet, as a new variation if there is.
 */
export function playMove(
  game: Game,
  path: MovePath,
  move: Move
): PlayMoveResult {
  const before = positionAt(game, path);
  const san = moveToSan(before, move);

  const siblings = childrenAt(game, path);
  const existing = siblings.findIndex(child => child.san === san);
  if (existing !== -1) {
    return { path: [...path, existing], created: false };
  }

  const after = applyMove(before, move);
  const node: MoveNode = {
    id: nextId(game),
    san,
    move,
    fenBefore: toFen(before),
    fenAfter: toFen(after),
    nags: [],
    children: [],
  };

  siblings.push(node);
  return { path: [...path, siblings.length - 1], created: true };
}

/**
 * Remove the move at `path` and everything after it.
 *
 * Returns the path that should now be shown — the parent position, since the
 * move that was being looked at no longer exists.
 */
export function deleteFrom(game: Game, path: MovePath): MovePath {
  if (path.length === 0) return path;

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const siblings = childrenAt(game, parentPath);
  if (!siblings[index]) return path;

  siblings.splice(index, 1);
  return parentPath;
}

/**
 * Make the variation at `path` the main line at its ply.
 *
 * Annotators reach for this constantly: you explore a sideline, decide it was
 * actually the game continuation, and want it to read as the main line.
 */
export function promoteVariation(game: Game, path: MovePath): MovePath {
  if (path.length === 0) return path;

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  if (index === 0) return path;

  const siblings = childrenAt(game, parentPath);
  const node = siblings[index];
  if (!node) return path;

  siblings.splice(index, 1);
  siblings.unshift(node);
  return [...parentPath, 0];
}

/** Replace the comment attached to the move at `path`. */
export function setComment(
  game: Game,
  path: MovePath,
  comment: string | undefined
): void {
  const node = nodeAt(game, path);
  if (!node) return;
  if (comment === undefined || comment.trim() === '') {
    delete node.comment;
  } else {
    // Braces would terminate the comment when the PGN is written back out.
    node.comment = comment.replaceAll(/[{}]/g, '');
  }
}

/** Replace the NAGs attached to the move at `path`. */
export function setNags(game: Game, path: MovePath, nags: number[]): void {
  const node = nodeAt(game, path);
  if (!node) return;
  node.nags = [...nags];
}
