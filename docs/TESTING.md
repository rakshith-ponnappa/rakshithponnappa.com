# Testing

How rakshithponnappa.com is tested: who looks at the site, what they check, which tool does it and where it
runs. Results and open bugs are in [TEST-REPORT.md](TEST-REPORT.md) (AI, content, ops) and
[TEST-REPORT-E2E.md](TEST-REPORT-E2E.md) (E2E and professional QA).

## Strategy matrix

| Perspective | What is checked | Tool | Command | CI or local |
| --- | --- | --- | --- | --- |
| Unit (src + Worker) | BM25 retrieval, Worker routing, validation, rate-limit keys, email building | Vitest (root `vitest.config.ts`) | `npm test` | CI (every push/PR) |
| **AI**: retrieval quality | Golden set (`src/data/evals.ts`) against the **built** corpus, scored with `isAnswerable()`: hit@3 ≥ 0.95, answer rate ≥ 0.95, off-topic refusal = 100%. Metrics are written to `test-results/ai-retrieval-metrics.json` | Vitest (`tests/ai/retrieval-quality.test.ts`) | `npm run test:ai` | CI |
| **AI**: adversarial | 58 cases against the Worker handler with a mocked env: prompt injection (15 caught by the pre-filter, 4 multilingual/homoglyph cases contained by the refusal gate, delimiter break-out), output sanitisation (foreign URLs, `javascript:`/`data:` links, fake/out-of-range citations, system-prompt leaks, raw HTML), AI failure fallback (quota, empty, malformed, 15 s timeout), input validation (length, type confusion, body size, content type) | Vitest (`tests/ai/adversarial.test.ts`) | `npm run test:ai` | CI |
| **AI**: crawler view | `/llms.txt` shape (H1, blockquote, H2 link lists, every link resolves), `/llms-full.txt`, JSON-LD parses on every page with Person + ProfilePage on `/` and TechArticle + BreadcrumbList on case studies, `/resume.json` matches JSON Resume | Vitest (`tests/ai/crawler.test.ts`) | `npm run test:ai` | CI |
| End user E2E (QA-B) | Journeys: home, browse, Ask, contact, navigation, command palette across Chromium, Firefox, WebKit and mobile | Playwright (`tests/e2e/user`) | `npm run test:e2e -- --project=chromium` (CI), `npm run test:e2e:user` (all engines) | CI (Chromium); local (all engines) |
| Admin / ops | `wrangler.jsonc` bindings (ASSETS, AI, RATE_LIMITER, CONTACT_LIMITER, EMAIL), vars and limits; `public/_headers` covers `/*` and `/_astro/*` with the same security headers as the Worker; `wrangler deploy --dry-run` bundles; a full stack on `wrangler dev --local` (health, 429 + Retry-After, cross-origin and missing-Origin 403, non-JSON 415, `no-store` on API responses, static security headers); gitleaks finds no secrets; the CI/CD workflow itself (deploy gated on tests + gitleaks, main only, tested artifact, smoke test + rollback; `tests/ops/pipeline.test.ts`) | Vitest (`tests/ops/*.test.ts`), wrangler, gitleaks | `npm run test:ops` | CI (gitleaks via `gitleaks/gitleaks-action` as its own job) |
| Production smoke (post-deploy + every 6 h) | Commit is live, every sitemap page 200, key files, security headers, 404, alias-domain redirects (.dev, www), API health, Ask answer + refusal, cross-origin rejection, Turnstile enforced, no private email published | `scripts/smoke.mjs` | `node scripts/smoke.mjs` | CI deploy job (auto-rollback on failure) and `monitor.yml` |
| Professional QA (QA-B) | a11y (axe), keyboard, reduced motion, CSP, links, SEO | Playwright `qa` project (`tests/qa`) | `npm run test:a11y`, `npx playwright test --project=qa` | Local; `qa` also runs in CI today because `test:e2e` lists it |
| Professional QA: performance (QA-B) | Perf budgets + Lighthouse | Playwright `perf` project, `tests/qa/perf/lighthouse.mjs` | `npm run test:perf` | Manual: `workflow_dispatch` with `lighthouse: true` |
| Professional QA: visual (QA-B) | Screenshot regression of key pages | Playwright `visual` project | `npm run test:visual` | Manual: `workflow_dispatch` with `visual: true` |
| Live user and persona testing | Recruiter, hiring manager, keyboard/screen-reader and non-native-reader personas walk the live or local site | Scripted personas (`tests/personas`), see [LIVE-USER-TESTING.md](LIVE-USER-TESTING.md) | see LIVE-USER-TESTING.md | Local |
| Content and confidentiality | No "Meta" as a company or "OSWorld"; no IPv4 addresses (except `0.0.0.0`, `127.0.0.1`, `169.254.169.254`) or private hostnames (`*.internal`, `*.local`, `*.corp`); no email but contact@rakshithponnappa.com and no phone but +91 90354 00153; no "TODO", "lorem", "crore", "budget"; no transition framing ("moving into AI"), team head-counts or sandbox vendor names; no "M.S."/"MS"/"master" within 40 characters of "IIT Madras". Runs over `src/content/**`, `src/data/**` and the built HTML. The rules test themselves against planted violations (`tests/content/rules.test.ts`) | Vitest (`tests/content`) | `npm run test:content` | CI |
| Design quality (anti-slop) | Impeccable's deterministic detector (pinned 4.9.2) over the built HTML: AI-generated tells (gradient text, italic-serif display, glows/halos, grid backgrounds, marquees), undersized or tiny text, low contrast and more. Exceptions live in `.impeccable/config.json`: low contrast on `/resume` (the print stylesheet is evaluated against the screen theme), `tight-leading` (only large display headings use tight leading) and `cramped-padding` (misfires on bordered lists and tables whose rows and cells carry their own padding) | Impeccable CLI | `npm run test:design` (built files) and `npm run test:design:pages` (11 key pages rendered in a real browser for layout rules such as line length and kicker-above-heading) | CI |

