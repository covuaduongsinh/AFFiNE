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
      display: flex;
      justify-content: center;
      /*
       * A diagram wider than about 480px stops reading as part of the document
       * and starts reading as a separate app, so the board is capped rather
       * than filling the note.
       */
      max-width: 480px;
      margin: 0 auto;
      border-radius: 4px;
      outline: 2px solid transparent;
      transition: outline-color 120ms ease;
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
