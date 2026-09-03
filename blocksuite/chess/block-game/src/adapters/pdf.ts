import {
  BlockPdfAdapterExtension,
  type BlockPdfAdapterMatcher,
  PDF_COLORS,
  type PdfContent,
} from '@blocksuite/affine-shared/adapters';
import {
  captionFromHeaders,
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
 * Games print as the position currently on show plus the movetext.
 *
 * `analysisJson` stays out — it is a local engine overlay, not part of the game
 * — and an unreadable PGN is emitted verbatim rather than guessed at: a board
 * drawn from a misparse would be a lie, and dropping the text would lose the
 * author's only copy.
 */
export const chessGamePdfAdapterMatcher: BlockPdfAdapterMatcher = {
  flavour: ChessGameBlockSchema.model.flavour,
  toContent: (_block, { props, baseIndent }) => {
    const pgn = typeof props.pgn === 'string' ? props.pgn : EMPTY_PGN;
    const orientation = props.orientation === 'black' ? 'black' : 'white';

    let game: Game;
    try {
      game = parsePgn(pgn);
    } catch {
      return [
        {
          text: pgn,
          fontSize: 10,
          font: 'Inter',
          color: PDF_COLORS.text,
          background: PDF_COLORS.codeBackground,
          margin: [baseIndent, 4, 0, 8],
        },
      ];
    }

    const currentPath =
      Array.isArray(props.currentPath) &&
      props.currentPath.every(index => typeof index === 'number')
        ? props.currentPath
        : [];

    const content: PdfContent[] = [
      {
        svg: fenToSvg(toFen(positionAt(game, currentPath)), {
          orientation,
          size: BOARD_SIZE,
        }),
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        margin: [0, 8, 0, 4],
        alignment: 'center',
      },
    ];

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
