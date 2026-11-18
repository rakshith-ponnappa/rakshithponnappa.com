// Pro QA: every internal href / src / srcset / content URL in the built HTML returns 200.
// Redirect hops (e.g. a missing trailing slash) are reported as annotations, not failures.
import { readFileSync } from 'node:fs';
import { SITE_ORIGIN, builtHtmlPages } from '../support/site';
import { expect, test } from '../support/fixtures';

function internalUrls(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const add = (raw: string, from: string) => {
    const v = raw.trim().replace(/&amp;/g, '&');
    if (!v || /^(mailto:|tel:|javascript:|data:|blob:|#)/i.test(v)) return;
    let u: URL;
    try {
      u = new URL(v, `${SITE_ORIGIN}${from}`);
    } catch {
      return;
    }
    if (u.origin !== SITE_ORIGIN) return;
    const key = u.pathname + u.search;
    if (!found.has(key)) found.set(key, new Set());
    found.get(key)!.add(from);
  };
  for (const { route, file } of builtHtmlPages()) {
    const html = readFileSync(file, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (s) => (/\bsrc=/.test(s.slice(0, s.indexOf('>'))) ? s.slice(0, s.indexOf('>') + 1) : ''));
    for (const m of html.matchAll(/\s(?:href|src|poster|action)=("([^"]*)"|'([^']*)')/gi)) add(m[2] ?? m[3], route);
    for (const m of html.matchAll(/\s(?:srcset|imagesrcset)="([^"]*)"/gi)) for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0], route);
    for (const m of html.matchAll(/<meta[^>]+(?:property|name)="(?:og:image|twitter:image|og:url)"[^>]*content="([^"]+)"/gi)) add(m[1], route);
  }
  return found;
}

test('every internal link and asset in the build returns 200', async ({ request }) => {
  test.setTimeout(120_000);
  const urls = internalUrls();
  expect(urls.size).toBeGreaterThan(20);
  const broken: string[] = [];
  const redirected: string[] = [];
  const entries = [...urls.entries()];
  for (let i = 0; i < entries.length; i += 16) {
    await Promise.all(
      entries.slice(i, i + 16).map(async ([path, from]) => {
        const first = await request.get(path, { maxRedirects: 0 });
        let res = first;
        if (first.status() >= 300 && first.status() < 400) {
          redirected.push(`${path} → ${first.headers().location} (${first.status()}) from ${[...from][0]}`);
          res = await request.get(path);
        }
        if (res.status() !== 200) broken.push(`${res.status()} ${path} ← ${[...from].slice(0, 3).join(', ')}`);
      }),
    );
  }
  if (redirected.length) test.info().annotations.push({ type: 'redirects', description: redirected.join('\n') });
  test.info().annotations.push({ type: 'checked', description: `${urls.size} unique internal URLs` });
  expect(broken).toEqual([]);
});
