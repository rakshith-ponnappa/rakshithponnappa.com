// End-user journeys: the ⌘K / Ctrl+K command palette.
import { expect, test } from '../../support/fixtures';

const dialog = '[data-cmdk]';

test.describe('command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
  });

  test('⌘K / Ctrl+K opens and toggles closed; Esc closes', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator(dialog)).toBeVisible();
    await expect(page.locator('[data-cmdk-input]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator(dialog)).toBeHidden();
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator(dialog)).toBeVisible();
  });

  test('"/" opens it when not typing in a field', async ({ page }) => {
    await page.keyboard.press('/');
    await expect(page.locator(dialog)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#ask-q').focus();
    await page.keyboard.press('/');
    await expect(page.locator(dialog)).toBeHidden();
    await expect(page.locator('#ask-q')).toHaveValue('/');
  });

  test('typing filters; arrows + Enter navigate', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    const options = page.locator('[data-cmdk-list] [role="option"]');
    const all = await options.count();
    await page.locator('[data-cmdk-input]').fill('credentials');
    await expect.poll(() => options.count()).toBeLessThan(all);
    await expect(options.first()).toContainText(/Credentials/);
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await page.locator('[data-cmdk-input]').fill('projects open source');
    await expect(options.first()).toContainText(/Projects/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/projects\/$/);
  });

  test('ArrowDown moves the selection and Enter opens the selected item', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.locator('[data-cmdk-input]');
    await input.fill('evals');
    const options = page.locator('[data-cmdk-list] [role="option"]');
    await expect(options.first()).toContainText(/Evals/);
    const n = await options.count();
    test.skip(n < 2, 'needs at least two matches');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(input).toHaveAttribute('aria-activedescendant', 'cmdk-1');
  });

  test('whoami easter egg prints the identity card', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('[data-cmdk-input]').fill('whoami');
    await page.keyboard.press('Enter');
    const out = page.locator('[data-cmdk-out]');
    await expect(out).toBeVisible();
    await expect(out).toContainText('rakshith-sp');
    await expect(out).toContainText('Principal Platform Engineer');
  });

  test('sudo hire rakshith lands on /contact/?topic=hiring with Hiring preselected', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('[data-cmdk-input]').fill('sudo hire rakshith');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-cmdk-out]')).toContainText('permission granted');
    await expect(page).toHaveURL(/\/contact\/\?topic=hiring$/, { timeout: 5_000 });
    await expect(page.locator('#c-topic')).toHaveValue('Hiring');
  });
});
