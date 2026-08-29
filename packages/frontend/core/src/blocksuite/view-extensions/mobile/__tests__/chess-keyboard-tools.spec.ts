import { defaultKeyboardToolbarConfig } from '@blocksuite/affine/widgets/keyboard-toolbar';
import { describe, expect, test } from 'vitest';

import {
  buildChessKeyboardItems,
  chessToolGroup,
} from '../chess-keyboard-tools';

describe('chess entries in the mobile keyboard toolbar', () => {
  test('offers the same inserts the slash menu does', () => {
    // BlockSuite does not register the slash menu on mobile scopes, so this
    // group is the only way to put a board in a page from a phone. If an
    // insert is added to the slash menu and not here, phones quietly lose it.
    expect(chessToolGroup.items.map(item => item.name)).toEqual([
      'Chess board',
      'Chess diagram',
      'Empty chess board',
      'Chess exercise',
      'Chess game',
      'Chess game (example)',
    ]);
  });

  test('appends to the "+" panel instead of replacing the toolbar', () => {
    // The widget merges our config shallowly over the default, so returning
    // `{ items: [...] }` replaces every tool rather than adding to them. The
    // failure would be silent — chess would appear and the text tools, image
    // and everything else would vanish.
    const before = defaultKeyboardToolbarConfig.items;
    const after = buildChessKeyboardItems();

    expect(after).toHaveLength(before.length);

    const beforePanel = before[0] as { groups: { name: string }[] };
    const afterPanel = after[0] as { groups: { name: string }[] };
    expect(afterPanel.groups).toHaveLength(beforePanel.groups.length + 1);
    expect(afterPanel.groups.map(g => g.name)).toContain('Cờ vua');
    // Every original group survived, in its original order.
    expect(afterPanel.groups.slice(0, beforePanel.groups.length)).toEqual(
      beforePanel.groups
    );
  });

  test('hides an insert when the block is not in the schema', () => {
    // A workspace whose schema predates the chess blocks must not offer a
    // button that throws when tapped.
    const withoutChess = {
      std: { store: { schema: { flavourSchemaMap: new Map() } } },
    } as never;
    for (const item of chessToolGroup.items) {
      expect(item.showWhen?.(withoutChess)).toBe(false);
    }
  });
});
