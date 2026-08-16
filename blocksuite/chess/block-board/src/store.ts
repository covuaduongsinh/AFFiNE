import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { chessBoardMarkdownAdapterExtension } from './adapters/markdown';
import { ChessBoardBlockSchemaExtension } from './model';

export class ChessBoardStoreExtension extends StoreExtensionProvider {
  override name = 'affine-chess-board-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(ChessBoardBlockSchemaExtension);
    context.register(chessBoardMarkdownAdapterExtension);
  }
}
