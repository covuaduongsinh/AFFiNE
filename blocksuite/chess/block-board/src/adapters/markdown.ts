import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import { parseFen } from '@blocksuite/chess-core';
import { nanoid } from '@blocksuite/store';
import type { Code } from 'mdast';

import { ChessBoardBlockSchema, START_FEN } from '../model';

/**
 * Boards travel through Markdown as a fenced block tagged `fen`:
 *
 * ```fen
 * rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
 * ```
 *
 * A code fence is the right carrier because it survives every Markdown tool
 * unchanged, and anything that does not understand the `fen` tag still shows
 * the reader a position they can paste elsewhere.
 */
const FEN_LANG = 'fen';

const isFenCodeNode = (node: MarkdownAST): node is Code =>
  node.type === 'code' && node.lang === FEN_LANG;

/** `orientation=black` is carried in the fence's meta field. */
function readOrientation(meta: string | null | undefined) {
  return meta?.includes('orientation=black') ? 'black' : 'white';
}

export const chessBoardMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: ChessBoardBlockSchema.model.flavour,
  toMatch: o => isFenCodeNode(o.node),
  fromMatch: o => o.node.flavour === ChessBoardBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!isFenCodeNode(o.node)) return;

      const fen = o.node.value.trim();
      try {
        // Refuse to build a board from a FEN we cannot read — leaving the code
        // fence alone is far better than inserting a broken diagram.
        parseFen(fen);
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
              orientation: readOrientation(o.node.meta),
              caption: '',
              arrows: [],
              highlights: [],
              editable: false,
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
      const props = o.node.props as {
        fen?: string;
        orientation?: string;
      };
      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            type: 'code',
            lang: FEN_LANG,
            meta: props.orientation === 'black' ? 'orientation=black' : null,
            value: props.fen ?? START_FEN,
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
