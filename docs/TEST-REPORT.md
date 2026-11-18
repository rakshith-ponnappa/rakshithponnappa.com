# Test report

Consolidated QA report for rakshithponnappa.dev, 2026-11-18. Strategy: [TESTING.md](TESTING.md). Browser detail
(all engines, visual, Lighthouse): [TEST-REPORT-E2E.md](TEST-REPORT-E2E.md). Live-user personas:
[LIVE-USER-TESTING.md](LIVE-USER-TESTING.md).

Run against a fresh build of the current tree (`npx astro build --outDir ./.build-qa-r`, 32 pages, `QA_BUILD_DIR=.build-qa-r`),
Node 24, macOS, Playwright chromium. `./dist` was not touched.

## Summary by perspective

| Perspective | Suite | Pass | Fail | Notes |
|---|---|---|---|---|
| Unit | `npm test` | 78 | 0 | |
| AI (retrieval, adversarial, grounding) | `test:ai` | 106 | 0 | +2 `it.fails` pinning open bugs BUG-AI-1 and BUG-AI-2 (green while the bug exists) |
| End user (chromium, 1440×900) | `test:e2e` `--project=chromium` | 26 | 0 | 1 skip: mobile menu test on desktop. Other engines: see TEST-REPORT-E2E.md |
| Admin / ops (Worker stack, dry-run deploy, gitleaks) | `test:ops` | 24 | 0 | |
| Professional QA (axe, keyboard, motion, CSP, links, SEO) | `--project=qa` | 105 | 1 | links: `og:url` → /404/ on the 404 page (BUG-2) |
| Content / confidentiality | `test:content` | 33 | 2 | the same `TODO` hit in sources and in built HTML (BUG-3) |
| Live user (persona scripts) | `tests/personas/*.mjs` | – | – | Owned by the live-user agent; see [LIVE-USER-TESTING.md](LIVE-USER-TESTING.md) (not yet published when this report was written) |

### What each perspective covers

- **AI.** Retrieval quality on the golden set (hit@1/hit@3/MRR, refusal on negatives), adversarial prompts against the
  Worker's `/api/ask` path (prompt injection, system-prompt leaks, quota and malformed model responses fall back to
  retrieval), and grounding (citations only to allowed URLs). Two open bugs are pinned with `it.fails`.
- **End user.** Home, browse (work, projects, TOC, next/prev), ⌘K palette, Ask (in-browser BM25 fallback on the
  static target), contact form (falls back to email when `/api/*` is 404), navigation.
- **Admin / ops.** `wrangler dev --local` stack (`/api/health`, `/api/contact`, `/api/ask`), dry-run deploy, the
  status-history recorder and a gitleaks scan of the tree.
- **Professional QA.** axe on all 31 sitemap routes + the 404 in dark and light (64 scans), keyboard and focus,
  reduced motion, CSP violations on every route, every internal link and asset, SEO metadata.
- **Content / confidentiality.** Guard on `src/content/**`, `src/data/**` and the built HTML for client secrets,
  internal hostnames, placeholders (`TODO`, lorem) and similar leaks.
- **Live user.** Scripted personas (recruiter, hiring manager, client CTO, sceptical engineer, keyboard/screen-reader,
  slow mobile, non-native reader, AI crawler) in `tests/personas/`. Results live in LIVE-USER-TESTING.md.

### Test-side fixes made in this run

- `tests/e2e/user/ask.spec.ts`: stale Ask selectors updated to the current markup (4 false failures → 0).
- `tests/support/fixtures.ts` + `tests/qa/a11y.spec.ts`: new `revealAll()` scrolls to the end of the page before axe
  runs. The `.reveal` blocks use a scroll-driven animation (`animation-timeline: view()`), so off-screen blocks sit at
  partial opacity and axe measured blended colours no visitor sees (24 false `color-contrast` failures on
  `/projects/*` figure captions → 0).
- `tests/support/write-summary.mjs` + `npm run test:summary`: writes `test-results/summary.json` for `/status/`.

## Key metrics

| Area | Metric | Value | Gate |
|---|---|---|---|
| AI retrieval (33 golden + 13 negative questions, 162 chunks) | hit@1 / hit@3 / MRR | 97.0% / 100% / 0.985 | hit@3 ≥ 90% |
| | refusal on negatives / answer rate | 100% / 100% | refusal = 100% |
| JS (home, before `load`) | gzip | 7.2 KB in 6 files + 0.5 KB inline | ≤ 70 KB |
| 3D hero | gzip, lazy | 7.0 KB, not requested at 390 px or with reduced motion | lazy only |
| CSS (whole build) | gzip | 17.5 KB in 6 files | ≤ 60 KB |
| Lighthouse mobile `/` | Perf / A11y / BP / SEO | 96 / 100 / 100 / 100 | from TEST-REPORT-E2E.md |
| Lighthouse mobile case study | Perf / A11y / BP / SEO | 100 / 100 / 100 / 100 | from TEST-REPORT-E2E.md |
| Lighthouse mobile `/projects/` | Perf / A11y / BP / SEO | 100 / 98 / 100 / 100 | 98 was heading-order (since fixed; not re-measured) |
| CSP | routes with 0 violations + CSP `<meta>` | 32 / 32 | 0 violations |
| axe (WCAG 2.0–2.2 A/AA + best-practice) | scans with 0 serious/critical | 64 / 64 (32 routes × dark/light) | 0 serious/critical |

