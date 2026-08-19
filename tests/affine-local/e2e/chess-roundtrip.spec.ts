import { readFileSync } from 'node:fs';

import { ProjectRoot, test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickPageMoreActions,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

/** Every ```chessboard fence body in a markdown document, in order. */
function fences(markdown: string): string[] {
  return [...markdown.matchAll(/```chessboard\r?\n([\s\S]*?)```/g)].map(match =>
    match[1].replace(/\r/g, '').replace(/\n$/, '')
  );
}

/**
 * A note taken into AFFiNE and exported again must come back out unchanged.
 *
 * The vault holds 2952 of these fences and 412 `strict: false` lines; dropping
 * one turns a king-less diagram into red error text in Obsidian. The adapter
 * unit tests pin the transform, but only this test proves the whole path —
 * import, store, walker, remark — puts the same bytes back on disk.
 */
test('a document of chess fences exports the bytes it was imported from', async ({
  page,
}) => {
  const source = ProjectRoot.join(
    'tests',
    'fixtures',
    'chess-roundtrip.md'
  ).value;
  const expected = fences(readFileSync(source, 'utf8'));
  expect(expected, 'the fixture lost its fences').toHaveLength(6);

  await openHomePage(page);
  await waitForEditorLoad(page);

  await page.getByTestId('slider-bar-import-button').click();
  await expect(page.getByTestId('import-dialog')).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('editor-option-menu-import-markdown-files').click();
  await (await chooser).setFiles(source);

  await page
    .getByRole('button', { name: 'Complete' })
    .click({ timeout: 60000 });
  await page.waitForSelector('affine-chess-board', { timeout: 60000 });
  await expect(page.locator('affine-chess-board')).toHaveCount(6);

  await clickPageMoreActions(page);
  await page.getByTestId('export-menu').hover();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-to-markdown').click();
  const download = await downloadPromise;
  const exported = fences(readFileSync((await download.path())!, 'utf8'));

  expect(exported).toHaveLength(6);

  // The five written the way the plugin writes them come back untouched…
  for (const index of [0, 1, 2, 3, 4]) {
    expect(exported[index], `fence ${index + 1} was rewritten`).toBe(
      expected[index]
    );
  }

  // …and the bare FEN gains the prefix it always meant, nothing else. The
  // plugin strips that prefix anyway, so the note renders identically.
  expect(exported[5]).toBe(`fen: ${expected[5]}`);
});
