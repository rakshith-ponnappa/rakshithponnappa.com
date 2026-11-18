// End-user journeys: theme toggle, project filter, case-study TOC and prev/next. Data-driven from the sitemap.
import { readFileSync } from 'node:fs';
import { buildFileFor, caseStudyRoutes } from '../../support/site';
import { expect, test } from '../../support/fixtures';

test('the theme toggle flips the theme and persists across reload', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle colour theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#/);
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.goto('/work/');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Toggle colour theme' }).click();
  // The toggle runs inside a view transition: wait for it to commit before reloading.
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('the project category filter hides and shows cards', async ({ page }) => {
  await page.goto('/projects/');
  const cards = page.locator('.catalog li[data-cat]');
  const total = await cards.count();
  expect(total).toBeGreaterThan(1);
  const cats = await page.locator('[data-cat-filter]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).filter((v) => v !== 'all'));
  expect(cats.length).toBeGreaterThan(0);

  for (const cat of cats) {
    await page.locator(`label:has([data-cat-filter="${cat}"])`).click();
    const expected = await page.locator(`.catalog li[data-cat="${cat}"]`).count();
    await expect(page.locator(`.catalog li[data-cat="${cat}"]`).first()).toBeVisible();
    await expect(page.locator(`.catalog li[data-cat]:not([data-cat="${cat}"])`).first()).toBeHidden();
    // The count badge on the filter matches what is shown.
    await expect(page.locator(`label:has([data-cat-filter="${cat}"]) .n`)).toHaveText(String(expected));
  }
  await page.locator('label:has([data-cat-filter="all"])').click();
  for (let i = 0; i < total; i++) await expect(cards.nth(i)).toBeVisible();
});

// Pick the first case study that has a TOC and a "next" link, straight from the built HTML.
const studies = caseStudyRoutes();
const withToc = studies.find((r) => /data-toc=/.test(readFileSync(buildFileFor(r)!, 'utf8')));

test('the case-study TOC anchor jumps to its section', async ({ page }) => {
  test.skip(!withToc, 'no case study with a TOC in the build');
  await page.goto(withToc!);
  const toc = page.locator('nav[aria-label="On this page"] a[data-toc]');
  const n = await toc.count();
  expect(n).toBeGreaterThan(1);
  const link = toc.nth(Math.min(2, n - 1));
  const slug = await link.getAttribute('data-toc');
  if (await link.isVisible()) await link.click();
  else await page.goto(`${withToc}#${slug}`); // TOC sidebar is hidden on narrow screens
  await expect(page).toHaveURL(new RegExp(`#${slug}$`));
  const heading = page.locator(`[data-prose] h2[id="${slug}"]`);
  await expect(heading).toBeInViewport();
});

test('case-study prev/next links walk the whole series', async ({ page }) => {
  test.skip(studies.length < 2, 'fewer than two case studies');
  const pager = page.getByRole('navigation', { name: 'More' });
  const nextLink = () => pager.getByRole('link', { name: /next →/ });
  const prevLink = () => pager.getByRole('link', { name: /← previous/ });
  const here = () => new URL(page.url()).pathname;
  // Rewind to the start of the series, then walk forward through every study.
  await page.goto(studies[0]);
  for (let i = 0; i < studies.length && (await prevLink().count()); i++) {
    const href = (await prevLink().getAttribute('href'))!;
    await prevLink().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  }
  await expect(prevLink()).toHaveCount(0);
  const visited = [here()];
  while (await nextLink().count()) {
    const href = (await nextLink().getAttribute('href'))!;
    await nextLink().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    visited.push(href);
    expect(visited.length, `series loops: ${visited.join(' → ')}`).toBeLessThanOrEqual(studies.length);
  }
  expect([...visited].sort()).toEqual([...studies].sort());
  await expect(prevLink()).toHaveAttribute('href', visited[visited.length - 2]);
  await prevLink().click();
  await expect(page).toHaveURL(new RegExp(`${visited[visited.length - 2]}$`));
});
