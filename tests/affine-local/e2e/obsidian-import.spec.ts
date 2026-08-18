import { ProjectRoot, test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  getBlockSuiteEditorTitle,
  getPageByTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { ensurePagePropertiesVisible } from '@affine-test/kit/utils/properties';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { expect, type Page } from '@playwright/test';

const VAULT_PATH = ProjectRoot.join(
  'tests',
  'fixtures',
  'obsidian-vault'
).value;

/**
 * Runs the real folder import. The picker is an `<input webkitdirectory>`, so
 * Playwright can hand it a directory the same way a user picks one.
 */
async function importVault(page: Page) {
  await page.getByTestId('slider-bar-import-button').click();
  await expect(page.getByTestId('import-dialog')).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('editor-option-menu-import-obsidian').click();
  await (await chooser).setFiles(VAULT_PATH);

  await page
    .getByRole('button', { name: 'Complete' })
    .click({ timeout: 120000 });
}

async function openImportedDoc(page: Page, title: string) {
  await clickSideBarAllPageButton(page);
  await getPageByTitle(page, title).click();
  await waitForEditorLoad(page);
}

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await importVault(page);
});

test('imports vault notes and leaves the vault junk behind', async ({
  page,
}) => {
  await clickSideBarAllPageButton(page);

  await expect(getPageByTitle(page, 'Bài giảng cờ vua')).toBeVisible();
  await expect(getPageByTitle(page, 'Bài tập')).toBeVisible();
  await expect(getPageByTitle(page, 'Cor van Wijgerden')).toBeVisible();
  await expect(getPageByTitle(page, 'ebook_translate')).toBeVisible();

  // `.trash`, `.smart-env` and Dropbox conflict copies are not notes.
  await expect(getPageByTitle(page, 'deleted')).toHaveCount(0);
  await expect(getPageByTitle(page, 'tmp.24164')).toHaveCount(0);
  await expect(getPageByTitle(page, 'cache')).toHaveCount(0);
});

test('keeps a body that only looks like front matter', async ({ page }) => {
  await openImportedDoc(page, 'Bài tập');

  // Two `---` rules with `Answer: Rxe6` between them used to be parsed as YAML
  // and deleted from the doc.
  await expect(page.locator('affine-note')).toContainText('Answer: Rxe6');
  await expect(page.locator('affine-note')).toContainText('Hết bài tập.');
});

test('imports a note with its title, board, image and links', async ({
  page,
}) => {
  await openImportedDoc(page, 'Bài giảng cờ vua');

  await expect(getBlockSuiteEditorTitle(page)).toContainText(
    'Bài giảng cờ vua'
  );
  await expect(getBlockSuiteEditorTitle(page)).not.toContainText('Untitled');

  await page.waitForSelector('affine-chess-board', { timeout: 60000 });
  await expect(page.locator('affine-chess-board [data-piece]')).toHaveCount(2);
  await expect(page.locator('affine-code')).toHaveCount(0);
  await expect(page.locator('affine-image img')).toHaveCount(1);

  // Front matter keys AFFiNE has no doc meta for stay as body links.
  const note = page.locator('affine-note');
  await expect(note).toContainText('author');
  await expect(
    note.locator('affine-reference', { hasText: 'Cor van Wijgerden' })
  ).toHaveCount(1);
  await expect(
    note.locator('affine-reference', { hasText: 'ebook_translate' })
  ).toHaveCount(1);
  // A wikilink in the body still resolves to the doc it points at.
  await expect(
    note.locator('affine-reference', { hasText: 'Bài tập' })
  ).toHaveCount(1);
});

test('imports front matter tags, nested names included', async ({ page }) => {
  await openImportedDoc(page, 'Bài giảng cờ vua');
  await ensurePagePropertiesVisible(page);

  const tags = page
    .getByTestId('property-tags-value')
    .getByTestId('inline-tags-list');
  await expect(tags.locator('[data-tag-value]')).toHaveCount(2);
  await expect(tags).toContainText('language/Vietnamese');
  await expect(tags).toContainText('chess');
});
