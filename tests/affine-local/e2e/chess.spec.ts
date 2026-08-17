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
  // Give the menu time to finish filtering: pressing Enter mid-filter picks
  // whatever was highlighted before the query narrowed.
  await page.waitForTimeout(1000);
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
  // Assert against the note rather than a paragraph: the text may land across
  // more than one, and what matters is that it survived as text.
  await expect(page.locator('affine-note')).toContainText('I played e4');
});

test('a position is the same size standing alone as inside a game', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Sizes');
  await slashInsert(page, 'Chess board', 'affine-chess-board');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');

  const measure = async (host: string) => {
    const box = await page
      .locator(`${host} [role="grid"]`)
      .first()
      .boundingBox();
    expect(box, `${host} has no layout box`).not.toBeNull();
    return box!.width;
  };

  const alone = await measure('affine-chess-board');
  const inGame = await measure('affine-chess-game');

  // Boards used to be 480 standing alone and 361 inside a game, so the same
  // position changed size as you scrolled a lesson.
  expect(Math.abs(alone - inGame)).toBeLessThan(2);
});

test('the PGN editor replaces the game', async ({ page }) => {
  await newDocWithFocus(page, 'Edit PGN');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');
  const game = page.locator('affine-chess-game');
  await expect(game).toContainText('Qxf7');

  await game.getByTestId('chess-edit-toggle').click();
  const editor = game.getByTestId('chess-pgn-editor');
  await expect(editor).toBeVisible();

  // Click and type for real. `fill()` sets the value straight on the DOM, and
  // `pressSequentially()` focuses its target first, so both sail past the bug
  // this guards: clicking the box never moved the caret into it, leaving the
  // editor visible but impossible to type in.
  await editor.click();
  await expect(editor, 'clicking the PGN box did not focus it').toBeFocused();

  await editor.press('ControlOrMeta+a');
  await editor.pressSequentially('1. d4 d5 2. c4 e6 *', { delay: 30 });
  await expect(editor).toHaveValue('1. d4 d5 2. c4 e6 *');

  await game.getByTestId('chess-pgn-save').click();

  await expect(game).toContainText('d4');
  await expect(game).toContainText('c4');
  await expect(game).not.toContainText('Qxf7');
});

test('opening the editor puts the caret in the box, with no click at all', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Autofocus');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');
  const game = page.locator('affine-chess-game');

  // Pressing the edit button means wanting to type. Not needing the click also
  // means the caret never depends on the browser granting focus from one.
  await game.getByTestId('chess-edit-toggle').click();
  const editor = game.getByTestId('chess-pgn-editor');
  await expect(editor).toBeFocused();

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('1. c4 e5 *', { delay: 30 });
  await expect(editor).toHaveValue('1. c4 e5 *');

  await game.getByTestId('chess-pgn-save').click();
  await expect(game).toContainText('c4');
});

test('the PGN box takes the caret while the block is selected', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Selected block');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');
  const game = page.locator('affine-chess-game');

  await game.getByTestId('chess-edit-toggle').click();
  const editor = game.getByTestId('chess-pgn-editor');
  await expect(editor).toBeVisible();

  // Replaying a game selects the block, so this is the state a user is
  // normally in by the time they open the editor. A live block selection kept
  // focus pinned to the editor host: the box showed no caret and swallowed
  // every keystroke and paste, while the buttons around it still worked.
  await game.locator('[role="grid"]').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('affine-block-selection')).not.toHaveCount(0);

  await editor.click();
  await expect(editor, 'the PGN box never took the caret').toBeFocused();

  // Type with the keyboard alone: no locator call that would focus it for us.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('1. f4 e5 *', { delay: 30 });
  await expect(editor).toHaveValue('1. f4 e5 *');

  await game.getByTestId('chess-pgn-save').click();
  await expect(game).toContainText('f4');
});

test('a PGN pasted into the editor lands in the box', async ({ page }) => {
  await newDocWithFocus(page, 'Paste into editor');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');
  const game = page.locator('affine-chess-game');

  await game.getByTestId('chess-edit-toggle').click();
  const editor = game.getByTestId('chess-pgn-editor');
  await editor.click();
  await editor.press('ControlOrMeta+a');

  // Copying a game off Lichess and pasting it in is the whole point of the box.
  // The editor's own clipboard handler listens on `document` and used to claim
  // this paste, so the text never arrived and the box sat there unchanged.
  await page.evaluate(() =>
    navigator.clipboard.writeText('[Event "Pasted"]\n\n1. d4 Nf6 2. c4 e6 *')
  );
  await page.keyboard.press('ControlOrMeta+v');

  await expect(editor).toHaveValue(/1\. d4 Nf6 2\. c4 e6/);
  // And exactly one game: the paste must not spawn a second block.
  await expect(page.locator('affine-chess-game')).toHaveCount(1);

  await game.getByTestId('chess-pgn-save').click();
  await expect(game).toContainText('Nf6');
  await expect(game).not.toContainText('Qxf7');
});

