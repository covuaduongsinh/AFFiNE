import type {
  GfxCommonBlockProps,
  GfxElementGeometry,
} from '@blocksuite/std/gfx';
import { GfxCompatible } from '@blocksuite/std/gfx';
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

/**
 * A board carries the graphics props as well as its own.
 *
 * The same block renders in a document and standing alone on the whiteboard —
 * a coach's demo board — so it has to be gfx-compatible. In a document the
 * `xywh` and `index` props are simply unused.
 */
export type ChessBoardProps = {
  /** Full FEN. The single source of truth for what is on the board. */
  fen: string;
  orientation: BoardOrientation;
  caption: string;
  /** Coach annotations drawn over the board. */
  arrows: ChessBoardArrow[];
  highlights: ChessBoardHighlight[];
  /** Whether readers may move the pieces. Off makes it a fixed diagram. */
  editable: boolean;
  /**
   * Lines of the Markdown fence this block does not model, verbatim and in
   * source order — `strict: false` above all, but also piece styles and keys
   * from plugin versions we have never heard of.
   *
   * They are carried rather than parsed because a note is the author's, not
   * ours: dropping a line the reader's Obsidian needs would silently rewrite
   * their vault the first time a document went back out.
   */
  extraLines: string[];
  /**
   * Annotation tokens this block does not draw, verbatim and in source order —
   * circles, squares, move-quality icons. Same bargain as {@link extraLines}.
   */
  extraAnnotations: string[];
} & Omit<GfxCommonBlockProps, 'scale'>;

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A board is square, so the default bound is too. */
export const DEFAULT_BOARD_SIZE = 400;

const defaultChessBoardProps = (): ChessBoardProps => ({
  fen: START_FEN,
  orientation: 'white',
  caption: '',
  arrows: [],
  highlights: [],
  editable: true,
  extraLines: [],
  extraAnnotations: [],
  index: 'a0',
  xywh: `[0,0,${DEFAULT_BOARD_SIZE},${DEFAULT_BOARD_SIZE}]`,
  lockedBySelf: false,
  rotate: 0,
});

export const ChessBoardBlockSchema = defineBlockSchema({
  flavour: 'affine:chess-board',
  props: defaultChessBoardProps,
  metadata: {
    /**
     * Stays at 1 through additive prop changes. A block records the version it
     * was written with, nothing migrates it, and a mismatch makes the editor
     * replace the board with a "Block Version Mismatched" panel — so bumping
     * this would blank every board already saved. Props missing from an older
     * block are backfilled from the factory above, which is exactly right:
     * nothing extra was ever known about them.
     */
    version: 1,
    role: 'content',
    parent: [
      'affine:note',
      'affine:paragraph',
      'affine:list',
      'affine:callout',
      'affine:edgeless-text',
      'affine:surface',
    ],
    children: [],
  },
  toModel: () => new ChessBoardBlockModel(),
});

export class ChessBoardBlockModel
  extends GfxCompatible<ChessBoardProps>(BlockModel)
  implements GfxElementGeometry {}

export const ChessBoardBlockSchemaExtension = BlockSchemaExtension(
  ChessBoardBlockSchema
);
