import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SAMPLE_PGN = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#';

/**
 * Asserts a board is genuinely on screen.
 *
 * Counting `[data-piece]` is not enough and was how a real bug shipped: a
 * container without a definite width collapsed the board to zero pixels, so the
 * DOM held all 64 squares and 32 pieces while the user saw nothing. Anything
 * that claims a board rendered has to check its measured size.
 */
async function expectVisibleBoard(page: Page, host: string) {
  const board = page.locator(`${host} [role="grid"]`).first();
  await expect(board).toBeVisible({ timeout: 30000 });

  const box = await board.boundingBox();
  expect(box, 'the board has no layout box').not.toBeNull();
  expect(box!.width, 'the board collapsed horizontally').toBeGreaterThan(200);
  expect(box!.height, 'the board collapsed vertically').toBeGreaterThan(200);
  // A board is square; a wildly off ratio means the aspect rule broke.
  expect(Math.abs(box!.width - box!.height)).toBeLessThan(4);

  await expect(page.locator(`${host} [role="gridcell"]`)).toHaveCount(64);
}

/** Open a new doc with the caret in an empty body paragraph. */
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
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForSelector(host, { timeout: 30000 });
}

test('a chess board inserted from the slash menu is actually visible', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Board');
  await slashInsert(page, 'Chess board', 'affine-chess-board');
  await expectVisibleBoard(page, 'affine-chess-board');
  await expect(page.locator('affine-chess-board [data-piece]')).toHaveCount(32);
});

test('a chess diagram is visible too', async ({ page }) => {
  await newDocWithFocus(page, 'Diagram');
  await slashInsert(page, 'Chess diagram', 'affine-chess-board');
  await expectVisibleBoard(page, 'affine-chess-board');
});

test('pieces move on a legal move and stay put on an illegal one', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Moving');
  await slashInsert(page, 'Chess board', 'affine-chess-board');
  await expectVisibleBoard(page, 'affine-chess-board');

  const square = (name: string) =>
    page.locator(`affine-chess-board [role="gridcell"][data-square="${name}"]`);
  const pieceOn = (name: string) =>
    page.locator(`affine-chess-board [data-piece][data-square="${name}"]`);

  await square('e2').click();
  await square('e4').click();
  await expect(pieceOn('e4')).toHaveCount(1);
  await expect(pieceOn('e2')).toHaveCount(0);

  // The a1 rook is boxed in by its own pawn.
  await square('a1').click();
  await square('a5').click();
  await expect(pieceOn('a5')).toHaveCount(0);
});

test('a pasted FEN becomes a board', async ({ page }) => {
  await newDocWithFocus(page, 'Paste FEN');
  await page.evaluate(fen => navigator.clipboard.writeText(fen), START_FEN);
  await page.keyboard.press('ControlOrMeta+v');

  await expectVisibleBoard(page, 'affine-chess-board');
});

test('a pasted PGN becomes a game with its annotations', async ({ page }) => {
  await newDocWithFocus(page, 'Paste PGN');
  await page.evaluate(pgn => navigator.clipboard.writeText(pgn), SAMPLE_PGN);
  await page.keyboard.press('ControlOrMeta+v');

  await page.waitForSelector('affine-chess-game', { timeout: 30000 });
  await expectVisibleBoard(page, 'affine-chess-game');
  const text = page.locator('affine-chess-game');
  await expect(text).toContainText('Qxf7');
  await expect(text).toContainText('Nf6');
});

test('prose that merely mentions chess is left alone', async ({ page }) => {
  await newDocWithFocus(page, 'Prose');
  await page.evaluate(() =>
    navigator.clipboard.writeText('I played e4 and he answered e5.')
  );
  await page.keyboard.press('ControlOrMeta+v');

  await page.waitForTimeout(1500);
  await expect(page.locator('affine-chess-board')).toHaveCount(0);
  await expect(page.locator('affine-chess-game')).toHaveCount(0);
  await expect(page.locator('affine-paragraph')).toContainText('I played e4');
});

test('the example game replays through its move list', async ({ page }) => {
  await newDocWithFocus(page, 'Game');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');
  await expectVisibleBoard(page, 'affine-chess-game');

  const game = page.locator('affine-chess-game');
  await expect(game).toContainText('Guarding f7');

  const pieceOn = (name: string) =>
    page.locator(`affine-chess-game [data-piece][data-square="${name}"]`);

  await game.locator('button[title="End"]').click();
  await expect(pieceOn('e4')).toHaveCount(1);

  await game.locator('button[title="Start"]').click();
  await expect(pieceOn('e4')).toHaveCount(0);
  await expect(pieceOn('e2')).toHaveCount(1);
});
