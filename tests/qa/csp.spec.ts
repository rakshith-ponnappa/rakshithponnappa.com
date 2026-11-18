// Pro QA: zero Content-Security-Policy violations on every route (listener installed before any script).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESULTS, sitemapRoutes, slugOf } from '../support/site';
import { cspViolations, expect, recordCsp, test } from '../support/fixtures';

const routes = [...sitemapRoutes(), '/404.html'];

for (const route of routes) {
  test(`no CSP violations on ${route}`, async ({ page }) => {
    const consoleCsp: string[] = [];
    page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && consoleCsp.push(m.text()));
    await recordCsp(page);
    await page.goto(route);
    await page.waitForLoadState('load');
    // Some pages poll (/status/), so never wait for networkidle; give idle-time work (3D hero) time to run.
    await page.waitForTimeout(route === '/' ? 3_500 : 750);
    const meta = await page.locator('meta[http-equiv="content-security-policy" i]').getAttribute('content');
    expect(meta, 'a CSP <meta> tag is present').toBeTruthy();
    const v = await cspViolations(page);
    mkdirSync(join(RESULTS, 'qa-b', 'csp'), { recursive: true });
    writeFileSync(join(RESULTS, 'qa-b', 'csp', `${slugOf(route)}.json`), JSON.stringify({ route, violations: v, console: consoleCsp, policy: meta }, null, 2));
    expect(v, JSON.stringify(v, null, 2)).toEqual([]);
    expect(consoleCsp).toEqual([]);
  });
}
