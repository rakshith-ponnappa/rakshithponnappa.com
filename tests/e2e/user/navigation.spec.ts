// End-user journeys: primary navigation (desktop nav or mobile menu) and the mobile menu popover.
import { expect, isMobile, test } from '../../support/fixtures';

test('navigates to every primary page and marks it aria-current', async ({ page }) => {
  await page.goto('/');
  const primary = page.locator('nav[aria-label="Primary"] a');
  const hrefs = await primary.evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThanOrEqual(4);

  for (const href of hrefs) {
    if (isMobile(page)) {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.locator('#mobile-nav').getByRole('link').and(page.locator(`[href="${href}"]`)).click();
    } else {
      await page.locator(`nav[aria-label="Primary"] a[href="${href}"]`).click();
    }
    await expect(page).toHaveURL(new RegExp(`${href.replace(/\//g, '\\/')}$`));
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator(`nav[aria-label="Primary"] a[href="${href}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('nav[aria-label="Primary"] a[aria-current="page"]')).toHaveCount(1);
  }
});

test('the mobile menu popover opens and closes', async ({ page }) => {
  test.skip(!isMobile(page), 'mobile menu is only shown below 900 px');
  await page.goto('/');
  const menu = page.locator('#mobile-nav');
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Contact' })).toBeVisible();
  await menu.getByRole('button', { name: 'Close menu' }).click();
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});
