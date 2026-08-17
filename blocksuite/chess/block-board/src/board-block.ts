import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { BlockSelection } from '@blocksuite/std';
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

  override renderBlock() {
    const renderer = this.std.getOptional(ChessBoardRendererIdentifier);

    return html`
      <div
        contenteditable="false"
        class="chess-board-container"
        data-selected=${this.isBlockSelected ? 'true' : 'false'}
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
