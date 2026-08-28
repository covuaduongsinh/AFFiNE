import {
  createIdentifier,
  type ServiceIdentifier,
} from '@blocksuite/global/di';
import type {
  BlockSnapshot,
  ExtensionType,
  FromDocSnapshotPayload,
} from '@blocksuite/store';
import type { Content } from 'pdfmake/interfaces';

/** Re-exported so a block package can type its matcher without depending on pdfmake. */
export type PdfContent = Content;

export interface BlockPdfAdapterContext {
  /** `block.props`, already narrowed to a plain record by the adapter. */
  props: Record<string, unknown>;
  /** Left indent in pt the adapter computed for this block's depth. */
  baseIndent: number;
  assets?: FromDocSnapshotPayload['assets'];
}

/**
 * Renders one block flavour into PDF content.
 *
 * Unlike the text adapters this has no `ASTWalker`, no delta converter and no
 * to-block direction: PDF is export-only and each block is independent.
 */
export interface BlockPdfAdapterMatcher {
  flavour: string;
  toContent: (
    block: BlockSnapshot,
    context: BlockPdfAdapterContext
  ) => PdfContent[] | Promise<PdfContent[]>;
}

export const BlockPdfAdapterMatcherIdentifier =
  createIdentifier<BlockPdfAdapterMatcher>('BlockPdfAdapterMatcher');

export function BlockPdfAdapterExtension(
  matcher: BlockPdfAdapterMatcher
): ExtensionType & { identifier: ServiceIdentifier<BlockPdfAdapterMatcher> } {
  const identifier = BlockPdfAdapterMatcherIdentifier(matcher.flavour);
  return {
    setup: di => {
      di.addImpl(identifier, () => matcher);
    },
    identifier,
  };
}
