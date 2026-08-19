import {
  type Color,
  type Game,
  nodeAt,
  parseFen,
  setComment,
  setNags,
  WHITE,
} from '@blocksuite/chess-core';

import { LABEL_NAG, whiteCp } from './classify.js';
import type { GameScan, Score } from './types.js';

const EVAL_TOKEN = /\[%eval\s+[^\]]*\]/i;

/** Judgment NAGs the scan is allowed to replace. User `!` / `!!` / `!?` stay. */
const JUDGMENT_NAGS = new Set<number>([2, 4, 6]);

/** White-centric `[%eval]` body: `0.32`, `-1.04`, `#3`, `#-2`. */
export function formatPgnEval(score: Score, turn: Color): string {
  if (score.type === 'mate') {
    const whiteMate = turn === WHITE ? score.value : -score.value;
    return `#${whiteMate}`;
  }
  return (whiteCp(score, turn) / 100).toFixed(2);
}

export function evalGlyph(score: Score, turn: Color): string {
  return `[%eval ${formatPgnEval(score, turn)}]`;
}

/**
 * Append or replace a `[%eval …]` token. Free text and other glyphs (`[%clk]`)
 * are left alone.
 */
export function mergeEvalComment(
  existing: string | undefined,
  glyph: string
): string {
  const body = existing?.trim() ?? '';
  if (!body) return glyph;
  if (EVAL_TOKEN.test(body)) return body.replace(EVAL_TOKEN, glyph);
  return `${body} ${glyph}`;
}

export function serializeGameScan(scan: GameScan): string {
  return JSON.stringify(scan);
}

export function parseGameScan(raw: string | undefined | null): GameScan | null {
  if (!raw?.trim()) return null;
  try {
    const value = JSON.parse(raw) as GameScan;
    if (
      !value ||
      typeof value !== 'object' ||
      typeof value.engineId !== 'string' ||
      !Array.isArray(value.nodes)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/**
 * Write scan evals and judgment NAGs onto the move tree.
 *
 * One call; the view serializes the result in a single undo step. Existing
 * praise NAGs (`!`, `!!`, `!?`) are kept. Judgment NAGs (`?!`, `?`, `??`)
 * are replaced so a second Apply does not stack `? ??`.
 */
export function applyScanToGame(game: Game, scan: GameScan): void {
  for (const item of scan.nodes) {
    const node = nodeAt(game, item.path);
    if (!node) continue;

    const turn = parseFen(node.fenAfter).turn;
    setComment(
      game,
      item.path,
      mergeEvalComment(node.comment, evalGlyph(item.scoreAfter, turn))
    );

    const kept = node.nags.filter(nag => !JUDGMENT_NAGS.has(nag));
    const next = LABEL_NAG[item.label];
    setNags(game, item.path, next === undefined ? kept : [...kept, next]);
  }
}
