import { ProjectRoot, test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

/**
 * A lesson document is not one diagram, it is a hundred.
 *
 * The user's *Step 2 Trainer Manual* holds 111 chessboard fences in a single
 * note, and every board is a React root drawing 64 squares. Mounting all of
 * them to show the first screenful is work nobody asked for, so the page block
 * only mounts a board once it is near the viewport.
 *
 * This test pins that: the document must hold every block while only a
 * fraction of them have actually drawn a grid.
 */
test('a document of a hundred diagrams only draws the ones in view', async ({
  page,
}) => {
  // Importing a hundred fences and waiting for the first board is slower
  // than a single-board spec; the suite default of 30s cuts it off mid-import.
  test.setTimeout(180000);
  await openHomePage(page);
  await waitForEditorLoad(page);

  await page.getByTestId('slider-bar-import-button').click();
  await expect(page.getByTestId('import-dialog')).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('editor-option-menu-import-markdown-files').click();
  await (
    await chooser
  ).setFiles(
    ProjectRoot.join('tests', 'fixtures', 'chess-many-boards.md').value
  );

  const started = Date.now();
  await page
    .getByRole('button', { name: 'Complete' })
    .click({ timeout: 120000 });
  await page.waitForSelector('affine-chess-board [role="grid"]', {
    timeout: 120000,
  });
  const firstBoardMs = Date.now() - started;

  const blocks = await page.locator('affine-chess-board').count();
  const drawn = await page.locator('affine-chess-board [role="grid"]').count();
  // eslint-disable-next-line no-console
  console.log(
    `[chess-perf] first board in ${firstBoardMs}ms; ${drawn}/${blocks} boards drawn`
  );

  // Every fence became a block…
  expect(blocks).toBe(111);
  // …but a screenful is a handful of boards, not a hundred. The bound is loose
  // on purpose: it fails on eager mounting without policing the exact margin.
  expect(drawn).toBeLessThan(40);

  // Scrolling brings the rest in, so nothing is lost — only deferred.
  await page.locator('affine-chess-board').last().scrollIntoViewIfNeeded();
  await expect(
    page.locator('affine-chess-board').last().locator('[role="grid"]')
  ).toBeVisible({ timeout: 30000 });
});
