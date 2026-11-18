# E2E + pro-QA test report (QA-B)

Run 2026-11-18, Node 24, Playwright 1.65.1, target: `npx astro build --outDir ./.build-qa-b` (32 pages, routes taken from `sitemap-0.xml`)
served by `tests/support/serve.mjs` (Cloudflare-like: auto-trailing-slash, `404.html`, `/api/*` → 404 so the BM25 and mailto
fallbacks run). WebKit projects get the same build over TLS (`--https`, self-signed) because WebKit applies the CSP
`upgrade-insecure-requests` even on 127.0.0.1, so every subresource broke over plain HTTP. That's a test-environment artifact, not a product bug.

Scripts: `test:e2e:build`, `test:e2e` (user × 5 projects + `qa`), `test:e2e:user`, `test:a11y`, `test:visual`, `test:perf` (budgets + Lighthouse).

## Results

| Project | Scope | Pass | Fail | Skip | Notes |
|---|---|---|---|---|---|
| chromium (1440×900) | user journeys | 26 | 0 | 1 | |
| webkit (1440×900, TLS) | user journeys | 26 | 0 | 1 | |
| mobile-chrome (Pixel 7) | user journeys | 27 | 0 | 0 | |
| mobile-safari (iPhone 14, TLS) | user journeys | 27 | 0 | 0 | |
| firefox (1440×900) | user journeys | 0 | 27 | 0 | **Environment blocker**: Firefox 1572 won't launch on this host ("Could not find profile folder"), even with a project-local TMPDIR. No test ran, so no product signal. |
| qa (chromium) | a11y, keyboard, motion, CSP, links, SEO | 40 | 66 | 0 | 64 axe failures share one root cause (B1). The other two are links (B2) and SEO (B3). |
| perf (chromium) | bundle budgets | 4 | 0 | 0 | |
| visual (chromium) | harness proof | 20 + 20 | 0 | 0 | Generated 20 baselines into a scratch dir, compared them green, then deleted them. No baselines are committed. |
| Lighthouse (mobile, system Chrome) | /, a case study, /projects/ | 2 | 1 | – | /projects/ a11y 98 (B4) |

Skips: only the mobile-menu test, on the two desktop projects. Retries: 0. No flaky tests were seen across repeated runs (webkit/mobile-safari ran twice, the visual baselines were regenerated and compared twice). `test-results/` was cleared by a concurrent agent, so these counts come from the line reporter.

## Axe (WCAG 2.0/2.1/2.2 A+AA + best-practice), every sitemap route + 404, dark and light
| Impact | Rule | Where | Count |
|---|---|---|---|
| serious | label-content-name-mismatch | `.cmdk-trigger` (header, every page) | 64/64 scans |
| moderate | heading-order | /projects/ (card `h3` after `h1`), /work/ (`.row h3`), /credentials/ (`#cg-AI`) | 6 |

## CSP
A `securitypolicyviolation` listener was installed with addInitScript on all 32 routes (31 sitemap routes + 404). The home route also waited for the idle-loaded 3D hero to mount. Result: **0 violations** and a CSP `<meta>` on every page.

## Bundle sizes (gzip -9, measured from what the browser requested)
- Home initial JS (requested before `load`): **7.2 KB gz** in 6 files, plus 0.5 KB of inline script. Budget: 70 KB.
- 3D hero: `hero3d.*.js` is lazy (7.0 KB gz), requested only after load on capable desktops. **Not requested at 390 px** or with reduced motion.
- Total CSS in the build: **17.5 KB gz** in 6 files. Budget: 60 KB.

## Lighthouse (mobile preset, `node tests/qa/perf/lighthouse.mjs`)
| Route | Perf | A11y | BP | SEO |
|---|---|---|---|---|
| / | 96 | 100 | 100 | 100 |
| /work/ado-to-harness-migration/ | 100 | 100 | 100 | 100 |
| /projects/ | 100 | **98** | 100 | 100 |

## Product bugs (severity first)
**B1 · Serious · a11y (WCAG 2.5.3 Label in Name)**: `src/components/Header.astro:32`. The visible text of the ⌘K trigger is "Search or ask ⌘K/Ctrl K" (the `kbd` is aria-hidden but still visible), and the accessible name is `aria-label="Search or ask"`. Axe flags it on every page in both themes.
Repro: `npm run test:a11y`. Fix: drop the `aria-label` and let the visible `.cmdk-hint` text name the button. Alternatively, put the shortcut in `aria-keyshortcuts="Meta+K Control+K"` and make the label start with the visible text.

**B2 · Low · SEO/links**: `src/layouts/BaseLayout.astro:29,69`. The 404 page (`noindex`) emits `<link rel="canonical" href="https://rakshithponnappa.dev/404/">`, and that URL itself returns 404. The link check fails on it.
Fix: render the canonical (and `og:url`) only when `!noindex`.

**B3 · Low · SEO**: Meta descriptions are too long on 20 routes: `/` (224 chars), `/projects/` (189), 9 project pages (181–223) and all 9 case studies (229–375). Search engines truncate at about 160 chars.
Source: `BaseLayout.astro:21` (the default description) and the `description`/`summary` frontmatter in `src/content/**`. Fix: write 50–160-char descriptions, or derive them from a dedicated short field.

**B4 · Low · a11y (moderate)**: `heading-order`. The card titles skip from `h1` to `h3` on `/projects/` (`src/components/ProjectGrid.astro`), `/work/` (`src/components/WorkList.astro`) and `/credentials/` (`#cg-AI`, `src/components/CertWall.astro`). This costs Lighthouse a11y 2 points on /projects/.
Fix: use `h2` (or add a visually-hidden `h2` section heading).

**Note (not a bug):** the ⌘K `<dialog>` is a native modal. Tab cycles between the dialog and the browser chrome and never reaches the inert page, and Esc returns focus to the trigger or the previously focused element. That is the accepted native behaviour, so the tests pass.

## Test-side fixes made while continuing the previous agent's work
- The build dir is now `.build-qa-b` via `QA_BUILD_DIR`. Run outputs go to per-run dirs (`test-results/pw-<QA_RUN>/`), so concurrent runs no longer wipe each other's artifacts.
- `reuseExistingServer: false`, so the suite never silently tests another agent's server.
- Contact: the API now sends `topic` separately. The test was updated to match.
- Theme: wait for the view-transition commit before reloading (this was a race).
- Prev/next: rewind to the series start through "← previous" before walking it. The series order isn't alphabetical.
- Résumé PDF: the PDF now ships, so the skip became a hard assertion.
- CSP: no `networkidle`, because /status/ polls. Motion: only perceptible animations (>1 ms) count.
