import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

/**
 * Web CI for P2 analysis: the panel must render, stay disabled, and say the
 * engine lives on desktop. No IPC, no network, no crash.
 */
async function newDocWithFocus(page: Page, title: string) {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  await page.locator('affine-paragraph').last().click();
}

async function slashInsert(page: Page, item: string, host: string) {
  await page.keyboard.type(`/${item}`);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForSelector(host, { timeout: 30000 });
}

test('a chess game shows a disabled analysis panel on the web', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Engine web');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');

  const game = page.locator('affine-chess-game');
  await expect(game.getByTestId('chess-analyze')).toBeVisible();
  await expect(game.getByTestId('chess-analyze')).toBeDisabled();
  await expect(game.getByTestId('chess-scan')).toBeDisabled();
  await expect(game.getByTestId('chess-stop')).toBeDisabled();
  await expect(game.getByTestId('chess-apply-pgn')).toBeDisabled();
  await expect(game.getByTestId('chess-engine-unavailable')).toHaveText(
    'Offline analysis is available in the desktop app'
  );
  await expect(game.getByTestId('chess-eval-bar')).toHaveCount(0);
  await expect(game.getByTestId('chess-engine-pv')).toHaveCount(0);

  // The example game is still a game: Scholar's mate text must survive.
  await expect(game).toContainText('Qxf7');
  await expect(page.locator('affine-paragraph').last()).toBeVisible();
});

test('the chess coach panel is visible and chat is disabled on the web', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Coach web');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');

  const game = page.locator('affine-chess-game');
  await expect(game.getByTestId('chess-ask-coach')).toBeVisible();
  await game.getByTestId('chess-ask-coach').click();

  const panel = page.getByTestId('chess-coach-panel');
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('chess-coach-unavailable')).toBeVisible();
  await expect(page.getByTestId('chess-coach-input')).toBeDisabled();
  await expect(page.getByTestId('chess-coach-send')).toBeDisabled();
});

test('a chess board analyze button is disabled on the web', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Board engine web');
  await slashInsert(page, 'Chess board', 'affine-chess-board');

  const board = page.locator('affine-chess-board');
  await expect(board.getByTestId('chess-board-analyze')).toBeDisabled();
  await expect(board.getByTestId('chess-board-stop')).toBeDisabled();
  await expect(board.getByTestId('chess-eval-bar')).toHaveCount(0);
  await expect(board.locator('[data-piece]')).toHaveCount(32);
});
