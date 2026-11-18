// Pro QA: visual regression harness. Baselines are NOT committed yet (design wave in flight).
// Generate:  QA_SNAPSHOT_DIR=<dir> npx playwright test --project=visual --update-snapshots
// Compare:   QA_SNAPSHOT_DIR=<dir> npx playwright test --project=visual
// Pages come from the sitemap (first case study is picked dynamically); dynamic regions are masked.
import { caseStudyRoutes, sitemapRoutes } from '../../support/site';
import { expect, settle, test, useTheme } from '../../support/fixtures';

const all = new Set(sitemapRoutes());
const pages = ['/', '/work/', caseStudyRoutes()[0], '/contact/', '/evals/'].filter((r): r is string => !!r && all.has(r));
const widths = [1440, 390] as const;
const DYNAMIC = ['[data-uptime]', '[data-clock]', '[data-hero3d]', 'canvas', 'time', '[data-build]', '[data-sha]', '[data-live]', '[data-status-live]'];

for (const theme of ['dark', 'light'] as const)
  for (const width of widths)
    test.describe(`${theme} @${width}`, () => {
      test.use({ colorScheme: theme, reducedMotion: 'reduce', viewport: { width, height: width > 900 ? 900 : 844 } });
      for (const route of pages)
        test(route, async ({ page }) => {
          await useTheme(page, theme);
          await page.goto(route);
          await settle(page);
          await expect(page).toHaveScreenshot(`${route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/\//g, '_')}-${theme}-${width}.png`, {
            fullPage: true,
            mask: DYNAMIC.map((s) => page.locator(s)),
            timeout: 15_000,
          });
        });
    });