## How to run

All commands use Node 24 (`nvm use 24`).

```sh
npm ci

# Build once for the QA suites. tests/** reads ./.build-qa by default; QA_BUILD_DIR=<dir> overrides it
# (Playwright defaults to ./.build-qa-b).
npx astro build --outDir ./.build-qa

npm test                  # unit: src/** + worker/test/**
npm run test:ai           # retrieval gate, adversarial, crawler view
npm run test:content      # content and confidentiality guard
npm run test:ops          # wrangler config, _headers, deploy dry-run, wrangler dev stack, gitleaks, pipeline
npm run test:e2e          # Playwright (QA-B)
npm run test:all          # npm test, then ai, content, ops and e2e (if defined), stopping at the first failure
```

Notes:

- `npm run test:ops` runs `wrangler deploy --dry-run` only when `./dist` exists (`npm run build`). It never contacts Cloudflare.
- The stack checks start `wrangler dev --local` through `tests/support/stack.mjs` on port 8788, or the next free port if 8788 is in use. Workers AI is remote-only, so the stack has no AI binding and `/api/ask` answers in `retrieval` mode. If wrangler dev isn't ready within 45 s, the stack tests skip with the reason. `QA_OPS_STACK=0` skips them, and `QA_OPS_PORT` picks the port.
- The gitleaks check skips when the `gitleaks` binary is missing (`brew install gitleaks`). Its config, `tests/ops/gitleaks.toml`, keeps the default rules and ignores `node_modules`, `dist`, `.build*`, `test-results` and other scratch output. To run it by hand: `gitleaks detect --no-git --source . --redact --config tests/ops/gitleaks.toml`.
- Reports go to `test-results/`: JUnit per suite (CI sets `QA_JUNIT`), `ai-retrieval-metrics.json`, `gitleaks.json` and the Playwright reports. CI uploads them as the `test-reports` artifact.
- Known product bugs that need a design change are pinned with `it.fails('[BUG-…] …')`. They pass while the bug exists and fail once it is fixed. When that happens, change them to `it(...)`. Content guard violations are never pinned: they fail until the content is fixed.

## CI

`.github/workflows/ci.yml` runs on every push and pull request, using Node 24 and `npm ci`. The steps are: build (then copy to `.build-qa`), unit tests, AI suite, content guard, ops suite, Playwright E2E (`npm run test:e2e -- --project=chromium`) and the report upload. A separate job runs `gitleaks/gitleaks-action`. Each test step runs even if an earlier test step failed, so one red suite doesn't hide another.

You can run Lighthouse and visual regression manually: **Actions → CI → Run workflow**, then tick `lighthouse` and/or `visual`.

## Updating the visual baselines

Visual baselines are not committed yet; the design is still changing. The `visual` project stores them under `QA_SNAPSHOT_DIR` (default `tests/qa/visual/__screenshots__`).

```sh
npx astro build --outDir ./.build-qa-b
# Review the change on the page first, then regenerate:
QA_SNAPSHOT_DIR=tests/qa/visual/__screenshots__ npx playwright test --project=visual --update-snapshots
# Compare against the baselines:
QA_SNAPSHOT_DIR=tests/qa/visual/__screenshots__ npm run test:visual
```

Baselines depend on the platform (`{platform}` is part of the file name). Generate the ones CI uses on Linux, for example in the `mcr.microsoft.com/playwright` container, and commit them together with the design change that caused them.
