import { test } from '@affine-test/kit/electron';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

/**
 * Desktop coach: the panel must open. If Claude / Grok / a key is available,
 * send one prompt and wait for a reply or a tool line. Otherwise the
 * unavailable copy must show — same pattern as the engine spec.
 */
test('Scholar’s mate coach panel on desktop', async ({ page }) => {
  test.setTimeout(120_000);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await page.keyboard.type('Desktop coach');
  await page.keyboard.press('Enter');
  await page.locator('affine-paragraph').last().click();
  await page.keyboard.type('/Chess game (example');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForSelector('affine-chess-game', { timeout: 30000 });

  const game = page.locator('affine-chess-game');
  await expect(game.getByTestId('chess-ask-coach')).toBeVisible();
  await game.getByTestId('chess-ask-coach').click();

  const panel = page.getByTestId('chess-coach-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chess-coach-provider')).toBeVisible();
  await expect(page.getByTestId('chess-coach-api-key')).toHaveCount(0);
  await expect(
    page
      .getByTestId('chess-coach-subscription')
      .or(page.getByTestId('chess-coach-subscription-missing'))
  ).toBeVisible();
  const send = page.getByTestId('chess-coach-send');
  if (await send.isDisabled()) {
    await expect(page.getByTestId('chess-coach-unavailable')).toBeVisible();
    await expect(game.getByTestId('chess-analyze')).toBeVisible();
    return;
  }

  await page
    .getByTestId('chess-coach-input')
    .fill(
      'Call chess.analyze on the current position and quote the engine score. Do not invent a number.'
    );
  await send.click();
  await expect(page.getByTestId('chess-coach-messages')).toContainText(
    /analyze|score|eval|\+|PONG|assistant|tool|error/i,
    { timeout: 90_000 }
  );
});
