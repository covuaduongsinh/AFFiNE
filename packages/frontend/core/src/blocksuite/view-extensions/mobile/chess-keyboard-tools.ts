import { getSelectedModelsCommand } from '@blocksuite/affine/shared/commands';
import type { ExtensionType } from '@blocksuite/affine/store';
import {
  defaultKeyboardToolbarConfig,
  KeyboardToolbarConfigExtension,
  type KeyboardToolPanelConfig,
  type KeyboardToolPanelGroup,
} from '@blocksuite/affine/widgets/keyboard-toolbar';
import {
  insertBoardAfter,
  insertExerciseAfter,
  KINGS_ONLY_FEN,
} from '@blocksuite/chess-block-board';
import {
  EMPTY_PGN,
  insertGameAfter,
  SAMPLE_PGN,
} from '@blocksuite/chess-block-game';
import { TableIcon } from '@blocksuite/icons/lit';
import type { BlockModel } from '@blocksuite/store';

/**
 * Chess inserts for the mobile keyboard toolbar.
 *
 * BlockSuite does not register the slash menu on mobile scopes
 * (widgets/slash-menu/src/view.ts:19), and the chess items live in the slash
 * menu. So on a phone there was no way to add a board to a page at all — the
 * blocks rendered, but a lesson could only be written on a desktop. The
 * keyboard toolbar is the mobile equivalent surface, and it is registered on
 * `mobile-page`, so the same inserts go there.
 *
 * The insert functions are the slash menu's own, imported rather than
 * reimplemented: two copies of "what a new chess block contains" would drift,
 * and the difference would only show up on whichever device was used less.
 */
const withSelectedModel =
  (run: (model: BlockModel) => void) =>
  ({ std }: { std: { command: { exec: (cmd: unknown) => unknown } } }) => {
    const [, ctx] = std.command.exec(getSelectedModelsCommand) as [
      unknown,
      { selectedModels?: BlockModel[] },
    ];
    const model = ctx.selectedModels?.[0];
    if (model) run(model);
  };

const hasFlavour =
  (flavour: string) =>
  ({
    std,
  }: {
    std: { store: { schema: { flavourSchemaMap: Map<string, unknown> } } };
  }) =>
    std.store.schema.flavourSchemaMap.has(flavour);

export const chessToolGroup: KeyboardToolPanelGroup = {
  name: 'Cờ vua',
  items: [
    {
      name: 'Chess board',
      icon: TableIcon(),
      showWhen: hasFlavour('affine:chess-board'),
      action: withSelectedModel(model => insertBoardAfter(model)),
    },
    {
      name: 'Chess diagram',
      icon: TableIcon(),
      showWhen: hasFlavour('affine:chess-board'),
      action: withSelectedModel(model =>
        insertBoardAfter(model, { editable: false })
      ),
    },
    {
      name: 'Empty chess board',
      icon: TableIcon(),
      showWhen: hasFlavour('affine:chess-board'),
      action: withSelectedModel(model =>
        insertBoardAfter(model, { fen: KINGS_ONLY_FEN })
      ),
    },
    {
      name: 'Chess exercise',
      icon: TableIcon(),
      showWhen: hasFlavour('affine:chess-board'),
      action: withSelectedModel(model => insertExerciseAfter(model)),
    },
    {
      name: 'Chess game',
      icon: TableIcon(),
      showWhen: hasFlavour('affine:chess-game'),
      action: withSelectedModel(model => insertGameAfter(model, EMPTY_PGN)),
    },
    {
      name: 'Chess game (example)',
      icon: TableIcon(),
      showWhen: hasFlavour('affine:chess-game'),
      action: withSelectedModel(model => insertGameAfter(model, SAMPLE_PGN)),
    },
  ],
};

/**
 * `KeyboardToolbarConfigExtension` is merged shallowly over the default
 * (keyboard-toolbar/src/widget.ts:54-58), so returning `{ items: [...] }`
 * replaces the whole toolbar rather than appending to it. Rebuild it instead:
 * the first entry is the "+" tool panel, and the chess group is appended to
 * its groups. Everything else passes through untouched.
 */
export function buildChessKeyboardItems() {
  const [panel, ...rest] = defaultKeyboardToolbarConfig.items;
  const morePanel = panel as KeyboardToolPanelConfig;
  return [
    { ...morePanel, groups: [...morePanel.groups, chessToolGroup] },
    ...rest,
  ];
}

export function ChessKeyboardToolbarExtension(): ExtensionType {
  return KeyboardToolbarConfigExtension({ items: buildChessKeyboardItems() });
}
