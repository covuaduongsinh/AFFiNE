import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import { LifeCycleWatcher } from '@blocksuite/affine/std';
import {
  type BlockSnapshot,
  nanoid,
  type TransformerMiddleware,
} from '@blocksuite/affine/store';
import { type ChessTextMatch, detectChessText } from '@blocksuite/chess-core';

/**
 * Turns a pasted position or game into the matching block.
 *
 * A coach copies a FEN out of an engine or a PGN out of Lichess and pastes it;
 * getting a board instead of a wall of monospace text is the whole point. The
 * work happens on the clipboard's slice snapshot, before anything reaches the
 * document, so an unrecognised paste is left completely untouched.
 */

/** Plain text arrives as one note whose children are a paragraph per line. */
function readPastedLines(content: BlockSnapshot[]): string[] | null {
  if (content.length !== 1) return null;
  const note = content[0];
  if (note.flavour !== 'affine:note') return null;

  const lines: string[] = [];
  for (const child of note.children) {
    if (child.flavour !== 'affine:paragraph') return null;
    // Anything richer than a plain run of text is not a pasted FEN or PGN.
    if (child.children.length > 0) return null;

    const text = child.props?.text as
      | { delta?: { insert?: string }[] }
      | undefined;
    if (!text?.delta) return null;
    lines.push(text.delta.map(op => op.insert ?? '').join(''));
  }

  return lines;
}

function chessSnapshot(match: ChessTextMatch): BlockSnapshot | null {
  if (!match) return null;

  if (match.kind === 'fen') {
    return {
      type: 'block',
      id: nanoid(),
      flavour: 'affine:chess-board',
      props: {
        fen: match.fen,
        orientation: 'white',
        caption: '',
        arrows: [],
        highlights: [],
        editable: true,
      },
      children: [],
    };
  }

  return {
    type: 'block',
    id: nanoid(),
    flavour: 'affine:chess-game',
    props: {
      pgn: match.pgn,
      currentPath: [],
      orientation: 'white',
      caption: '',
    },
    children: [],
  };
}

export const chessPasteMiddleware =
  (): TransformerMiddleware =>
  ({ slots }) => {
    const subscription = slots.beforeImport.subscribe(payload => {
      if (payload.type !== 'slice') return;

      const lines = readPastedLines(payload.snapshot.content);
      if (!lines) return;

      const match = detectChessText(lines.join('\n'));
      const snapshot = chessSnapshot(match);
      if (!snapshot) return;

      // Replace the paragraphs inside the note rather than the note itself, so
      // the block lands wherever a pasted paragraph would have.
      payload.snapshot.content[0].children = [snapshot];
    });

    return () => subscription.unsubscribe();
  };

/**
 * Registers {@link chessPasteMiddleware} with the editor's clipboard.
 *
 * A separate watcher rather than an edit to `PageClipboard`: clipboard
 * middlewares compose, so the chess handling can be added and removed without
 * touching the upstream widget.
 */
export class ChessPasteWatcher extends LifeCycleWatcher {
  static override key = 'affine-chess-paste';

  private readonly _disposables = new DisposableGroup();

  override mounted() {
    super.mounted();
    const middleware = chessPasteMiddleware();
    this.std.clipboard.use(middleware);
    this._disposables.add({
      dispose: () => this.std.clipboard.unuse(middleware),
    });
  }

  override unmounted() {
    super.unmounted();
    this._disposables.dispose();
  }
}
