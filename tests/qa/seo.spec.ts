// Pro QA: SEO hygiene on every sitemap route, from the served HTML.
import { readFileSync } from 'node:fs';
import { SITE_ORIGIN, builtHtmlPages, sitemapRoutes } from '../support/site';
import { expect, test } from '../support/fixtures';

const routes = sitemapRoutes();
const attr = (html: string, re: RegExp) => html.match(re)?.[1]?.replace(/&amp;/g, '&');

test('every route has a unique title, a 50–170 char description, a self canonical, lang and a resolving og:image', async ({ request }) => {
  test.setTimeout(90_000);
  const problems: string[] = [];
  const titles = new Map<string, string[]>();
  const ogImages = new Set<string>();
  for (const route of routes) {
    const res = await request.get(route);
    expect(res.status(), route).toBe(200);
    const html = await res.text();
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? '';
    if (!title) problems.push(`${route}: missing <title>`);
    titles.set(title, [...(titles.get(title) ?? []), route]);
    const desc = attr(html, /<meta\s+name="description"\s+content="([^"]*)"/i) ?? attr(html, /<meta\s+content="([^"]*)"\s+name="description"/i);
    if (!desc) problems.push(`${route}: missing meta description`);
    else if (desc.length < 50 || desc.length > 170) problems.push(`${route}: description is ${desc.length} chars`);
    const canonical = attr(html, /<link\s+rel="canonical"\s+href="([^"]*)"/i);
    if (!canonical) problems.push(`${route}: missing canonical`);
    else if (canonical !== `${SITE_ORIGIN}${route}`) problems.push(`${route}: canonical is ${canonical}`);
    if (!/<html[^>]*\slang="[a-z]{2}(-[A-Za-z]{2})?"/.test(html)) problems.push(`${route}: missing <html lang>`);
    const og = attr(html, /<meta\s+property="og:image"\s+content="([^"]*)"/i);
    if (!og) problems.push(`${route}: missing og:image`);
    else if (!og.startsWith(SITE_ORIGIN)) problems.push(`${route}: og:image is not absolute on ${SITE_ORIGIN}: ${og}`);
    else ogImages.add(new URL(og).pathname);
  }
  for (const [t, rs] of titles) if (rs.length > 1) problems.push(`duplicate title "${t}" on ${rs.join(', ')}`);
  for (const img of ogImages) {
    const r = await request.get(img);
    if (r.status() !== 200 || !/^image\//.test(r.headers()['content-type'] ?? '')) problems.push(`og:image ${img} → ${r.status()} ${r.headers()['content-type']}`);
  }
  expect(problems).toEqual([]);
});

test('the sitemap covers every indexable HTML route except the 404', () => {
  const inSitemap = new Set(routes);
  const missing: string[] = [];
  const noindexListed: string[] = [];
  for (const { route, file } of builtHtmlPages()) {
    if (route === '/404.html') continue;
    const noindex = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(readFileSync(file, 'utf8'));
    if (noindex && inSitemap.has(route)) noindexListed.push(route);
    if (!noindex && !inSitemap.has(route)) missing.push(route);
  }
  expect(missing, 'HTML pages missing from the sitemap').toEqual([]);
  expect(noindexListed, 'noindex pages listed in the sitemap').toEqual([]);
  expect(inSitemap.has('/404.html') || inSitemap.has('/404/')).toBe(false);
});

test('robots.txt points at the sitemap index', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  const sm = robots.match(/^Sitemap:\s*(\S+)/im)?.[1];
  expect(sm).toBeTruthy();
  expect((await request.get(new URL(sm!).pathname)).status()).toBe(200);
});
