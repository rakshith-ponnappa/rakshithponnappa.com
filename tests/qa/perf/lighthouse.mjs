#!/usr/bin/env node
// Opt-in Lighthouse gate (system Chrome). Serves the QA build itself, audits /, the first case study and
// /projects/, and fails if perf < 90, a11y < 100, best-practices < 95 or SEO < 100.
//   node tests/qa/perf/lighthouse.mjs [--preset mobile|desktop] [--build ./.build-qa-b] [--port 4410]
// Results: test-results/qa-b/lighthouse.json
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { startServer } from '../../support/serve.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BUILD = resolve(arg('build', process.env.QA_BUILD_DIR || '.build-qa-b'));
const PORT = Number(arg('port', 4410));
const PRESET = arg('preset', 'mobile');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const THRESHOLDS = { performance: 90, accessibility: 100, 'best-practices': 95, seo: 100 };

if (!existsSync(join(BUILD, 'index.html'))) {
  console.error(`lighthouse.mjs: ${BUILD} missing. Run: npx astro build --outDir ./.build-qa-b`);
  process.exit(2);
}
const routes = readdirSync(BUILD)
  .filter((f) => /^sitemap-\d+\.xml$/.test(f))
  .flatMap((f) => [...readFileSync(join(BUILD, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
const study = routes.filter((r) => r.startsWith('/work/') && r !== '/work/').sort()[0];
const targets = ['/', study, '/projects/'].filter(Boolean);

const server = await startServer({ root: BUILD, port: PORT });
const chrome = await chromeLauncher.launch({ chromePath: CHROME, chromeFlags: ['--headless=new', '--no-first-run', '--disable-gpu'] });
const results = [];
let failed = false;
try {
  for (const route of targets) {
    const config = PRESET === 'desktop' ? (await import('lighthouse/core/config/desktop-config.js')).default : undefined;
    const { lhr } = await lighthouse(`http://127.0.0.1:${PORT}${route}`, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: Object.keys(THRESHOLDS) }, config);
    const scores = Object.fromEntries(Object.keys(THRESHOLDS).map((k) => [k, Math.round((lhr.categories[k]?.score ?? 0) * 100)]));
    const misses = Object.entries(THRESHOLDS).filter(([k, t]) => scores[k] < t).map(([k, t]) => `${k} ${scores[k]} < ${t}`);
    const failing = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual')
      .map((a) => ({ id: a.id, score: a.score, value: a.displayValue ?? '' }));
    const metrics = Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].map((m) => [m, lhr.audits[m]?.displayValue]));
    results.push({ route, preset: PRESET, scores, misses, metrics, failing });
    console.log(`${misses.length ? '✗' : '✓'} ${route.padEnd(40)} ${JSON.stringify(scores)}${misses.length ? '  ' + misses.join('; ') : ''}`);
    if (misses.length) failed = true;
  }
} finally {
  await chrome.kill();
  server.close();
}
mkdirSync('test-results/qa-b', { recursive: true });
writeFileSync(`test-results/qa-b/lighthouse-${PRESET}.json`, JSON.stringify({ thresholds: THRESHOLDS, results }, null, 2));
process.exit(failed ? 1 : 0);
