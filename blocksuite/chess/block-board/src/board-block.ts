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
  `;

  get isBlockSelected() {
    return this.selection
      .filter(BlockSelection)
      .some(selection => selection.blockId === this.model.id);
  }

  /**
   * Opt out of the editor's native-selection syncing, the way the database
   * block does.
   *
   * `RangeBinding` watches `selectionchange` on the document and treats any
   * selection without an inline-text endpoint as stray: it removes the range
   * and ends up calling `document.activeElement.blur()`. A caret inside this
   * block's FEN box is exactly such a selection, so without this attribute the
   * editor takes the caret back moments after a click grants it.
   */
  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
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
          renderer
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
