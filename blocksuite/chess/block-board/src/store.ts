import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { chessBoardMarkdownAdapterExtension } from './adapters/markdown.js';
import { chessBoardPdfAdapterExtension } from './adapters/pdf.js';
import { ChessBoardBlockSchemaExtension } from './model.js';

export class ChessBoardStoreExtension extends StoreExtensionProvider {
  override name = 'affine-chess-board-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(ChessBoardBlockSchemaExtension);
    context.register(chessBoardMarkdownAdapterExtension);
    context.register(chessBoardPdfAdapterExtension);
  }
}
