import {
  ActionPlacement,
  type ToolbarAction,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { CopyIcon, DeleteIcon } from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';

import { ChessGameBlockModel } from '../model.js';

/**
 * Hover actions for a game.
 *
 * Copying the PGN is the counterpart to pasting one, and it is what makes an
 * annotated game portable: the text that leaves here opens in any chess tool.
 * Editing lives inside the block itself, next to the board it changes.
 */
const copyPgnAction = {
  id: 'copy-pgn',
  label: 'Copy PGN',
  tooltip: 'Copy PGN',
  icon: CopyIcon(),
  run(ctx) {
    const model = ctx.getCurrentModelByType(ChessGameBlockModel);
    if (!model) return;
    navigator.clipboard.writeText(model.props.pgn).catch(console.error);
  },
} satisfies ToolbarAction;

const builtinToolbarConfig = {
  actions: [
    { id: 'a.copy-pgn', actions: [copyPgnAction] },
    {
      placement: ActionPlacement.More,
      id: 'b.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const model = ctx.getCurrentModelByType(ChessGameBlockModel);
        if (!model) return;
        ctx.store.deleteBlock(model);
        ctx.select('note');
        ctx.reset();
      },
    } satisfies ToolbarAction,
  ],
} as const satisfies ToolbarModuleConfig;

export const createChessGameToolbarExtension = (
  flavour: string
): ExtensionType[] => [
  ToolbarModuleExtension({
    id: BlockFlavourIdentifier(flavour),
    config: builtinToolbarConfig,
  }),
];