test('a PGN that will not parse keeps the text and offers a fix', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Broken PGN');
  await slashInsert(page, 'Chess game', 'affine-chess-game');
  const game = page.locator('affine-chess-game');

  await game.getByTestId('chess-edit-toggle').click();
  const editor = game.getByTestId('chess-pgn-editor');
  // e5 is not a legal first move for White.
  await editor.fill('1. e5 e4 *');

  // Save must refuse, and the text must survive so it can be corrected.
  await expect(game.getByTestId('chess-pgn-save')).toBeDisabled();
  await expect(editor).toHaveValue('1. e5 e4 *');

  await editor.fill('1. e4 e5 *');
  await expect(game.getByTestId('chess-pgn-save')).toBeEnabled();
  await game.getByTestId('chess-pgn-save').click();
  await expect(game).toContainText('e4');
});

test('arrow keys inside the editor move the caret, not the game', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Editor keys');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');
  const game = page.locator('affine-chess-game');

  await game.getByTestId('chess-edit-toggle').click();
  const editor = game.getByTestId('chess-pgn-editor');
  await editor.click();
  await editor.press('ArrowRight');
  await editor.press('ArrowRight');

  // The board must still be at the start: no move was stepped into.
  await expect(
    page.locator('affine-chess-game [data-piece][data-square="e2"]')
  ).toHaveCount(1);
});

test('pasting a PGN onto a game replaces it instead of adding another', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Paste over');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');
  await expect(page.locator('affine-chess-game')).toContainText('Qxf7');

  // Select the block itself, then paste.
  await page.locator('affine-chess-game [role="grid"]').first().click();
  await page.evaluate(() => navigator.clipboard.writeText('1. d4 Nf6 2. c4 *'));
  await page.keyboard.press('ControlOrMeta+v');

  await expect(page.locator('affine-chess-game')).toHaveCount(1);
  await expect(page.locator('affine-chess-game')).toContainText('Nf6');
  await expect(page.locator('affine-chess-game')).not.toContainText('Qxf7');
});

test('a move can be annotated with a symbol and a comment', async ({
  page,
}) => {
  await newDocWithFocus(page, 'Annotate');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');
  const game = page.locator('affine-chess-game');

  // Select the first move so the annotation tools appear.
  await game.getByText('e4', { exact: true }).first().click();
  await game.getByTitle('Brilliant').click();

  const comment = game.getByTestId('chess-comment-input');
  await comment.click();
  // A human types at human speed. With no delay the app, still syncing, drops
  // the odd keystroke and the assertion fails on a character that never got in.
  await comment.pressSequentially('The best start.', { delay: 30 });
  await expect(comment).toHaveValue('The best start.');
  await comment.press('Enter');

  await expect(game).toContainText('!!');
  await expect(game).toContainText('The best start.');
});

test('a variation can be promoted to the main line', async ({ page }) => {
  await newDocWithFocus(page, 'Promote');
  await slashInsert(page, 'Chess game', 'affine-chess-game');
  const game = page.locator('affine-chess-game');

  await game.getByTestId('chess-edit-toggle').click();
  await game
    .getByTestId('chess-pgn-editor')
    .fill('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *');
  await game.getByTestId('chess-pgn-save').click();
  await expect(game).toContainText('c5');

  // Select the sideline, then promote it.
  await game.getByText('c5', { exact: true }).first().click();
  await game.getByTestId('chess-promote').click();

  // The promoted move now leads, so the old main line is the one in brackets.
  await game.getByTestId('chess-edit-toggle').click();
  await expect(game.getByTestId('chess-pgn-editor')).toHaveValue(/1\. e4 c5/);
});

test('deleting from a move can be undone', async ({ page }) => {
  await newDocWithFocus(page, 'Undo delete');
  await slashInsert(page, 'Chess game (example', 'affine-chess-game');
  const game = page.locator('affine-chess-game');
  await expect(game).toContainText('Qxf7');

  await game.getByText(/^Nf6/).first().click();
  await game.getByTestId('chess-delete-from').click();
  await expect(game).not.toContainText('Qxf7');

  // Every edit needs its own undo step. Without one the edit merged into the
  // block's own insertion, so a single Ctrl+Z removed the whole block instead
  // of putting the moves back — the game was simply gone.
  await page.locator('affine-paragraph').first().click();
  await page.keyboard.press('ControlOrMeta+z');

  await expect(page.locator('affine-chess-game')).toHaveCount(1);
  await expect(page.locator('affine-chess-game')).toContainText('Qxf7');
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