AI numbers: `test-results/ai-retrieval-metrics.json`. Bundle and Lighthouse numbers come from the prior E2E run
(TEST-REPORT-E2E.md) and were not re-measured here. The CSP and axe rows are this run and are what
`test-results/summary.json` holds, so `/status/` shows "Accessibility & CSP: Operational · axe 0 failing / 64 passing
· CSP 0 failing / 32 passing" (checked in the rebuilt `/status/` page).

The ⌘K label mismatch (old B1, `Header.astro`), the 404 canonical, heading order and long meta descriptions from
TEST-REPORT-E2E.md are fixed in this build: axe is clean on all 64 scans and the SEO spec passes.

## Open bugs (severity first)

None are Critical or High. Product code (`src/**`, `worker/**`) was not edited by QA.

**BUG-AI-2 · Medium · AI / end user.** `src/lib/retrieval.ts:134` (`isAnswerable`) and `:117` (`queryCoverage`).
Realistic paraphrases of questions the golden set answers are refused: "Can you briefly summarise TalentLens?",
"Summarize TalentLens for me", "What tech stack does TalentLens use?". Filler words that never occur in the corpus
("briefly", "summarise", "stack") get the maximum IDF, so query coverage drops below `MIN_COVERAGE` even though the
top hit is the right page. Recruiters phrase questions like this, and both the Worker and the browser fallback share
this gate. Repro: `tests/ai/retrieval-quality.test.ts:117` (`it.fails`).
Fix: ignore unseen terms that are stop/filler words (a small list: summarise/summarize, briefly, explain, tell, stack,
overview…) or cap the IDF of unseen terms at the corpus median, then re-run `test:ai` and keep refusal at 100%. Flip
the `it.fails` to `it` once green.

**BUG-AI-1 · Low (defence in depth) · AI / API.** `worker/src/prompt.ts:83` (`postProcess`). Model output is
returned as-is apart from URL stripping, so `<img onerror=…>` or `<script>` from the model reaches `/api/ask`
consumers. The site's Ask UI renders text nodes, so it is not exploitable on the site itself. Repro:
`tests/ai/adversarial.test.ts:225` (`it.fails`).
Fix: strip tags (`text.replace(/<\/?[a-z][^>]*>/gi, '')`) or escape `<`/`>` in `postProcess` before citations are
renumbered, then flip the `it.fails`.

**BUG-2 · Low · SEO / links.** `src/layouts/BaseLayout.astro:88`. The 404-canonical fix (`:71`, rendered only when
`!noindex`) didn't cover `og:url`: the 404 page still emits `<meta property="og:url" content="https://rakshithponnappa.dev/404/">`,
and that URL returns 404. Fails `tests/qa/links.spec.ts:32`.
Fix: `{!noindex && <meta property="og:url" content={canonical} />}` (same guard as the canonical).

**BUG-3 · Low · content.** `src/content/projects/talentlens.mdx:66`: "Dashboard screenshots are still a **TODO** in
the README". It describes the upstream repo, not a placeholder, but it trips the content guard's `no "TODO"` rule in
sources and in the built HTML (`tests/content/guard.test.ts`, 2 failures), and reads like unfinished copy.
Fix: reword, e.g. "The README doesn't have dashboard screenshots yet".

## How to re-run

Node 24 (`nvm use 24`). Build into a scratch dir so `./dist` is never touched, and point everything at it with
`QA_BUILD_DIR` (read by `playwright.config.ts`, `tests/support/site.ts`, `serve.mjs` and `stack.mjs`):

```sh
npx astro build --outDir ./.build-qa-r
export QA_BUILD_DIR=.build-qa-r

npm test                       # unit (vitest.config.ts)
npm run test:ai                # retrieval, adversarial, grounding
npm run test:content           # content / confidentiality guard (sources + built HTML)
npm run test:ops               # Worker stack, dry-run deploy, gitleaks

QA_RUN=qa-r-user npx playwright test --project=chromium     # end-user journeys
QA_RUN=qa-r-qa   npx playwright test --project=qa           # axe, keyboard, motion, CSP, links, SEO
QA_RUN=qa-r-qa   npm run test:summary                       # → test-results/summary.json for /status/

npm run test:perf              # bundle budgets + Lighthouse
npm run test:visual            # visual (baselines not committed; set QA_SNAPSHOT_DIR)
rm -rf .build-qa-r
```

`QA_RUN` keeps each run's Playwright output in its own `test-results/pw-<run>/` dir. Don't pass `--reporter=…` when
you need `test:summary`: it replaces the configured JSON reporter, so no `results.json` is written. Without `QA_RUN`,
`test:summary` reads `test-results/pw-static/results.json` (the config default). Build the site again after
`test:summary` so `/status/` picks up the new report.

## Update: bugs fixed after this run

| Bug | Fix | Verified by |
|---|---|---|
| BUG-AI-2 (paraphrases refused) | Request-phrasing words ("briefly", "summarise", "overview"…) added to the tokenizer stoplist; `tech` → `stack` synonym (`src/lib/retrieval.ts`) | `test:ai` paraphrase test flipped from `it.fails` to `it`: 108/108 pass; /evals still 33/33 answered, 13/13 refused |
| BUG-AI-1 (model HTML passed through) | `postProcess()` strips tags before citation handling (`worker/src/prompt.ts`) | adversarial test flipped to `it`; `npm test` 78/78 |
| BUG-2 (`og:url` on 404) | `og:url` emitted only when the page is indexable (`BaseLayout.astro`) | built `404.html` has no canonical / og:url |
| BUG-3 ("TODO" in content) | Reworded in `talentlens.mdx` | `test:content` 35/35 |

There are no open product bugs from the automated suites.
