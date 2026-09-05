/**
 * React wrapper around the piece art.
 *
 * The paths themselves live in `@blocksuite/chess-core` so the on-screen board
 * and the PDF exporter draw the same glyphs; only the theming is React's job.
 */

import {
  type ChessPieceSet,
  PIECE_SETS,
  type PieceLetter,
} from '@blocksuite/chess-core';

export type { ChessPieceSet, PieceLetter };

export interface ChessPieceProps {
  piece: PieceLetter;
  pieceSet?: ChessPieceSet;
  className?: string;
}

/**
 * A single piece glyph.
 *
 * White pieces are a light fill with a dark outline and black pieces the
 * reverse, so both stay legible on either square colour without needing a
 * separate palette per board theme.
 */
export const ChessPiece = ({
  piece,
  pieceSet = 'staunton',
  className,
}: ChessPieceProps) => {
  const activeSet = PIECE_SETS[pieceSet] ?? PIECE_SETS.staunton;
  const shapes = activeSet[piece.toLowerCase()];
  if (!shapes) return null;

  const isWhite = piece === piece.toUpperCase();
  const fill = isWhite ? 'var(--chess-piece-light)' : 'var(--chess-piece-dark)';
  const stroke = isWhite
    ? 'var(--chess-piece-dark)'
    : 'var(--chess-piece-light)';

  return (
    <svg
      viewBox="0 0 45 45"
      width="100%"
      height="100%"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill={fill}
        stroke={stroke}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {shapes.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </g>
    </svg>
  );
};
