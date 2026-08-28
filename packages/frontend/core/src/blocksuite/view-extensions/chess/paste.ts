import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import {
  BlockSelection,
  LifeCycleWatcher,
  TextSelection,
  type UIEventHandler,
} from '@blocksuite/affine/std';
import type { BlockModel } from '@blocksuite/affine/store';
import {
  type ChessTextMatch,
  detectChessText,
  importPgnGames,
} from '@blocksuite/chess-core';

import {
  applyImportedGames,
  isPgnFile,
  readPgnFile,
  titleFromPgnFileName,
} from '../../../modules/chess-library/import-apply';
import { getChessFramework } from './framework';

/**
 * Turns a pasted position or game into the matching block.
 *
 * A coach copies a FEN out of an engine or a PGN out of Lichess and pastes it;
 * getting a board instead of a wall of monospace text is the whole point.
 *
 * This hooks the `paste` event rather than the clipboard's transformer
 * middleware. The middleware route looks tidier but does not work: when the
 * caret sits inside a paragraph, `PasteTr` merges the incoming text as deltas
 * at the cursor and never looks at the block structure a middleware built.
 * Handling the event means deciding before any of that runs.
 */
export function chessBlockProps(match: NonNullable<ChessTextMatch>) {
  return match.kind === 'fen'
    ? ([
        'affine:chess-board',
        {
          fen: match.fen,
          orientation: 'white',
          caption: '',
          arrows: [],
          highlights: [],
          editable: true,
          extraLines: [],
          extraAnnotations: [],
        },
      ] as const)
    : ([
        'affine:chess-game',
        {
          pgn: match.pgn,
          currentPath: [],
          orientation: 'white',
          caption: '',
        },
      ] as const);
}

/** An untouched paragraph should be replaced, not pushed down. */
export function isEmptyParagraph(model: BlockModel): boolean {
  if (model.flavour !== 'affine:paragraph') return false;
  const text = (model.props as { text?: { length: number } }).text;
  return (text?.length ?? 0) === 0;
}

export class ChessPasteWatcher extends LifeCycleWatcher {
  static override key = 'affine-chess-paste';

  private readonly _disposables = new DisposableGroup();

  /**
   * The chess block the user is currently inside, if any.
   *
   * Clicking a chess block produces no selection — it holds no text and does
   * not handle clicks as selection — but its container is focusable, so the
   * active element is what actually tells us where the user is.
   */
  private _focusedChessModel(): BlockModel | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;

