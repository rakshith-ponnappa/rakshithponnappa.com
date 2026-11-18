// Pro QA: bundle budgets measured from what the browser actually requests, gzipped from the build.
//   home initial JS ≤ 70 KB gz (JS requested up to the load event), no 3D hero chunk at 390 px,
//   total CSS in the build ≤ 60 KB gz. Sizes are written to test-results/qa-b/perf.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BUILD, RESULTS, walk } from '../../support/site';
import { expect, test } from '../../support/fixtures';

const KB = 1024;
const BUDGET = { homeJsGz: 70 * KB, cssGz: 60 * KB };
const HERO3D_CHUNK = /\/_astro\/(hero3d|three|webgpu)[^/]*\.js(\?|$)/;
const gz = (buf: Buffer) => gzipSync(buf, { level: 9 }).length;
const fileFor = (url: string) => join(BUILD, decodeURIComponent(new URL(url).pathname));
const OUT = join(RESULTS, 'qa-b', 'perf');
const save = (name: string, data: unknown) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
};

test.describe.configure({ mode: 'serial' });

test(`home initial JS ≤ ${BUDGET.homeJsGz / KB} KB gz`, async ({ page }) => {
  const js = new Set<string>();
  let loaded = false;
  page.on('request', (r) => {
    if (!loaded && r.resourceType() === 'script' && new URL(r.url()).origin === new URL(page.url() || r.url()).origin) js.add(r.url());
  });
  await page.goto('/', { waitUntil: 'load' });
  loaded = true;
  const files = [...js].filter((u) => u.includes('/_astro/')).map((u) => {
    const buf = readFileSync(fileFor(u));
    return { file: new URL(u).pathname, raw: buf.length, gz: gz(buf) };
  });
  const html = readFileSync(join(BUILD, 'index.html'), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/(?:ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const total = files.reduce((s, f) => s + f.gz, 0);
  const result = { files, totalGz: total, inlineScriptGz: gz(Buffer.from(inline)), budgetGz: BUDGET.homeJsGz };
  save('home-js', result);
  test.info().annotations.push({ type: 'home-js', description: `${(total / KB).toFixed(1)} KB gz in ${files.length} files (+${(result.inlineScriptGz / KB).toFixed(1)} KB inline)` });
  expect(files.length).toBeGreaterThan(0);
  expect(files.some((f) => HERO3D_CHUNK.test(f.file)), 'the 3D hero chunk must not be part of the initial load').toBe(false);
  expect(total, JSON.stringify(files, null, 2)).toBeLessThanOrEqual(BUDGET.homeJsGz);
});

test('no hero3d chunk is requested at 390 px width', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  const scripts: string[] = [];
  page.on('request', (r) => r.resourceType() === 'script' && scripts.push(new URL(r.url()).pathname));
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(3_500); // past the 2.5 s requestIdleCallback timeout that gates the import
  save('mobile-scripts', scripts);
  await ctx.close();
  expect(scripts.filter((s) => HERO3D_CHUNK.test(s))).toEqual([]);
});

test('positive control: the hero3d chunk IS lazily requested on a capable desktop', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => r.resourceType() === 'script' && scripts.push(new URL(r.url()).pathname));
  await page.goto('/', { waitUntil: 'load' });
  await expect.poll(() => scripts.some((s) => HERO3D_CHUNK.test(s)), { timeout: 8_000 }).toBe(true);
  const chunks = scripts.filter((s) => HERO3D_CHUNK.test(s)).map((f) => ({ file: f, gz: gz(readFileSync(join(BUILD, f))) }));
  save('hero3d-lazy', chunks);
  test.info().annotations.push({ type: 'hero3d-lazy', description: chunks.map((c) => `${c.file} ${(c.gz / KB).toFixed(1)} KB gz`).join(', ') });
});

test(`total CSS ≤ ${BUDGET.cssGz / KB} KB gz`, () => {
  const css = walk(join(BUILD, '_astro'), (p) => p.endsWith('.css')).map((p) => {
    const buf = readFileSync(p);
    return { file: p.slice(BUILD.length), raw: buf.length, gz: gz(buf) };
  });
  const total = css.reduce((s, f) => s + f.gz, 0);
  save('css', { files: css, totalGz: total, budgetGz: BUDGET.cssGz });
  test.info().annotations.push({ type: 'css', description: `${(total / KB).toFixed(1)} KB gz in ${css.length} files` });
  expect(css.length).toBeGreaterThan(0);
  expect(total, JSON.stringify(css, null, 2)).toBeLessThanOrEqual(BUDGET.cssGz);
});
