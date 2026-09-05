import {
  BlockPdfAdapterExtension,
  type BlockPdfAdapterMatcher,
  PDF_COLORS,
  type PdfContent,
} from '@blocksuite/affine-shared/adapters';
import {
  captionFromHeaders,
  DIAGRAM_BOOK_PALETTE,
  fenToSvg,
  type Game,
  parsePgn,
  positionAt,
  serializePgn,
  toFen,
} from '@blocksuite/chess-core';

import { ChessGameBlockSchema, EMPTY_PGN } from '../model.js';

/** Fits the 515pt content width of the default A4 page with room to spare. */
const BOARD_SIZE = 320;

/**
 * Maps an `affine:chess-game` snapshot to a diagram + movetext block on the PDF.
 *
 * Headers go to a muted caption above or below the diagram, never to the move
 * stream; movetext is single-spaced and drops the root `[Tag "Val"]` lines.
 */
export const chessGamePdfAdapterMatcher: BlockPdfAdapterMatcher = {
  flavour: ChessGameBlockSchema.model.flavour,
  toContent: (_block, { props, configs }) => {
    const baseIndent = 0;
    const pgn =
      typeof props.pgn === 'string' && props.pgn.trim() !== ''
        ? props.pgn
        : EMPTY_PGN;
    const orientation = props.orientation === 'black' ? 'black' : 'white';

    let game: Game;
    try {
      game = parsePgn(pgn);
    } catch {
      return [
        {
          text: pgn,
          fontSize: 10,
          margin: [0, 8, 0, 4],
        },
      ];
    }

    const currentPath =
      Array.isArray(props.currentPath) &&
      props.currentPath.every(index => typeof index === 'number')
        ? props.currentPath
        : [];

    const fen = toFen(positionAt(game, currentPath));
    const isDiagramMode =
      configs?.get('chessDiagramStyle') === 'font' ||
      configs?.get('chessDiagramStyle') === 'diagram' ||
      props.pieceSet === 'diagram';

    const diagramContent: PdfContent = {
      svg: fenToSvg(fen, {
        orientation,
        size: BOARD_SIZE,
        palette: isDiagramMode ? DIAGRAM_BOOK_PALETTE : undefined,
        pieceSet: isDiagramMode
          ? 'diagram'
          : typeof props.pieceSet === 'string'
            ? (props.pieceSet as any)
            : undefined,
        textInSvg: false,
      }),
      width: BOARD_SIZE,
      height: BOARD_SIZE,
      margin: [0, 8, 0, 4],
      alignment: 'center',
    };

    const content: PdfContent[] = [diagramContent];

    const propsCaption = typeof props.caption === 'string' ? props.caption : '';
    // A headerless game captions as "? – ?", which is worse than no caption.
    const headerCaption = captionFromHeaders(game.headers);
    const caption =
      propsCaption !== ''
        ? propsCaption
        : headerCaption === '? – ?'
          ? ''
          : headerCaption;
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

    // Re-serializing rather than walking the tree keeps SAN, NAGs and variation
    // brackets identical to the PGN the author wrote.
    const movetext = serializePgn(game)
      .split('\n')
      .filter(line => !line.startsWith('['))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (movetext !== '' && movetext !== '*') {
      content.push({
        text: movetext,
        fontSize: 10,
        margin: [baseIndent, 2, 0, 8],
      });
    }

    return content;
  },
};

export const chessGamePdfAdapterExtension = BlockPdfAdapterExtension(
  chessGamePdfAdapterMatcher
);
