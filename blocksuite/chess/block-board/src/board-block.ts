import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { BlockSelection } from '@blocksuite/std';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { css, html } from 'lit';

import type { ChessBoardBlockModel } from './model.js';
import { ChessBoardRendererIdentifier } from './renderer.js';

export class ChessBoardBlockComponent extends CaptionedBlockComponent<ChessBoardBlockModel> {
  static override styles = css`
    affine-chess-board {
      display: block;
      margin: 12px 0;
    }

    .chess-board-container {
      /*
       * The width here is load-bearing. The board inside is sized with
       * width: 100%, so without a definite width to resolve against it
       * collapses to zero — the block renders, the DOM is complete, and
       * nothing is visible.
       *
       * How *large* the board ends up is not decided here: the board component
       * caps and centres itself, so a position is the same size whether it
       * stands alone or sits inside a game.
       */
      width: 100%;
      border-radius: 4px;
      outline: 2px solid transparent;
      transition: outline-color 120ms ease;
    }

    /*
     * The React bridge's anchor element carries no styles of its own and so
     * defaults to display: inline, which gives its contents nothing to size
     * against.
     */
    .chess-board-container > lit-react-portal {
      display: block;
      width: 100%;
    }

    .chess-board-container[data-selected='true'] {
      outline-color: var(--affine-primary-color);
    }

    .chess-board-placeholder {
      width: 100%;
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px dashed var(--affine-border-color);
      border-radius: 4px;
      color: var(--affine-text-secondary-color);
      font-size: 14px;
    }

    /*
     * Space held for a board that has not been drawn yet. The numbers mirror
     * the board component's own box (BOARD_SIZE, square) so the document is
     * the right length before a single board exists — they cannot be imported,
     * because that constant lives in the React package this one must not
     * depend on.
     */
    .chess-board-pending {
      width: 100%;
      max-width: 420px;
      margin: 0 auto;
      aspect-ratio: 1 / 1;
    }
  `;

  get isBlockSelected() {
    return this.selection
      .filter(BlockSelection)
      .some(selection => selection.blockId === this.model.id);
  }

  /**
   * Whether this board has been drawn yet.
   *
   * A lesson document is not one diagram but a hundred — the user's *Step 2
   * Trainer Manual* holds 111 of them — and each one is a React root drawing
   * 64 squares. Building all of them to show the first screenful is work
   * nobody asked for, so a board waits until it is near the viewport.
   *
   * It is never taken down again: keeping a drawn board costs a re-render at
   * most, while unmounting would throw away the position editor mid-edit and
   * make scrolling back up jump.
   */
  private _drawn = false;

  private _viewportObserver: IntersectionObserver | null = null;

  override connectedCallback() {
    super.connectedCallback();
    // Opt out of the editor's native-selection syncing, the way the database
    // block does. `RangeBinding` treats a caret in this block's FEN box as
    // stray and blurs it unless the field is excluded.
    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
    this._watchViewport();
  }

  override disconnectedCallback() {
    this._viewportObserver?.disconnect();
    this._viewportObserver = null;
    super.disconnectedCallback();
  }

  private _watchViewport() {
    // The edgeless subclass draws through `renderGfxBlock` and ignores
    // `_drawn`. Watching it would only attach an observer nobody reads.
    if (this.constructor !== ChessBoardBlockComponent) {
      this._drawn = true;
      return;
    }

    // Somewhere without the API — a test environment, a non-browser host — a
    // board simply draws at once rather than never.
    if (typeof IntersectionObserver === 'undefined') {
      this._drawn = true;
      return;
    }

    this._viewportObserver = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        this._viewportObserver?.disconnect();
        this._viewportObserver = null;
        this._drawn = true;
        this.requestUpdate();
      },
      // Draw well before the board is on screen. A drawn board is taller than
      // the space held for it, since the author controls sit underneath, and
      // the margin keeps that growth below the fold where it moves nothing
      // the reader is looking at.
      { rootMargin: '600px' }
    );
    this._viewportObserver.observe(this);
  }

  /**
   * Hand focus to a field inside the block when the user clicks into one.
   *
   * While a block selection is live the editor host keeps pulling focus back
   * to itself, so a field inside the block would lose its caret. Selecting the
   * block and then editing inside it is the ordinary way to work here, so the
   * selection has to yield rather than fight the field.
   */
  private readonly _onFieldFocus = (event: FocusEvent) => {
    const target = event.target;
    if (
      !(
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement
      )
    ) {
      return;
    }
    if (this.selection.filter(BlockSelection).length === 0) return;
    this.selection.clear(['block']);
  };

  override renderBlock() {
    const renderer = this.std.getOptional(ChessBoardRendererIdentifier);

    return html`
      <div
        contenteditable="false"
        class="chess-board-container"
        data-selected=${this.isBlockSelected ? 'true' : 'false'}
        @focusin=${this._onFieldFocus}
      >
        ${
          !this._drawn
            ? html`<div class="chess-board-pending"></div>`
            : renderer
              ? renderer.render(this.model)
              : html`<div class="chess-board-placeholder">
                  Chess board unavailable
                </div>`
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-chess-board': ChessBoardBlockComponent;
  }
}