    const host = active.closest('affine-chess-game, affine-chess-board');
    const model = (host as { model?: BlockModel } | null)?.model;
    return model ?? null;
  }

  /** The block the caret or selection is currently in. */
  private _currentModel(): BlockModel | null {
    const focused = this._focusedChessModel();
    if (focused) return focused;

    const text = this.std.selection.find(TextSelection);
    const blockId =
      text?.blockId ?? this.std.selection.find(BlockSelection)?.blockId;
    if (!blockId) return null;
    return this.std.store.getBlock(blockId)?.model ?? null;
  }

  /**
   * Pasting onto a chess block replaces what it holds.
   *
   * Dropping a fresh game next to the one you meant to overwrite is never what
   * anyone wants, and this is the only way to change a board or a game without
   * opening its editor.
   */
  private _replaceInPlace(
    model: BlockModel,
    match: NonNullable<ChessTextMatch>
  ): boolean {
    // Overwriting a game is exactly the kind of thing to want back, so open a
    // fresh undo step rather than letting it merge into the previous edit.
    this.std.store.captureSync();

    if (match.kind === 'pgn' && model.flavour === 'affine:chess-game') {
      // The stored path addresses the old game, so start from the beginning.
      this.std.store.updateBlock(model, {
        pgn: match.pgn,
        currentPath: [],
      });
      return true;
    }

    if (match.kind === 'fen' && model.flavour === 'affine:chess-board') {
      // Annotations belong to the position that was here, not to the new one:
      // an arrow kept across the swap points at squares from another game, and
      // now that annotations reach Markdown it would be written into the note.
      this.std.store.updateBlock(model, {
        fen: match.fen,
        arrows: [],
        highlights: [],
      });
      return true;
    }

    return false;
  }

  /** Returns true when a block was inserted or replaced. */
  private _insert(match: NonNullable<ChessTextMatch>): boolean {
    const model = this._currentModel();
    if (!model) return false;

    if (this._replaceInPlace(model, match)) return true;

    const { store } = this.std;
    const parent = store.getParent(model);
    if (!parent) return false;

    const index = parent.children.indexOf(model);
    if (index === -1) return false;

    const [flavour, props] = chessBlockProps(match);
    const replacing = isEmptyParagraph(model);

    const id = store.addBlock(
      flavour,
      props,
      parent,
      replacing ? index : index + 1
    );
    if (!id) return false;

    if (replacing) store.deleteBlock(model);
    return true;
  }

  private _insertPgn(pgn: string, caption: string): boolean {
    const model = this._currentModel();
    if (!model) return false;
    const { store } = this.std;
    if (model.flavour === 'affine:chess-game') {
      store.captureSync();
      store.updateBlock(model, { pgn, currentPath: [], caption });
      return true;
    }
    const parent = store.getParent(model);
    if (!parent) return false;
    const index = parent.children.indexOf(model);
    if (index === -1) return false;
    const replacing = isEmptyParagraph(model);
    const id = store.addBlock(
      'affine:chess-game',
      {
        pgn,
        currentPath: [],
        orientation: 'white',
        caption,
        analysisJson: '',
      },
      parent,
      replacing ? index : index + 1
    );
    if (!id) return false;
    if (replacing) store.deleteBlock(model);
    return true;
  }

  private readonly _onDragOver = (event: DragEvent) => {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
    }
  };

  private readonly _onNativeDrop = (event: DragEvent) => {
    if (this.std.store.readonly) return;
    const files = Array.from(event.dataTransfer?.files ?? []).filter(isPgnFile);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this._importDropped(files).catch(() => {});
  };

  private async _importDropped(files: File[]) {
    const insertOne = (pgn: string, caption: string) =>
      this._insertPgn(pgn, caption);
    const framework = getChessFramework();
    if (framework) {
      // paste.spec.ts imports this file; the service pulls telemetry storage.
      const { ChessLibraryService } =
        await import('../../../modules/chess-library');
      const library = framework.getOptional(ChessLibraryService);
      if (library) {
        await library.importFiles(files, insertOne);
        return;
      }
    }
    for (const file of files) {
      const text = await readPgnFile(file);
      const result = importPgnGames(text);
      await applyImportedGames(
        result.games,
        {
          insertOne,
          createMultiGameDoc: async () => '',
        },
        titleFromPgnFileName(file.name)
      );
    }
  }

  private readonly _onPaste: UIEventHandler = ctx => {
    if (this.std.store.readonly) return false;

    // Pasting into the PGN box or a comment field is ordinary text editing.
    // Claiming it here would replace the whole block instead of typing.
    const active = document.activeElement;
    if (
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLInputElement
    ) {
      return false;
    }

    const event = ctx.get('clipboardState').raw;
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return false;

    const match = detectChessText(text);
    if (!match) return false;

    if (!this._insert(match)) return false;

    // Only claim the event once a block actually landed, so a paste we cannot
    // place still falls through to the normal clipboard path.
    event.preventDefault();
    return true;
  };

  override mounted() {
    super.mounted();
    // Handlers are unshifted, so the most recently registered runs first, and
    // the dispatcher stops at the first one returning true. This watcher is
    // registered after the root block's PageClipboard, which is what lets it
    // decide before the default paste happens — keep that ordering.
    this._disposables.add(this.std.event.add('paste', this._onPaste));
    const host = this.std.host;
    host.addEventListener('drop', this._onNativeDrop);
    host.addEventListener('dragover', this._onDragOver);
    this._disposables.add(() => {
      host.removeEventListener('drop', this._onNativeDrop);
      host.removeEventListener('dragover', this._onDragOver);
    });
  }

  override unmounted() {
    super.unmounted();
    this._disposables.dispose();
  }
}
