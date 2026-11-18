// End-user journeys: home page, 404, résumé PDF.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD } from '../../support/site';
import { expect, test } from '../../support/fixtures';

test.describe('home', () => {
  test('renders the name from the Person JSON-LD, the availability line and the CTA row', async ({ page }) => {
    await page.goto('/');
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
    const person = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'Person');
    await expect(page.locator('h1#hero-name')).toHaveText(person.alternateName ?? person.name);
    await expect(page).toHaveTitle(new RegExp(person.alternateName ?? person.name));
    const pill = page.locator('.hero .status');
    await expect(pill).toBeVisible();
    await expect(pill).toContainText(/Open to new roles/i);
    await expect(page.locator('.hero')).not.toContainText(/systems operational/i);
    await expect(page.locator('.hero .ctas a[href="/contact/"]')).toBeVisible();
  });

  test('the live uptime ticks', async ({ page }) => {
    await page.goto('/');
    const hms = page.locator('[data-uptime] [data-u="hms"]');
    await expect(hms).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const before = await hms.textContent();
    await expect(hms).not.toHaveText(before!, { timeout: 3_000 });
    await expect(page.locator('[data-uptime] [data-u="y"]')).toHaveText(/^1\d$/);
  });

  test('the IST clock renders a time', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero time[data-clock]')).toHaveText(/^\d{2}:\d{2}$/);
  });
});

test('an unknown URL shows the 404 page with a 404 status', async ({ page }) => {
  const res = await page.goto('/this/route/does-not-exist-qa');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('404');
  await expect(page.locator('[data-path]')).toHaveText('/this/route/does-not-exist-qa');
  await page.locator('.routes a[href="/"]').click();
  await expect(page).toHaveURL(/\/$/);
});

test('the résumé PDF link returns 200 application/pdf', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('.hero a[download]').getAttribute('href');
  expect(href).toMatch(/\.pdf$/);
  expect(existsSync(join(BUILD, href!)), `${href} must ship in the build`).toBe(true);
  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
});
