import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';

import { chessGameSlashMenuConfig } from './configs/slash-menu.js';
import { createChessGameToolbarExtension } from './configs/toolbar.js';
import { effects } from './effects.js';

export class ChessGameViewExtension extends ViewExtensionProvider {
  override name = 'affine-chess-game-block';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register([
      FlavourExtension('affine:chess-game'),
      BlockViewExtension('affine:chess-game', literal`affine-chess-game`),
      ...createChessGameToolbarExtension('affine:chess-game'),
    ]);

    if (!this.isPreview(context.scope)) {
      context.register(
        SlashMenuConfigExtension('affine:chess-game', chessGameSlashMenuConfig)
      );
    }
  }
}
