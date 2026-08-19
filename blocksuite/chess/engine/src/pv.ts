import {
  applyMove,
  moveToSan,
  parseFen,
  uciToMove,
} from '@blocksuite/chess-core';

/**
 * Render a UCI principal variation as SAN from `fen`.
 *
 * Stops at the first token that is not legal — engines emit junk at low depth
 * and the UI should still show the prefix that made sense.
 */
export function pvUciToSan(fen: string, pv: string[]): string[] {
  let position = parseFen(fen);
  const sans: string[] = [];

  for (const uci of pv) {
    try {
      const move = uciToMove(position, uci);
      sans.push(moveToSan(position, move));
      position = applyMove(position, move);
    } catch {
      break;
    }
  }

  return sans;
}
