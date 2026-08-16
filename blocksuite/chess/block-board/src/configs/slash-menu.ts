import { isInsideBlockByFlavour } from '@blocksuite/affine-shared/utils';
import type { SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { START_FEN } from '@blocksuite/chess-core';
import { TableIcon } from '@blocksuite/icons/lit';
import type { BlockModel } from '@blocksuite/store';

import type { BoardOrientation } from '../model';

interface InsertOptions {
  fen?: string;
  orientation?: BoardOrientation;
  editable?: boolean;
}

/** Insert a board directly after `model`. */
function insertBoardAfter(model: BlockModel, options: InsertOptions = {}) {
  const { store } = model;
  const parent = store.getParent(model);
  if (!parent) return;

  const index = parent.children.indexOf(model);
  if (index === -1) return;

  store.addBlock(
    'affine:chess-board',
    {
      fen: options.fen ?? START_FEN,
      orientation: options.orientation ?? 'white',
      editable: options.editable ?? true,
    },
    parent,
    index + 1
  );
}

/** Kings are mandatory in a legal FEN, so "empty" means kings only. */
const KINGS_ONLY_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

/** Edgeless text has no room for a board, so the items hide there. */
const notInEdgelessText = (model: BlockModel) =>
  !isInsideBlockByFlavour(model.store, model, 'affine:edgeless-text');

export const chessBoardSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'Chess board',
      description: 'Insert a position you can move pieces on.',
      icon: TableIcon(),
      searchAlias: ['chess', 'board', 'position', 'ban co', 'co vua'],
      group: '4_Content & Media@6',
      when: ({ model }) => notInEdgelessText(model),
      action: ({ model }) => insertBoardAfter(model),
    },
    {
      name: 'Chess diagram',
      description: 'Insert a fixed position readers cannot move.',
      icon: TableIcon(),
      searchAlias: ['diagram', 'fen', 'the co'],
      group: '4_Content & Media@7',
      when: ({ model }) => notInEdgelessText(model),
      action: ({ model }) => insertBoardAfter(model, { editable: false }),
    },
    {
      name: 'Empty chess board',
      description: 'Start from a bare board and place the pieces yourself.',
      icon: TableIcon(),
      searchAlias: ['empty', 'blank', 'ban co trong'],
      group: '4_Content & Media@8',
      when: ({ model }) => notInEdgelessText(model),
      action: ({ model }) => insertBoardAfter(model, { fen: KINGS_ONLY_FEN }),
    },
  ],
};
