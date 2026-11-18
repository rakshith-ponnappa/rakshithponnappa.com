// Writes test-results/summary.json, the quality-gate report that src/lib/status.ts reads (contract: docs/STATUS.md).
// Source: a Playwright JSON report from the `qa` project (tests/qa/a11y.spec.ts + tests/qa/csp.spec.ts).
//   npm run test:summary                              # reads test-results/pw-static/results.json (playwright.config.ts default)
//   npm run test:summary -- --from test-results/pw-qa-r-qa/results.json
//   QA_RUN=qa-r-qa npm run test:summary               # same as --from test-results/pw-$QA_RUN/results.json
// The sha comes from GITHUB_SHA, then CF_PAGES_COMMIT_SHA, then "local" (same source as status.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const run = process.env.QA_RUN ?? (process.env.QA_TARGET === 'stack' ? 'stack' : 'static');
const from = resolve(arg('from') ?? `test-results/pw-${run}/results.json`);
const out = resolve(arg('out') ?? 'test-results/summary.json');

if (!existsSync(from)) {
  console.error(`write-summary: ${from} not found. Run the qa project first, e.g. npm run test:a11y.`);
  process.exit(1);
}
const report = JSON.parse(readFileSync(from, 'utf8'));

// Tally the final attempt of every test, grouped by spec file.
const tally = {};
const walk = (suite, file) => {
  const f = suite.file ?? file;
  for (const s of suite.suites ?? []) walk(s, f);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const status = t.results?.at(-1)?.status ?? 'skipped';
      if (status === 'skipped') continue;
      const key = (f ?? spec.file ?? '').split('/').pop();
      tally[key] ??= { passed: 0, failed: 0 };
      if (status === 'passed' || t.status === 'flaky') tally[key].passed++;
      else tally[key].failed++;
    }
  }
};
for (const s of report.suites ?? []) walk(s);

const summary = {
  generatedAt: new Date(report.stats?.startTime ?? Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  sha: (process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || 'local').slice(0, 7),
};
if (tally['a11y.spec.ts']) summary.a11y = tally['a11y.spec.ts'];
if (tally['csp.spec.ts']) summary.csp = tally['csp.spec.ts'];
if (!summary.a11y && !summary.csp) {
  console.error(`write-summary: ${from} has no a11y.spec.ts or csp.spec.ts results.`);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`write-summary: ${out}`, JSON.stringify(summary));
