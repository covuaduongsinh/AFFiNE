import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import { parseDiagramFen } from '@blocksuite/chess-core';
import { nanoid } from '@blocksuite/store';
import type { Code } from 'mdast';

import { ChessBoardBlockSchema, START_FEN } from '../model.js';

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

/**
 * Pull the FEN and options out of a fence body.
 *
 * The Obsidian plugin writes `key: value` lines and supports keys this block
 * does not model (annotations, piece styles); those are skipped rather than
 * rejected — an unknown styling option must not turn a whole diagram back into
 * a code block. A body with no such lines is the FEN itself.
 */
function readBody(value: string): {
  fen: string | null;
  orientation?: 'white' | 'black';
} {
  let fen: string | null = null;
  let orientation: 'white' | 'black' | undefined;
  let sawOptionLine = false;
  for (const line of value.split('\n')) {
    const match = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    sawOptionLine = true;
    const key = match[1].toLowerCase();
    const rest = match[2].trim();
    if (key === 'fen') fen = rest;
    else if (key === 'orientation') {
      orientation = rest.toLowerCase() === 'black' ? 'black' : 'white';
    }
  }
  if (!sawOptionLine) return { fen: value.trim() };
  return { fen, orientation };
}

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

      const body = readBody(o.node.value);
      if (body.fen === null) return;
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
      const fen = props.fen ?? START_FEN;
      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            type: 'code',
            lang: CHESSBOARD_LANG,
            meta: null,
            value:
              props.orientation === 'black'
                ? `fen: ${fen}\norientation: black`
                : `fen: ${fen}`,
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
