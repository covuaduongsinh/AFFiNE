import {
  ActionPlacement,
  type ToolbarAction,
  type ToolbarActionGenerator,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import {
  CopyIcon,
  DeleteIcon,
  EraserIcon,
  FlipDirectionIcon,
  LockIcon,
  UnlockIcon,
} from '@blocksuite/icons/lit';
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

/**
 * Turns piece movement on or off — what separates a board from a diagram.
 *
 * Generated so the icon and tooltip reflect the current state. Boards written
 * before the `editable` prop existed store nothing for it and were always
 * meant to be movable, so only an explicit false counts as locked.
 */
const toggleMovesAction = {
  id: 'toggle-moves',
  generate(ctx) {
    const model = ctx.getCurrentModelByType(ChessBoardBlockModel);
    if (!model) return null;
    const movesEnabled = model.props.editable !== false;
    return {
      label: movesEnabled ? 'Lock moves' : 'Unlock moves',
      tooltip: movesEnabled
        ? 'Khóa di chuyển quân (thành thế cờ cố định)'
        : 'Mở khóa di chuyển quân',
      icon: movesEnabled ? UnlockIcon() : LockIcon(),
      run(cx) {
        const current = cx.getCurrentModelByType(ChessBoardBlockModel);
        if (!current) return;
        cx.store.captureSync();
        cx.store.updateBlock(current, {
          editable: current.props.editable === false,
        });
      },
    };
  },
} satisfies ToolbarActionGenerator;

/**
 * Wipes the arrows and tinted squares drawn over a position.
 *
 * Generated so it appears only on a board that has annotations: a button that
 * does nothing on most boards is noise on all of them.
 */
const clearAnnotationsAction = {
  id: 'clear-annotations',
  generate(ctx) {
    const model = ctx.getCurrentModelByType(ChessBoardBlockModel);
    if (!model) return null;
    const count =
      (model.props.arrows?.length ?? 0) + (model.props.highlights?.length ?? 0);
    if (count === 0) return null;
    return {
      label: 'Clear annotations',
      tooltip: 'Xóa mũi tên và ô đã tô',
      icon: EraserIcon(),
      run(cx) {
        const current = cx.getCurrentModelByType(ChessBoardBlockModel);
        if (!current) return;
        cx.store.captureSync();
        cx.store.updateBlock(current, { arrows: [], highlights: [] });
      },
    };
  },
} satisfies ToolbarActionGenerator;

const builtinToolbarConfig = {
  actions: [
    { id: 'a.copy-fen', actions: [copyFenAction] },
    { id: 'b.flip', actions: [flipAction] },
    { id: 'b.toggle-moves', actions: [toggleMovesAction] },
    { id: 'b.clear-annotations', actions: [clearAnnotationsAction] },
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
