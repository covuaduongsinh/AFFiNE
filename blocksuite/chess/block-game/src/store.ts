import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { chessGameMarkdownAdapterExtension } from './adapters/markdown';
import { ChessGameBlockSchemaExtension } from './model';

export class ChessGameStoreExtension extends StoreExtensionProvider {
  override name = 'affine-chess-game-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(ChessGameBlockSchemaExtension);
    context.register(chessGameMarkdownAdapterExtension);
  }
}
