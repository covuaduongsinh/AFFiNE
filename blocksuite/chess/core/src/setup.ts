/**
 * Lenient placement helpers for the board setup editor.
 *
 * `parseFen` deliberately rejects half-built positions — a board mid-setup may
 * have no kings yet — so the editor works on the placement field alone through
 * these and runs the full parser only when the position is saved.
 */

const FILES = 'abcdefgh';

/**
 * Algebraic square → FEN piece letter, reading only the placement field.
 *
 * Mirrors the reader the board component uses to draw: overflow past the
 * h-file and ranks beyond the eighth are clipped, unknown characters are kept
 * as-is, and nothing throws.
 */
export function readPlacement(fen: string): Map<string, string> {
  const pieces = new Map<string, string>();
  const placement = fen.trim().split(/\s+/)[0] ?? '';
  const ranks = placement.split('/');
  for (let i = 0; i < ranks.length && i < 8; i++) {
    const rank = 7 - i; // FEN lists rank 8 first.
    let file = 0;
    for (const ch of ranks[i]) {
      if (ch >= '1' && ch <= '8') {
        file += ch.charCodeAt(0) - 48;
        continue;
      }
      if (file > 7) break;
      pieces.set(`${FILES[file]}${rank + 1}`, ch);
      file++;
    }
  }
  return pieces;
}

export interface FenParts {
  /** Algebraic square → FEN piece letter. */
  placement: Map<string, string>;
  turn: 'w' | 'b';
  /** e.g. "KQkq"; empty means no rights and serializes as "-". */
  castling: string;
  epSquare?: string;
  halfmoves?: number;
  fullmoves?: number;
}

/** Builds a six-field FEN from parts; performs no validation. */
export function writeFen(parts: FenParts): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = parts.placement.get(`${FILES[file]}${rank + 1}`);
      if (piece === undefined) {
        empty++;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += piece;
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  const castling = parts.castling === '' ? '-' : parts.castling;
  const ep = parts.epSquare ?? '-';
  const halfmoves = parts.halfmoves ?? 0;
  const fullmoves = parts.fullmoves ?? 1;
  return `${rows.join('/')} ${parts.turn} ${castling} ${ep} ${halfmoves} ${fullmoves}`;
}
