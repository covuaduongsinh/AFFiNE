/**
 * Standalone board renderer: FEN → SVG string.
 *
 * Exists for consumers that cannot mount the React board — the PDF exporter
 * above all. It draws with the same geometry and the same piece art as the
 * on-screen board so a printed diagram matches what the author saw, and it
 * emits SVG 1.1 only (no `<marker>`, no `context-stroke`) because the renderer
 * inside pdfmake predates SVG 2.
 */

import { PIECE_SHAPES, PIECE_VIEWBOX_SIZE } from './piece-shapes.js';
import { readPlacement } from './setup.js';

const FILES = 'abcdefgh';

export interface BoardSvgPalette {
  squareLight: string;
  squareDark: string;
  pieceLight: string;
  pieceDark: string;
  arrow: string;
}

/** Light-theme palette of the on-screen board; PDF always prints on white. */
export const BOARD_SVG_PALETTE: BoardSvgPalette = {
  squareLight: '#f2e6d0',
  squareDark: '#b58863',
  pieceLight: '#ffffff',
  pieceDark: '#2b2724',
  arrow: 'rgba(21,128,61,0.72)',
};

export interface BoardSvgArrow {
  from: string;
  to: string;
  color?: string;
}

export interface BoardSvgHighlight {
  square: string;
  color: string;
}

export interface BoardSvgOptions {
  orientation?: 'white' | 'black';
  /** Emitted as width/height; the viewBox is always `0 0 8 8`. Default 320. */
  size?: number;
  /** File/rank labels. Default true. */
  coordinates?: boolean;
  arrows?: readonly BoardSvgArrow[];
  highlights?: readonly BoardSvgHighlight[];
  palette?: BoardSvgPalette;
}

/** Trims float noise so coordinates never serialize as `0.30000000000000004`. */
function n(value: number): number {
  return Number(value.toFixed(3));
}

/**
 * Colours reach this module from user text (Obsidian fences), and the core has
 * no sanitizer, so only literal hex and rgb()/rgba() forms are let through.
 */
function safeColor(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  if (/^rgba?\([\d.,\s%]+\)$/.test(trimmed)) return trimmed;
  return null;
}

/** Top-left corner of a square in board space, where the board is 8x8 units. */
function cornerOf(
  square: string,
  orientation: 'white' | 'black'
): { x: number; y: number } | null {
  const file = FILES.indexOf(square[0] ?? '');
  const rank = Number.parseInt(square.slice(1), 10) - 1;
  if (file < 0 || Number.isNaN(rank) || rank < 0 || rank > 7) return null;
  return orientation === 'white'
    ? { x: file, y: 7 - rank }
    : { x: 7 - file, y: rank };
}

/**
 * Renders a position as a self-contained SVG document.
 *
 * Never throws: an unparseable FEN yields an empty board, and squares outside
 * the board are dropped.
 */
export function fenToSvg(fen: string, options: BoardSvgOptions = {}): string {
  const orientation = options.orientation === 'black' ? 'black' : 'white';
  const size = options.size ?? 320;
  const coordinates = options.coordinates !== false;
  const palette = options.palette ?? BOARD_SVG_PALETTE;
  const parts: string[] = [];

  const labels: string[] = [];
  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      const x = orientation === 'white' ? file : 7 - file;
      const y = orientation === 'white' ? 7 - rank : rank;
      const isLight = (file + rank) % 2 === 1;
      const fill = isLight ? palette.squareLight : palette.squareDark;
      parts.push(
        `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`
      );
      if (!coordinates) continue;
      // Labels ride the outer edge of the drawn board, so they follow canvas
      // position rather than file/rank and flip with the orientation for free.
      const ink = isLight ? palette.squareDark : palette.squareLight;
      if (y === 7) {
        labels.push(
          `<text x="${n(x + 0.94)}" y="${n(y + 0.94)}" font-family="Helvetica" font-size="0.28" text-anchor="end" fill="${ink}">${FILES[file]}</text>`
        );
      }
      if (x === 0) {
        labels.push(
          `<text x="${n(x + 0.06)}" y="${n(y + 0.3)}" font-family="Helvetica" font-size="0.28" text-anchor="start" fill="${ink}">${rank + 1}</text>`
        );
      }
    }
  }

  for (const highlight of options.highlights ?? []) {
    const corner = cornerOf(highlight.square, orientation);
    const color = safeColor(highlight.color);
    if (!corner || color === null) continue;
    parts.push(
      `<rect x="${corner.x}" y="${corner.y}" width="1" height="1" fill="${color}"/>`
    );
  }

  const scale = n(1 / PIECE_VIEWBOX_SIZE);
  for (const [square, letter] of readPlacement(fen)) {
    const shapes = PIECE_SHAPES[letter.toLowerCase()];
    const corner = cornerOf(square, orientation);
    if (!shapes || !corner) continue;
    const isWhite = letter === letter.toUpperCase();
    const fill = isWhite ? palette.pieceLight : palette.pieceDark;
    const stroke = isWhite ? palette.pieceDark : palette.pieceLight;
    parts.push(
      `<g transform="translate(${corner.x} ${corner.y}) scale(${scale})" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">` +
        shapes.map(d => `<path d="${d}"/>`).join('') +
        `</g>`
    );
  }

  const HEAD = 0.34;
  const HALF = 0.17;
  const SHAFT = 0.16;
  for (const arrow of options.arrows ?? []) {
    const from = cornerOf(arrow.from, orientation);
    const to = cornerOf(arrow.to, orientation);
    if (!from || !to) continue;
    const tail = { x: from.x + 0.5, y: from.y + 0.5 };
    const tip = { x: to.x + 0.5, y: to.y + 0.5 };
    const dx = tip.x - tail.x;
    const dy = tip.y - tail.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    const baseX = tip.x - ux * HEAD;
    const baseY = tip.y - uy * HEAD;
    const color = safeColor(arrow.color) ?? palette.arrow;
    parts.push(
      `<line x1="${n(tail.x + ux * 0.2)}" y1="${n(tail.y + uy * 0.2)}" x2="${n(baseX)}" y2="${n(baseY)}" stroke="${color}" stroke-width="${SHAFT}" stroke-linecap="round"/>`,
      `<polygon points="${n(tip.x)},${n(tip.y)} ${n(baseX - uy * HALF)},${n(baseY + ux * HALF)} ${n(baseX + uy * HALF)},${n(baseY - ux * HALF)}" fill="${color}"/>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="${size}" height="${size}">` +
    parts.join('') +
    labels.join('') +
    `</svg>`
  );
}
