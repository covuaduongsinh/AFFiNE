import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';
import type { TemplateResult } from 'lit';

import type { ChessGameBlockModel } from './model';

/**
 * Same seam as the board block: BlockSuite is Lit, the game viewer is React, so
 * the host app injects the concrete renderer. Without one the block shows a
 * placeholder rather than failing.
 */
export interface ChessGameRenderer {
  render(model: ChessGameBlockModel): TemplateResult;
}

export const ChessGameRendererIdentifier =
  createIdentifier<ChessGameRenderer>('ChessGameRenderer');

export function ChessGameRendererExtension(
  renderer: ChessGameRenderer
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(ChessGameRendererIdentifier, () => renderer);
    },
  };
}
