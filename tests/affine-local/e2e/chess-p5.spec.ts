import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

const ONE_PGN = `[Event "One"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *
`;

const TWO_PGN = `[Event "First"]
[White "Anderssen"]
[Black "Kieseritzky"]
[Result "1-0"]

1. e4 e5 1-0

[Event "Second"]
[White "Morphy"]
[Black "Duke"]
[Result "1-0"]

1. e4 e5 1-0
`;

async function newDocWithFocus(page: Page, title: string) {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  await page.locator('affine-paragraph').last().click();
}

async function dropPgn(page: Page, name: string, text: string) {
  await page.locator('affine-page-root').evaluate(
    (el, payload) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([payload.text], payload.name, {
          type: 'application/x-chess-pgn',
        })
      );
      el.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
      );
    },
    { name, text }
  );
}

test('dropping a one-game PGN replaces the empty paragraph', async ({
  page,
}) => {
  await newDocWithFocus(page, 'P5 one');
  await dropPgn(page, 'one.pgn', ONE_PGN);
  await page.waitForSelector('affine-chess-game', { timeout: 30000 });
  await expect(page.locator('affine-chess-game')).toHaveCount(1);
});

test('dropping a two-game PGN opens a new doc with two boards', async ({
  page,
}) => {
  await newDocWithFocus(page, 'P5 two host');
  const urlBefore = page.url();
  await dropPgn(page, 'two.pgn', TWO_PGN);
  await page.waitForSelector('affine-chess-game', { timeout: 30000 });
  await expect(page.locator('affine-chess-game')).toHaveCount(2);
  expect(page.url()).not.toBe(urlBefore);
});

test('library tab is visible and add-to-review counts one', async ({
  page,
}) => {
  await newDocWithFocus(page, 'P5 review');
  await page.keyboard.type('/Chess game');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForSelector('affine-chess-game', { timeout: 30000 });
  await page.getByTestId('chess-library-tab-icon').click();
  await expect(page.getByTestId('chess-library-panel')).toBeVisible();
  await page
    .locator('affine-chess-game')
    .getByTestId('chess-add-review')
    .click();
  await page.getByTestId('chess-library-tab-review').click();
  await expect(page.getByTestId('chess-review-due')).toContainText('1');
});
