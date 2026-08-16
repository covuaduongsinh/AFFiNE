import { isInsideBlockByFlavour } from '@blocksuite/affine-shared/utils';
import type { SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { TableIcon } from '@blocksuite/icons/lit';
import type { BlockModel } from '@blocksuite/store';

import { EMPTY_PGN } from '../model';

/** A short illustrative game so a fresh block is not a blank rectangle. */
const SAMPLE_PGN = `[Event "Scholar's mate"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? {Guarding f7 was essential.} 4. Qxf7# 1-0
`;

function insertGameAfter(model: BlockModel, pgn: string) {
  const { store } = model;
  const parent = store.getParent(model);
  if (!parent) return;

  const index = parent.children.indexOf(model);
  if (index === -1) return;

  store.addBlock(
    'affine:chess-game',
    { pgn, currentPath: [], orientation: 'white' },
    parent,
    index + 1
  );
}

const notInEdgelessText = (model: BlockModel) =>
  !isInsideBlockByFlavour(model.store, model, 'affine:edgeless-text');

export const chessGameSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'Chess game',
      description: 'Replay and annotate a game, variations included.',
      icon: TableIcon(),
      searchAlias: ['pgn', 'game', 'van dau', 'van co'],
      group: '4_Content & Media@9',
      when: ({ model }) => notInEdgelessText(model),
      action: ({ model }) => insertGameAfter(model, EMPTY_PGN),
    },
    {
      name: 'Chess game (example)',
      description: 'Insert a short annotated game to start from.',
      icon: TableIcon(),
      searchAlias: ['example', 'sample', 'vi du'],
      group: '4_Content & Media@10',
      when: ({ model }) => notInEdgelessText(model),
      action: ({ model }) => insertGameAfter(model, SAMPLE_PGN),
    },
  ],
};
