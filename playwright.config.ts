// Playwright config for the end-user + pro-QA suite. See docs/TEST-REPORT-E2E.md.
//   Build first:  npx astro build --outDir ./.build-qa-b   (or QA_BUILD_DIR=<dir>)
//   QA_TARGET=static (default) → user journeys hit the static build on :4400 (tests/support/serve.mjs, /api/* = 404)
//   QA_TARGET=stack            → user journeys + ops hit `wrangler dev --local` on :8788 (tests/support/stack.mjs)
// QA projects (a11y, keyboard, motion, CSP, links, SEO, perf, visual) always run against the static build.
// tests/personas/** belongs to the live-user-testing agent and is not part of this config.
import { defineConfig, devices } from '@playwright/test';

process.env.QA_BUILD_DIR ||= '.build-qa-b';
const BUILD_DIR = process.env.QA_BUILD_DIR;
const STATIC_PORT = Number(process.env.QA_STATIC_PORT ?? 4400);
const STACK_PORT = Number(process.env.QA_STACK_PORT ?? 8788);
const TLS_PORT = Number(process.env.QA_TLS_PORT ?? STATIC_PORT + 43);
const STATIC_URL = `http://127.0.0.1:${STATIC_PORT}`;
// WebKit honours the CSP `upgrade-insecure-requests` even on 127.0.0.1, so it gets the same build over TLS.
const TLS_URL = `https://127.0.0.1:${TLS_PORT}`;
const STACK_URL = `http://127.0.0.1:${STACK_PORT}`;
const target = process.env.QA_TARGET === 'stack' ? 'stack' : 'static';
const userURL = target === 'stack' ? STACK_URL : STATIC_URL;
const webkitUse = target === 'stack' ? { baseURL: STACK_URL } : { baseURL: TLS_URL, ignoreHTTPSErrors: true };
const CI = !!process.env.CI;
const desktop = { viewport: { width: 1440, height: 900 } };
const chrome = { ...devices['Desktop Chrome'], ...desktop, baseURL: STATIC_URL };
// Visual baselines are NOT committed yet (design wave in flight); QA_SNAPSHOT_DIR points them elsewhere.
const SNAP_DIR = process.env.QA_SNAPSHOT_DIR ?? '{testDir}/__screenshots__';

export default defineConfig({
  // Per-run output dirs so concurrent runs (QA_RUN=user / qa / perf …) never wipe each other's artifacts.
  outputDir: `test-results/pw-${process.env.QA_RUN ?? target}/artifacts`,
  snapshotPathTemplate: `${SNAP_DIR}/{testFileName}/{arg}-{projectName}-{platform}{ext}`,
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : 4,
  timeout: 45_000,
  expect: { timeout: 7_000, toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' } },
  reporter: [
    ['list'],
    ['json', { outputFile: `test-results/pw-${process.env.QA_RUN ?? target}/results.json` }],
    ['html', { outputFolder: `test-results/pw-${process.env.QA_RUN ?? target}/report`, open: 'never' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    colorScheme: 'dark',
    locale: 'en-GB',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    // End-user journeys (tests/e2e/user) across engines and devices.
    { name: 'chromium', testDir: 'tests/e2e/user', use: { ...devices['Desktop Chrome'], ...desktop, baseURL: userURL } },
    { name: 'firefox', testDir: 'tests/e2e/user', use: { ...devices['Desktop Firefox'], ...desktop, baseURL: userURL } },
    { name: 'webkit', testDir: 'tests/e2e/user', use: { ...devices['Desktop Safari'], ...desktop, ...webkitUse } },
    { name: 'mobile-chrome', testDir: 'tests/e2e/user', use: { ...devices['Pixel 7'], baseURL: userURL } },
    { name: 'mobile-safari', testDir: 'tests/e2e/user', use: { ...devices['iPhone 14'], ...webkitUse } },

    // Professional QA (chromium, static build). perf + visual are opt-in (test:perf, test:visual).
    { name: 'qa', testDir: 'tests/qa', testIgnore: ['perf/**', 'visual/**'], use: chrome },
    { name: 'perf', testDir: 'tests/qa/perf', testMatch: /\.spec\.ts$/, use: chrome },
    { name: 'visual', testDir: 'tests/qa/visual', testMatch: /\.spec\.ts$/, use: chrome },

    // Operator checks against the Worker (wrangler dev). Requires QA_TARGET=stack.
    { name: 'ops', testDir: 'tests/ops', testMatch: /\.spec\.ts$/, use: { baseURL: STACK_URL } },
  ],
  webServer: [
    {
      command: `node tests/support/serve.mjs --root ${BUILD_DIR} --port ${STATIC_PORT}`,
      url: `${STATIC_URL}/`,
      // Never silently reuse someone else's server on this port: it may serve a different build.
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: `node tests/support/serve.mjs --root ${BUILD_DIR} --port ${TLS_PORT} --https`,
      url: `${TLS_URL}/`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 20_000,
    },
    ...(target === 'stack'
      ? [
          {
            command: `node tests/support/stack.mjs --port ${STACK_PORT}`,
            url: `${STACK_URL}/api/health`,
            reuseExistingServer: !CI,
            timeout: 90_000,
            stdout: 'ignore' as const,
            stderr: 'pipe' as const,
          },
        ]
      : []),
  ],
});
