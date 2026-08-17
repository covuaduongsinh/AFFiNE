import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { BlockSelection } from '@blocksuite/std';
import { css, html } from 'lit';

import type { ChessGameBlockModel } from './model.js';
import { ChessGameRendererIdentifier } from './renderer.js';

export class ChessGameBlockComponent extends CaptionedBlockComponent<ChessGameBlockModel> {
  static override styles = css`
    affine-chess-game {
      display: block;
      margin: 12px 0;
    }

    .chess-game-container {
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
      overflow: hidden;
      outline: 2px solid transparent;
      transition: outline-color 120ms ease;
    }

    .chess-game-container[data-selected='true'] {
      outline-color: var(--affine-primary-color);
    }

    /*
     * The React bridge's anchor element is inline by default. This block
     * happens to survive that because its columns carry a flex-basis, but
     * relying on that is luck rather than design.
     */
    .chess-game-container > lit-react-portal {
      display: block;
      width: 100%;
    }

    .chess-game-placeholder {
      padding: 24px;
      text-align: center;
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
   * Hand focus to a field inside the block when the user clicks into one.
   *
   * While a block selection is live the editor host keeps pulling focus back to
   * itself, so clicking the PGN box or a comment left no caret and swallowed
   * every keystroke and paste. Selecting the block and then editing inside it
   * is the ordinary way to work here — replaying moves selects it — so the
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
    if (this.std.selection.filter(BlockSelection).length === 0) return;
    this.std.selection.clear(['block']);
  };

  override renderBlock() {
    const renderer = this.std.getOptional(ChessGameRendererIdentifier);

    return html`
      <div
        contenteditable="false"
        class="chess-game-container"
        data-selected=${this.isBlockSelected ? 'true' : 'false'}
        @focusin=${this._onFieldFocus}
      >
        ${
          renderer
            ? renderer.render(this.model)
            : html`<div class="chess-game-placeholder">
                Chess game unavailable
              </div>`
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-chess-game': ChessGameBlockComponent;
  }
}
