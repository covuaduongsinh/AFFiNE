import {
  BlockPdfAdapterExtension,
  type BlockPdfAdapterMatcher,
  PDF_COLORS,
  type PdfContent,
} from '@blocksuite/affine-shared/adapters';
import {
  type BoardSvgArrow,
  type BoardSvgHighlight,
  fenToSvg,
} from '@blocksuite/chess-core';

import { ChessBoardBlockSchema, START_FEN } from '../model.js';

/** Fits the 515pt content width of the default A4 page with room to spare. */
const BOARD_SIZE = 320;

function readArrows(value: unknown): BoardSvgArrow[] {
  if (!Array.isArray(value)) return [];
  const arrows: BoardSvgArrow[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    if (!('from' in entry) || !('to' in entry)) continue;
    const { from, to } = entry;
    if (typeof from !== 'string' || typeof to !== 'string') continue;
    const color =
      'color' in entry && typeof entry.color === 'string'
        ? entry.color
        : undefined;
    arrows.push({ from, to, color });
  }
  return arrows;
}

function readHighlights(value: unknown): BoardSvgHighlight[] {
  if (!Array.isArray(value)) return [];
  const highlights: BoardSvgHighlight[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    if (!('square' in entry) || !('color' in entry)) continue;
    const { square, color } = entry;
    if (typeof square !== 'string' || typeof color !== 'string') continue;
    highlights.push({ square, color });
  }
  return highlights;
}

/**
 * Maps an `affine:chess-board` snapshot to a sized vector board on the PDF.
 *
 * `extraLines` and `extraAnnotations` stay out: they are round-trip bytes for
 * the reader's Obsidian vault, not something a reader of the PDF asked for.
 */
export const chessBoardPdfAdapterMatcher: BlockPdfAdapterMatcher = {
  flavour: ChessBoardBlockSchema.model.flavour,
  toContent: (_block, { props }) => {
    const fen =
      typeof props.fen === 'string' && props.fen.trim() !== ''
        ? props.fen
        : START_FEN;
    const orientation = props.orientation === 'black' ? 'black' : 'white';
    const arrows = readArrows(props.arrows);
    const highlights = readHighlights(props.highlights);
    const content: PdfContent[] = [
      {
        svg: fenToSvg(fen, {
          orientation,
          size: BOARD_SIZE,
          arrows,
          highlights,
          textInSvg: false,
        }),
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        margin: [0, 8, 0, 4],
        alignment: 'center',
      },
    ];

    const caption = typeof props.caption === 'string' ? props.caption : '';
    if (caption !== '') {
      content.push({
        text: caption,
        italics: true,
        fontSize: 10,
        color: PDF_COLORS.textMuted,
        margin: [0, 2, 0, 10],
        alignment: 'center',
      });
    }

    return content;
  },
};

export const chessBoardPdfAdapterExtension = BlockPdfAdapterExtension(
  chessBoardPdfAdapterMatcher
);
