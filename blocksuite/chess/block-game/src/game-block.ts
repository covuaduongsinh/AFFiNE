import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { BlockSelection } from '@blocksuite/std';
import { css, html } from 'lit';

import type { ChessGameBlockModel } from './model';
import { ChessGameRendererIdentifier } from './renderer';

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

  override renderBlock() {
    const renderer = this.std.getOptional(ChessGameRendererIdentifier);

    return html`
      <div
        contenteditable="false"
        class="chess-game-container"
        data-selected=${this.isBlockSelected ? 'true' : 'false'}
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
