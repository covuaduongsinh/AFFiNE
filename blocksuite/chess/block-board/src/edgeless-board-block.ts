import { Bound } from '@blocksuite/global/gfx';
import { toGfxBlockComponent } from '@blocksuite/std';
import { css, html } from 'lit';

import { ChessBoardBlockComponent } from './board-block.js';
import { ChessBoardRendererIdentifier } from './renderer.js';

/**
 * A board standing on its own on the whiteboard.
 *
 * This is the demo board a coach drags around during a lesson, with the canvas
 * pen and connector tools usable straight over the top of it — the combination
 * a dedicated chess app cannot offer.
 */
export class EdgelessChessBoardBlockComponent extends toGfxBlockComponent(
  ChessBoardBlockComponent
) {
  static override styles = css`
    affine-edgeless-chess-board {
      display: block;
    }

    affine-edgeless-chess-board .chess-board-container {
      width: 100%;
      height: 100%;
    }

    /* On canvas the board fills the bound the user dragged, not the standard
       document size. */
    affine-edgeless-chess-board [data-chess-board] {
      max-width: none;
      height: 100%;
    }

    /* Same reason as the page block: the anchor is inline by default. */
    affine-edgeless-chess-board .chess-board-container > lit-react-portal {
      display: block;
      width: 100%;
      height: 100%;
    }

    /* The canvas block fills a fixed bound with the board alone; the author
       edits the position from the page view. */
    affine-edgeless-chess-board [data-chess-board-controls] {
      display: none;
    }
  `;

  override renderGfxBlock() {
    const bound = Bound.deserialize(this.model.props.xywh);
    const renderer = this.std.getOptional(ChessBoardRendererIdentifier);

    return html`
      <div
        contenteditable="false"
        class="chess-board-container"
        style=${`width:${bound.w}px;height:${bound.h}px;`}
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
    'affine-edgeless-chess-board': EdgelessChessBoardBlockComponent;
  }
}
