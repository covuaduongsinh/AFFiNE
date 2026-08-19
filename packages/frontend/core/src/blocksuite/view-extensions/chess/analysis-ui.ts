import type { ChessArrow } from '@affine/component/ui/chess';
import { type Color, type MovePath, WHITE } from '@blocksuite/chess-core';
import {
  type MoveLabel,
  type Score,
  scoreToCp,
  winningChances,
} from '@blocksuite/chess-engine';

/** White's expected share of the eval bar, in `[0, 1]`. */
export function whiteBarShare(score: Score, turn: Color): number {
  const white = turn === WHITE ? scoreToCp(score) : -scoreToCp(score);
  return (winningChances(white) + 1) / 2;
}

/** White-centric pawn units, or a mate mark (`#3`, `#-2`). */
export function formatScore(score: Score, turn: Color): string {
  if (score.type === 'mate') {
    const whiteMate = turn === WHITE ? score.value : -score.value;
    return `#${whiteMate}`;
  }
  const pawns = (turn === WHITE ? score.value : -score.value) / 100;
  const body = Math.abs(pawns).toFixed(2);
  if (pawns > 0) return `+${body}`;
  if (pawns < 0) return `-${body}`;
  return '0.00';
}

export function uciToArrow(uci: string): ChessArrow | null {
  const match = /^([a-h][1-8])([a-h][1-8])/.exec(uci);
  if (!match) return null;
  return {
    from: match[1],
    to: match[2],
    color: 'var(--affine-primary-color, #1e88e5)',
  };
}

export function pathKey(path: MovePath): string {
  return path.join(',');
}

const EVAL_IN_COMMENT = /\[%eval\s+([^\]]+)\]/gi;

/** Split a PGN comment so `[%eval 0.32]` can render as a compact glyph. */
export function splitMoveComment(
  comment: string
): Array<{ kind: 'text' | 'eval'; value: string }> {
  const parts: Array<{ kind: 'text' | 'eval'; value: string }> = [];
  let last = 0;
  const re = new RegExp(EVAL_IN_COMMENT.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(comment))) {
    if (match.index > last) {
      parts.push({ kind: 'text', value: comment.slice(last, match.index) });
    }
    parts.push({ kind: 'eval', value: match[1].trim() });
    last = match.index + match[0].length;
  }
  if (last < comment.length) {
    parts.push({ kind: 'text', value: comment.slice(last) });
  }
  return parts;
}

export function labelForPath(
  labels: ReadonlyMap<string, MoveLabel>,
  path: MovePath
): MoveLabel | undefined {
  return labels.get(pathKey(path));
}
