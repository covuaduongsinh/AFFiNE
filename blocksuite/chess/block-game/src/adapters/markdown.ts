import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import { parsePgn } from '@blocksuite/chess-core';
import { nanoid } from '@blocksuite/store';
import type { Code } from 'mdast';

import { ChessGameBlockSchema, EMPTY_PGN } from '../model.js';

/**
 * Games travel through Markdown as a fenced block tagged `pgn`. PGN is already
 * the interchange format of the whole chess world, so the fence carries the
 * game verbatim — headers, variations, comments and NAGs included.
 */
const PGN_LANG = 'pgn';

const isPgnCodeNode = (node: MarkdownAST): node is Code =>
  node.type === 'code' && node.lang === PGN_LANG;

export const chessGameMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: ChessGameBlockSchema.model.flavour,
  toMatch: o => isPgnCodeNode(o.node),
  fromMatch: o => o.node.flavour === ChessGameBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!isPgnCodeNode(o.node)) return;

      const pgn = o.node.value.trim();
      try {
        // Leave a fence we cannot parse as a code block; a half-read game is
        // worse than an untouched one.
        parsePgn(pgn);
      } catch {
        return;
      }

      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            type: 'block',
            id: nanoid(),
            flavour: ChessGameBlockSchema.model.flavour,
            props: {
              pgn,
              currentPath: [],
              orientation: 'white',
              caption: '',
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
      // analysisJson is a local overlay — PGN is the interchange format.
      const props = o.node.props as { pgn?: string };
      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            type: 'code',
            lang: PGN_LANG,
            meta: null,
            value: props.pgn ?? EMPTY_PGN,
          },
          'children'
        )
        .closeNode();
    },
  },
};

export const chessGameMarkdownAdapterExtension = BlockMarkdownAdapterExtension(
  chessGameMarkdownAdapterMatcher
);
