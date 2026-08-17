import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';

import { chessBoardSlashMenuConfig } from './configs/slash-menu.js';
import { effects } from './effects.js';

export class ChessBoardViewExtension extends ViewExtensionProvider {
  override name = 'affine-chess-board-block';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register([
      FlavourExtension('affine:chess-board'),
      // A board parented to the surface stands alone on the canvas; anywhere
      // else it is an inline diagram in the document flow.
      BlockViewExtension('affine:chess-board', model =>
        model.parent?.flavour === 'affine:surface'
          ? literal`affine-edgeless-chess-board`
          : literal`affine-chess-board`
      ),
    ]);

    // A slash menu only exists where there is text to type into.
    if (!this.isPreview(context.scope)) {
      context.register(
        SlashMenuConfigExtension(
          'affine:chess-board',
          chessBoardSlashMenuConfig
        )
      );
    }
  }
}
