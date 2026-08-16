import type { ElementOrFactory } from '@affine/component';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import {
  type ChessBoardBlockModel,
  ChessBoardRendererExtension,
} from '@blocksuite/chess-block-board';
import { html, type TemplateResult } from 'lit';
import { z } from 'zod';

import { ChessBoardView } from './chess-board-view';

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

    context.register(
      ChessBoardRendererExtension({
        // `false`: the view subscribes to the model's signals itself, so it
        // re-renders on its own and does not need the portal rebuilt on every
        // Lit update.
        render: (model: ChessBoardBlockModel) =>
          html`${reactToLit(<ChessBoardView model={model} />, false)}`,
      })
    );
  }
}
