import type { ElementOrFactory } from '@affine/component';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import {
  type ChessBoardBlockModel,
  ChessBoardRendererExtension,
} from '@blocksuite/chess-block-board';
import {
  type ChessGameBlockModel,
  ChessGameRendererExtension,
} from '@blocksuite/chess-block-game';
import { html, type TemplateResult } from 'lit';
import { z } from 'zod';

import { ChessBoardView } from './chess-board-view';
import { ChessGameView } from './chess-game-view';
import { ChessPasteWatcher } from './paste';

const optionsSchema = z.object({
  enableChess: z.boolean().optional(),
  reactToLit: z.optional(
    z
      .function()
      .args(z.custom<ElementOrFactory>(), z.boolean().optional())
      .returns(z.custom<TemplateResult>())
  ),
});

type ChessViewOptions = z.infer<typeof optionsSchema>;

/**
 * Supplies the React board to the Lit block.
 *
 * The block package deliberately ships no renderer, so without this extension a
 * chess board renders a placeholder. That keeps React — and the piece art — out
 * of the editor packages entirely.
 */
export class ChessViewExtension extends ViewExtensionProvider<ChessViewOptions> {
  override name = 'affine-chess-view';

  override schema = optionsSchema;

  override setup(context: ViewExtensionContext, options?: ChessViewOptions) {
    super.setup(context, options);

    const reactToLit = options?.reactToLit;
    if (options?.enableChess === false || !reactToLit) return;

    // `false` on both: the views subscribe to the model's signals themselves,
    // so they re-render on their own and do not need the portal rebuilt on
    // every Lit update.
    context.register(
      ChessBoardRendererExtension({
        render: (model: ChessBoardBlockModel) =>
          html`${reactToLit(<ChessBoardView model={model} />, false)}`,
      })
    );

    context.register(
      ChessGameRendererExtension({
        render: (model: ChessGameBlockModel) =>
          html`${reactToLit(<ChessGameView model={model} />, false)}`,
      })
    );

    // Pasting only makes sense where the document is editable. Registering
    // here — after the root block's own clipboard watcher — is what gives this
    // handler the chance to run first.
    if (!this.isPreview(context.scope)) {
      context.register(ChessPasteWatcher);
    }
  }
}
