// AI perspective (c): what an AI crawler / LLM agent sees. File-based checks over the built site.
//   - /llms.txt follows the llms.txt shape (H1, blockquote summary, H2 sections of markdown links) and
//     every first-party link resolves to a built file;
//   - /llms-full.txt is non-empty;
//   - JSON-LD parses on every page; the home page has Person (name, url, sameAs) and ProfilePage;
//   - /resume.json has the JSON Resume basics/work/education/skills shape.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILD, PENDING_ASSETS, SITE_ORIGIN, buildFileFor, builtHtmlPages, jsonLdBlocks, requireBuild, sitemapRoutes } from '../support/site';

requireBuild();
const read = (p: string) => readFileSync(join(BUILD, p), 'utf8');

type Node = Record<string, unknown> & { '@type'?: string | string[] };
function nodes(blocks: unknown[]): Node[] {
  const out: Node[] = [];
  for (const b of blocks as Node[]) {
    const graph = (b['@graph'] as Node[] | undefined) ?? [b];
    out.push(...graph);
  }
  return out;
}
const isType = (n: Node, t: string) => (Array.isArray(n['@type']) ? n['@type'].includes(t) : n['@type'] === t);

describe('/llms.txt', () => {
  const txt = existsSync(join(BUILD, 'llms.txt')) ? read('llms.txt') : '';
  const lines = txt.split('\n');
  const links = [...txt.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map((m) => ({ label: m[1], href: m[2] }));

  it('exists and starts with exactly one H1', () => {
    expect(txt.length).toBeGreaterThan(200);
    expect(lines[0]).toMatch(/^# \S/);
    expect(lines.filter((l) => /^# /.test(l))).toHaveLength(1);
  });

  it('has a blockquote summary right after the H1', () => {
    const firstContent = lines.slice(1).find((l) => l.trim());
    expect(firstContent).toMatch(/^> \S/);
  });

  it('organises links under H2 sections, as markdown list items', () => {
    expect(lines.some((l) => /^## /.test(l))).toBe(true);
    for (const l of lines.filter((x) => /^- /.test(x))) expect(l, l).toMatch(/^- \[[^\]]+\]\([^)]+\)/);
  });

  it('lists every case study and project from the sitemap', () => {
    const hrefs = new Set(links.map((l) => l.href));
    const articles = sitemapRoutes().filter((r) => /^\/(work|projects)\/[^/]+\/$/.test(r));
    for (const r of articles) expect(hrefs, `${r} missing from llms.txt`).toContain(`${SITE_ORIGIN}${r}`);
  });

  it('every first-party link resolves to a built file', () => {
    const own = links.filter((l) => l.href.startsWith(SITE_ORIGIN) || l.href.startsWith('/'));
    expect(own.length).toBeGreaterThan(10);
    const pending: string[] = [];
    const broken: string[] = [];
    for (const { href } of own) {
      const path = new URL(href, SITE_ORIGIN).pathname;
      if (buildFileFor(path)) continue;
      (PENDING_ASSETS.includes(path) ? pending : broken).push(path);
    }
    if (pending.length) console.warn(`[llms.txt] pending assets not built yet: ${pending.join(', ')}`);
    expect(broken).toEqual([]);
  });
});

describe('/llms-full.txt', () => {
  it('is non-empty, has an H1 and covers every case study', () => {
    const txt = read('llms-full.txt');
    expect(txt.length).toBeGreaterThan(5_000);
    expect(txt.split('\n')[0]).toMatch(/^# \S/);
    for (const r of sitemapRoutes().filter((x) => /^\/work\/[^/]+\/$/.test(x))) expect(txt, r).toContain(`${SITE_ORIGIN}${r}`);
  });
});

describe('JSON-LD', () => {
  const pages = builtHtmlPages();

  it.each(pages.map((p) => [p.route, p.file]))('parses on %s', (route, file) => {
    const blocks = jsonLdBlocks(readFileSync(file, 'utf8'), route);
    expect(blocks.length, `no JSON-LD on ${route}`).toBeGreaterThan(0);
    for (const n of nodes(blocks)) expect(n['@type'], `node without @type on ${route}`).toBeTruthy();
  });

  it('home page has Person (name, url, sameAs) and ProfilePage → Person', () => {
    const all = nodes(jsonLdBlocks(read('index.html'), '/'));
    const person = all.find((n) => isType(n, 'Person'));
    expect(person, 'Person').toBeTruthy();
    expect(person!.name).toEqual(expect.any(String));
    expect(person!.url).toMatch(/^https:\/\/rakshithponnappa\.dev\/?$/);
    expect(Array.isArray(person!.sameAs) && (person!.sameAs as string[]).length).toBeGreaterThanOrEqual(2);
    for (const s of person!.sameAs as string[]) expect(s).toMatch(/^https:\/\//);
    const profile = all.find((n) => isType(n, 'ProfilePage'));
    expect(profile, 'ProfilePage').toBeTruthy();
    expect((profile!.mainEntity as Node)['@id']).toBe(person!['@id']);
  });

  it('case-study pages have a TechArticle and a BreadcrumbList', () => {
    for (const r of sitemapRoutes().filter((x) => /^\/work\/[^/]+\/$/.test(x))) {
      const all = nodes(jsonLdBlocks(readFileSync(buildFileFor(r)!, 'utf8'), r));
      expect(all.some((n) => isType(n, 'TechArticle')), `${r} TechArticle`).toBe(true);
      expect(all.some((n) => isType(n, 'BreadcrumbList')), `${r} BreadcrumbList`).toBe(true);
    }
  });
});

describe('/resume.json (JSON Resume)', () => {
  const resume = JSON.parse(read('resume.json')) as Record<string, any>;

  it('has basics with name, label, email, url and profiles', () => {
    expect(resume.basics).toMatchObject({ name: expect.any(String), label: expect.any(String), email: expect.any(String), url: expect.any(String) });
    expect(resume.basics.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    expect(resume.basics.profiles.length).toBeGreaterThan(0);
    for (const p of resume.basics.profiles) expect(p).toMatchObject({ network: expect.any(String), url: expect.stringMatching(/^https:\/\//) });
  });

  it('has work entries with name, position and ISO-ish dates', () => {
    expect(resume.work.length).toBeGreaterThan(0);
    for (const w of resume.work) {
      expect(w).toMatchObject({ name: expect.any(String), position: expect.any(String), startDate: expect.stringMatching(/^\d{4}(-\d{2}){0,2}$/) });
      if (w.endDate) expect(w.endDate).toMatch(/^\d{4}(-\d{2}){0,2}$/);
      if (w.highlights) expect(Array.isArray(w.highlights)).toBe(true);
    }
  });

  it('has education and skills in schema shape', () => {
    expect(resume.education.length).toBeGreaterThan(0);
    for (const e of resume.education) expect(e).toMatchObject({ institution: expect.any(String) });
    expect(resume.skills.length).toBeGreaterThan(0);
    for (const s of resume.skills) expect(s).toMatchObject({ name: expect.any(String), keywords: expect.any(Array) });
  });
});
