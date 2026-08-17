import { parseFen } from './fen.js';
import { parsePgn } from './pgn.js';

/**
 * Recognising chess text that a user pasted.
 *
 * The bar here is deliberately high. A parser that says yes too often is worse
 * than one that says no: turning the sentence "I played e4" into a game block
 * is a far more annoying failure than making someone use the slash menu. So a
 * match needs structural evidence — a full FEN field set, or PGN with move
 * numbering or tag pairs — not merely text that happens to parse.
 */

export type ChessTextMatch =
  | { kind: 'fen'; fen: string }
  | { kind: 'pgn'; pgn: string }
  | null;

/** A FEN needs six space-separated fields and eight `/`-separated ranks. */
function looksLikeFen(text: string): boolean {
  const fields = text.split(/\s+/);
  if (fields.length < 4 || fields.length > 6) return false;
  return fields[0].split('/').length === 8;
}

/**
 * PGN needs either a tag pair or move numbering.
 *
 * Without this a bare `e4` parses as a perfectly valid one-move game, and every
 * mention of a square in prose would become a block.
 */
function looksLikePgn(text: string): boolean {
  return /\[\s*\w+\s*"/.test(text) || /(^|\s)1\s*\.\s*\S/.test(text);
}

/**
 * Classify pasted text as a position, a game, or neither.
 *
 * Returns `null` unless the text both looks structurally like chess notation
 * and actually parses.
 */
export function detectChessText(raw: string): ChessTextMatch {
  const text = raw.trim();
  if (text === '') return null;
  // Nothing sensible is this long, and parsing megabytes on every paste is rude.
  if (text.length > 100_000) return null;

  if (looksLikeFen(text)) {
    try {
      parseFen(text);
      return { kind: 'fen', fen: text };
    } catch {
      // Fall through: a near-miss FEN is not a game either.
      return null;
    }
  }

  if (looksLikePgn(text)) {
    try {
      const game = parsePgn(text);
      // A tag-pair-only header with no moves is not worth a block.
      if (game.moves.length === 0) return null;
      return { kind: 'pgn', pgn: text };
    } catch {
      return null;
    }
  }

  return null;
}
