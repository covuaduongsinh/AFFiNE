import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';
import type { TemplateResult } from 'lit';

import type { ChessBoardBlockModel } from './model';

/**
 * The block draws nothing itself.
 *
 * BlockSuite is Lit while the board UI is React, so the concrete renderer is
 * injected by the host app the same way `PdfViewExtension` injects its viewer.
 * Keeping the seam here means the board component, its piece art and its React
 * dependency all stay out of the editor packages — and a surface that has no
 * React (a plain export pipeline, say) simply does not register a renderer.
 */
export interface ChessBoardRenderer {
  render(model: ChessBoardBlockModel): TemplateResult;
}

export const ChessBoardRendererIdentifier =
  createIdentifier<ChessBoardRenderer>('ChessBoardRenderer');

export function ChessBoardRendererExtension(
  renderer: ChessBoardRenderer
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(ChessBoardRendererIdentifier, () => renderer);
    },
  };
}
