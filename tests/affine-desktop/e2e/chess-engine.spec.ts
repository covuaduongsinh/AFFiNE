import { test } from '@affine-test/kit/electron';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

/**
 * Desktop runner: if Arasan is packed, Analyze must move the eval bar.
 * If the binary is missing, the same unavailable UI as the web must show —
 * the suite still passes, and does not talk to the network.
 */
test("Scholar's mate analysis on desktop, or a clear unavailable panel", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await page.keyboard.type('Desktop engine');
  await page.keyboard.press('Enter');
  await page.locator('affine-paragraph').last().click();
  await page.keyboard.type('/Chess game (example');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForSelector('affine-chess-game', { timeout: 30000 });

  const game = page.locator('affine-chess-game');
  const analyze = game.getByTestId('chess-analyze');
  await expect(analyze).toBeVisible();

  if (await analyze.isDisabled()) {
    await expect(game.getByTestId('chess-engine-unavailable')).toBeVisible();
    await expect(game.getByTestId('chess-eval-bar')).toHaveCount(0);
    return;
  }

  await analyze.click();
  await expect(game.getByTestId('chess-eval-bar')).toBeVisible({
    timeout: 45_000,
  });
  await expect(game.getByTestId('chess-engine-pv')).toBeVisible();
});
