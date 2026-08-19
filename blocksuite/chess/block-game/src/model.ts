import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export type BoardOrientation = 'white' | 'black';

export interface ChessGameProps {
  /**
   * The whole game as PGN text — headers, moves, variations, comments and NAGs.
   *
   * PGN is the single source of truth rather than a parsed tree: it is what
   * every other chess tool speaks, it survives a CRDT merge as ordinary text,
   * and it means an annotation can never drift from the move it belongs to.
   */
  pgn: string;
  /**
   * Path through the move tree to the position on show: the index of the chosen
   * child at each ply. `[]` is the starting position.
   */
  currentPath: number[];
  orientation: BoardOrientation;
  caption: string;
  /**
   * JSON game scan from the last engine pass, or `''`.
   *
   * Overlay only: Markdown export and the PGN stay untouched until the author
   * applies. Additive — do not bump schema version for this field.
   */
  analysisJson: string;
}

/** An empty game: no headers, no moves, result undetermined. */
export const EMPTY_PGN = '*';

export const ChessGameBlockSchema = defineBlockSchema({
  flavour: 'affine:chess-game',
  props: (): ChessGameProps => ({
    pgn: EMPTY_PGN,
    currentPath: [],
    orientation: 'white',
    caption: '',
    analysisJson: '',
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: [
      'affine:note',
      'affine:paragraph',
      'affine:list',
      'affine:callout',
    ],
    children: [],
  },
  toModel: () => new ChessGameBlockModel(),
});

export class ChessGameBlockModel extends BlockModel<ChessGameProps> {}

export const ChessGameBlockSchemaExtension =
  BlockSchemaExtension(ChessGameBlockSchema);
