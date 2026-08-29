import { isInsideBlockByFlavour } from '@blocksuite/affine-shared/utils';
import type { SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { START_FEN } from '@blocksuite/chess-core';
import { TableIcon } from '@blocksuite/icons/lit';
import { type BlockModel, Text } from '@blocksuite/store';

import type { BoardOrientation } from '../model.js';

interface InsertOptions {
  fen?: string;
  orientation?: BoardOrientation;
  editable?: boolean;
}

/** Insert a board directly after `model`. */
export function insertBoardAfter(
  model: BlockModel,
  options: InsertOptions = {}
) {
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

/**
 * Insert the skeleton of a lesson exercise after `model`: a fixed diagram,
 * the question, and the answer behind a collapsed heading.
 *
 * Building this by hand is four separate steps every single time, and the
 * step most often skipped is the one that matters — hiding the answer, so the
 * student meets the position before the solution.
 *
 * A collapsed heading is what hides it. `affine:list` still accepts a
 * `toggle` type but the model marks it deprecated; a heading collapses its
 * following siblings instead, and travels to Markdown as a plain heading, so
 * the exercise survives a trip back out to Obsidian.
 */
export function insertExerciseAfter(model: BlockModel) {
  const { store } = model;
  const parent = store.getParent(model);
  if (!parent) return;

  const index = parent.children.indexOf(model);
  if (index === -1) return;

  store.addBlock(
    'affine:chess-board',
    { fen: START_FEN, orientation: 'white', editable: false },
    parent,
    index + 1
  );
  store.addBlock(
    'affine:paragraph',
    { type: 'text', text: new Text('Câu hỏi: ') },
    parent,
    index + 2
  );
  store.addBlock(
    'affine:paragraph',
    { type: 'h4', text: new Text('Đáp án'), collapsed: true },
    parent,
    index + 3
  );
  store.addBlock(
    'affine:paragraph',
    { type: 'text', text: new Text('Lời giải: ') },
    parent,
    index + 4
  );
}

/** Kings are mandatory in a legal FEN, so "empty" means kings only. */
export const KINGS_ONLY_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

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
    {
      name: 'Chess exercise',
      description: 'Insert a diagram, a question and a hidden answer.',
      icon: TableIcon(),
      searchAlias: ['exercise', 'bai tap', 'cau hoi', 'dap an', 'puzzle'],
      group: '4_Content & Media@9',
      when: ({ model }) => notInEdgelessText(model),
      action: ({ model }) => insertExerciseAfter(model),
    },
  ],
};
