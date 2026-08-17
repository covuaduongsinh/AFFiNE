import {
  ActionPlacement,
  type ToolbarAction,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { CopyIcon, DeleteIcon, FlipDirectionIcon } from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';

import { ChessBoardBlockModel } from '../model.js';

/**
 * Hover actions for a board.
 *
 * Copying the FEN is the counterpart to pasting one: it is how a position
 * leaves this document for an engine, a Lichess study or a message to a
 * student.
 */
const copyFenAction = {
  id: 'copy-fen',
  label: 'Copy FEN',
  tooltip: 'Copy FEN',
  icon: CopyIcon(),
  run(ctx) {
    const model = ctx.getCurrentModelByType(ChessBoardBlockModel);
    if (!model) return;
    navigator.clipboard.writeText(model.props.fen).catch(console.error);
  },
} satisfies ToolbarAction;

const flipAction = {
  id: 'flip-board',
  label: 'Flip board',
  tooltip: 'Flip board',
  icon: FlipDirectionIcon(),
  run(ctx) {
    const model = ctx.getCurrentModelByType(ChessBoardBlockModel);
    if (!model) return;
    ctx.store.updateBlock(model, {
      orientation: model.props.orientation === 'white' ? 'black' : 'white',
    });
  },
} satisfies ToolbarAction;

const builtinToolbarConfig = {
  actions: [
    { id: 'a.copy-fen', actions: [copyFenAction] },
    { id: 'b.flip', actions: [flipAction] },
    {
      placement: ActionPlacement.More,
      id: 'c.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const model = ctx.getCurrentModelByType(ChessBoardBlockModel);
        if (!model) return;
        ctx.store.deleteBlock(model);
        ctx.select('note');
        ctx.reset();
      },
    } satisfies ToolbarAction,
  ],
} as const satisfies ToolbarModuleConfig;

export const createChessBoardToolbarExtension = (
  flavour: string
): ExtensionType[] => [
  ToolbarModuleExtension({
    id: BlockFlavourIdentifier(flavour),
    config: builtinToolbarConfig,
  }),
];
