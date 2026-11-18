// Shared, data-driven helpers. Routes are always discovered from the built sitemap, never hard-coded.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
/** Built site under test. Defaults to ./.build-qa; QA_BUILD_DIR (relative to the repo root) overrides it. */
export const BUILD = join(ROOT, process.env.QA_BUILD_DIR || '.build-qa');
export const RESULTS = join(ROOT, 'test-results');
export const SITE_ORIGIN = 'https://rakshithponnappa.dev';
export const OWNER_EMAIL = 'contact@rakshithponnappa.dev';

/**
 * Assets the owner has announced but not shipped yet. Link checks REPORT these as pending instead of
 * failing; once the file exists it is checked like any other link. Remove entries when they land.
 */
export const PENDING_ASSETS = ['/Rakshith_SP_Resume.pdf', '/site.webmanifest'];

export function requireBuild(): void {
  if (!existsSync(join(BUILD, 'index.html')))
    throw new Error(`${BUILD} is missing. Build first: npx astro build --outDir ./.build-qa (or set QA_BUILD_DIR)`);
}

/** Pathnames from <build>/sitemap-0.xml (and any further sitemap-N.xml files), e.g. "/work/foo/". */
export function sitemapRoutes(): string[] {
  requireBuild();
  const files = readdirSync(BUILD).filter((f) => /^sitemap-\d+\.xml$/.test(f));
  const out: string[] = [];
  for (const f of files) {
    const xml = readFileSync(join(BUILD, f), 'utf8');
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) out.push(new URL(m[1]).pathname);
  }
  return [...new Set(out)].sort();
}

export const routesUnder = (prefix: string) => sitemapRoutes().filter((r) => r.startsWith(prefix) && r !== prefix);
/** Case-study pages, e.g. /work/<slug>/. */
export const caseStudyRoutes = () => routesUnder('/work/');
export const projectRoutes = () => routesUnder('/projects/');

/** Every file under a directory (recursive), as absolute paths. */
export function walk(dir: string, filter: (p: string) => boolean = () => true): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

/** Built HTML pages as { route, file }, excluding the QA scratch dirs. */
export function builtHtmlPages(): { route: string; file: string }[] {
  requireBuild();
  return walk(BUILD, (p) => p.endsWith('.html') && !p.includes(`${BUILD}/dry/`) && !p.includes('/.wrangler/')).map((file) => {
    const rel = '/' + relative(BUILD, file).split('\\').join('/');
    const route = rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
    return { route, file };
  });
}

/** Map a site URL path to the file that Cloudflare assets would serve (null if none). */
export function buildFileFor(pathname: string): string | null {
  const p = decodeURIComponent(pathname.split('#')[0].split('?')[0]);
  const candidates = p.endsWith('/') ? [join(BUILD, p, 'index.html')] : [join(BUILD, p), join(BUILD, p, 'index.html'), join(BUILD, `${p}.html`)];
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** All JSON-LD blocks in an HTML document, parsed. Throws with context if one does not parse. */
export function jsonLdBlocks(html: string, where = ''): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch (e) {
      throw new Error(`JSON-LD does not parse on ${where}: ${(e as Error).message}`);
    }
  }
  return out;
}

export function slugOf(route: string): string {
  return route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-');
}
