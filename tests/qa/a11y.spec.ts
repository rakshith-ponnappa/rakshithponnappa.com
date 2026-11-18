// Pro QA: axe-core on EVERY sitemap route (plus the 404) in dark AND light. Gate: zero serious/critical.
// Findings of every impact are written to test-results/qa-b/a11y/*.json for the report.
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESULTS, sitemapRoutes, slugOf } from '../support/site';
import { expect, revealAll, settle, test, useTheme } from '../support/fixtures';

const OUT = join(RESULTS, 'qa-b', 'a11y');
const routes = [...sitemapRoutes(), '/404.html'];

for (const theme of ['dark', 'light'] as const) {
  test.describe(`axe (${theme})`, () => {
    test.use({ colorScheme: theme });
    for (const route of routes) {
      test(`${route}`, async ({ page }) => {
        await useTheme(page, theme);
        await page.goto(route);
        await settle(page);
        await revealAll(page);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .exclude('[data-hero3d]')
          .analyze();
        const findings = violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
          summary: v.nodes[0]?.failureSummary?.split('\n').slice(0, 3).join(' '),
        }));
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, `${slugOf(route)}-${theme}.json`), JSON.stringify({ route, theme, findings }, null, 2));
        const blocking = findings.filter((f) => f.impact === 'serious' || f.impact === 'critical');
        expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
      });
    }
  });
}
