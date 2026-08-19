import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import { parseDiagramFen } from '@blocksuite/chess-core';
import { nanoid } from '@blocksuite/store';
import type { Code } from 'mdast';

import { ChessBoardBlockSchema, START_FEN } from '../model.js';
import {
  type FenceProps,
  readFenceBody,
  writeFenceBody,
} from './obsidian-fence.js';

/**
 * Boards travel through Markdown as a fenced block, in either of two shapes:
 *
 * ```chessboard
 * fen: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
 * ```
 *
 * — the Obsidian chessboard plugin's format, which is also what this adapter
 * writes so a document round-trips between the two apps — or the bare form
 * this block always understood, a `fen` fence whose body is the FEN itself.
 *
 * A code fence is the right carrier because it survives every Markdown tool
 * unchanged, and anything that does not understand the tag still shows the
 * reader a position they can paste elsewhere.
 */
const CHESSBOARD_LANG = 'chessboard';
const FEN_LANG = 'fen';

const isBoardCodeNode = (node: MarkdownAST): node is Code =>
  node.type === 'code' &&
  (node.lang === FEN_LANG || node.lang === CHESSBOARD_LANG);

/** The pre-option-lines form carried `orientation=black` in the fence meta. */
function readMetaOrientation(meta: string | null | undefined) {
  return meta?.includes('orientation=black') ? 'black' : 'white';
}

export const chessBoardMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: ChessBoardBlockSchema.model.flavour,
  toMatch: o => isBoardCodeNode(o.node),
  fromMatch: o => o.node.flavour === ChessBoardBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!isBoardCodeNode(o.node)) return;

      const body = readFenceBody(o.node.value);
      if (body === null) return;
      const fen = body.fen;
      try {
        // Refuse to build a board from a FEN we cannot read — leaving the code
        // fence alone is far better than inserting a broken diagram. Diagram
        // parse: printed positions legitimately omit kings.
        parseDiagramFen(fen);
      } catch {
        return;
      }

      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            type: 'block',
            id: nanoid(),
            flavour: ChessBoardBlockSchema.model.flavour,
            props: {
              fen,
              orientation: body.orientation ?? readMetaOrientation(o.node.meta),
              caption: '',
              arrows: body.arrows,
              highlights: body.highlights,
              editable: false,
              extraLines: body.extraLines,
              extraAnnotations: body.extraAnnotations,
            },
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const props = o.node.props as Partial<FenceProps>;
      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            type: 'code',
            lang: CHESSBOARD_LANG,
            meta: null,
            value: writeFenceBody({ ...props, fen: props.fen ?? START_FEN }),
          },
          'children'
        )
        .closeNode();
    },
  },
};

export const chessBoardMarkdownAdapterExtension = BlockMarkdownAdapterExtension(
  chessBoardMarkdownAdapterMatcher
);
