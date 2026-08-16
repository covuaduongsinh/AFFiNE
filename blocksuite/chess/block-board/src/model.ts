import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export type BoardOrientation = 'white' | 'black';

export interface ChessBoardArrow {
  from: string;
  to: string;
  color?: string;
}

export interface ChessBoardHighlight {
  square: string;
  color: string;
}

export interface ChessBoardProps {
  /** Full FEN. The single source of truth for what is on the board. */
  fen: string;
  orientation: BoardOrientation;
  caption: string;
  /** Coach annotations drawn over the board. */
  arrows: ChessBoardArrow[];
  highlights: ChessBoardHighlight[];
  /** Whether readers may move the pieces. Off by default so diagrams stay put. */
  editable: boolean;
}

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const ChessBoardBlockSchema = defineBlockSchema({
  flavour: 'affine:chess-board',
  props: (): ChessBoardProps => ({
    fen: START_FEN,
    orientation: 'white',
    caption: '',
    arrows: [],
    highlights: [],
    editable: true,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: [
      'affine:note',
      'affine:paragraph',
      'affine:list',
      'affine:callout',
      'affine:edgeless-text',
    ],
    children: [],
  },
  toModel: () => new ChessBoardBlockModel(),
});

export class ChessBoardBlockModel extends BlockModel<ChessBoardProps> {}

export const ChessBoardBlockSchemaExtension = BlockSchemaExtension(
  ChessBoardBlockSchema
);
