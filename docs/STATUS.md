# Status page

`/status/` is a status page whose states are computed, not declared. Every row is backed by build data or by a live
check in the visitor's browser. If something can't be measured, the page says "not measured" instead of guessing.

| File | Role |
| --- | --- |
| `src/lib/status.ts` | Computes components, the overall state and the history slots at build time (`getStatus()`). |
| `src/pages/status.astro` | The page: banner, component rows, deploy strip, incidents and method notes. Also runs the edge check. |
| `src/components/StatusStrip.astro` | Compact strip (overall state + the last N bars) for the home page. Optional `n` prop, default 30. |
| `scripts/status-record.mjs` | Appends the current build to `public/status-history.json`. Run by CI after the build. |
| `public/status-history.json` | Per-deploy history, oldest first, 90 entries max. Ships with the site as `/status-history.json`. |

## Component states

States are `operational`, `degraded`, `down` and `not-configured` (shown as "Not measured").

| Component | Group | Source | Rule |
| --- | --- | --- | --- |
| Ask the runbook (retrieval) | build | `runEvals()` in `src/lib/evals.ts` (the run behind `/evals/`) | degraded if hit@3 < 0.9 or refusal rate < 1 (`HIT3_MIN`, `REFUSAL_MIN`) |
| Content corpus | build | `buildCorpus()` in `src/lib/corpus.ts`: chunk count and version hash | down if there are 0 chunks |
| Case studies | build | `work` collection count | down if empty |
| Open-source projects | build | `projects` collection count | down if empty |
| Résumé PDF | build | `fs` check for `public/Rakshith_SP_Resume.pdf` | degraded if missing (the HTML résumé still serves) |
| Contact API, Ask API (LLM) | edge | browser `GET /api/health`, 4 s timeout | see below |
| Accessibility & CSP | gate | `test-results/summary.json`, if present | see below |

**Overall** is computed from the build and gate components that were measured: any `down` gives "Major outage" (all
down) or "Partial outage"; any `degraded` gives "Partial degradation"; otherwise "All systems operational".
`not-configured` rows don't count either way. The headline appears in the footer and on `/status/` only. The home hero
shows availability ("Open to new roles") instead, because visitors shouldn't mistake a site-health line for anything about them.

### Edge components

The Contact and Ask APIs run on the Cloudflare Worker, so a static build can't know their state. They render as
"Not checked". The page's bundled script then calls `/api/health` (no-store, 4 s abort):

- a 2xx response with `{"status":"ok"}` marks them **Operational** and shows the latency and the Worker's corpus version
  (flagging it if it differs from this build's corpus);
- anything else (HTTP error, timeout, network failure) shows **Static mode**, meaning the fallback is active: the
  ticket form falls back to email and Ask runs the BM25 index in the browser.

A fallback is a degraded mode, so it also downgrades an "All systems operational" headline to "Partial degradation"
in the browser. It never upgrades a headline. Without JavaScript the rows stay "Not checked".

### Quality gate report contract

`src/lib/status.ts` reads `test-results/summary.json` at build time. Expected shape (all fields optional):

```json
{
  "generatedAt": "2026-11-18T06:00:00Z",
  "sha": "abc1234",
  "a11y": { "passed": 32, "failed": 0 },
  "csp": { "passed": 32, "failed": 0 }
}
```

`a11y` may also be named `axe` or `accessibility`. Each section may use `violations` instead of `failed`, or a
boolean `pass`. Any failure makes the row degraded. If the report's `sha` differs from the current build, the row
says which build it came from. If the file or both sections are missing, the row says "not measured in this build".

`npm run test:summary` (`tests/support/write-summary.mjs`) writes this file from the Playwright JSON report of the `qa`
project (`a11y.spec.ts` and `csp.spec.ts`). Use `QA_RUN=<run>` or `--from <results.json>` to pick the report. See
docs/TEST-REPORT.md.

## Deploy history

Each entry is `{sha, date, hit1, hit3, mrr, refusal, chunks}`. A bar is **passing** when it meets the same retrieval
gates as above (hit@3 ≥ 0.9 and refusal ≥ 1), otherwise **degraded**. The strip always has 90 slots (30 on phones);
slots without an entry render as "no data", which means no deploy was recorded, not downtime.

At build time the page merges the recorded history with the current build (same sha source as the script, so a
re-recorded sha is replaced, not duplicated). Bars are SVG `<rect>`s with `data-state`, a `<title>` and an
`aria-label`; recorded bars are focusable, and hovering or focusing one shows its details in the readout. A table
under "Show history as a table" carries the same data.

### Recording

```sh
npm run build
npm run status:record                 # reads dist/status/index.html, updates public/ and dist/status-history.json
npm run status:record -- --dist out   # another build directory
```

The script reads the JSON snapshot that `/status/` embeds (`<script type="application/json" data-status-snapshot>`),
so it records exactly the numbers that build computed. The sha comes from `GITHUB_SHA`, then `CF_PAGES_COMMIT_SHA`,
then `local` (first 7 characters). One entry per sha: re-running replaces it. The list is sorted by date and capped
at 90. It writes `public/status-history.json` and the copy in the build output, so the deploy ships its own entry.

### CI

The history must survive between builds. Either commit `public/status-history.json`, or pull the deployed copy
before building so nothing has to be committed:

```yaml
- run: node scripts/status-record.mjs --pull https://rakshithponnappa.dev/status-history.json || true
- run: npm run build
- run: npm run status:record
- run: npx wrangler deploy
```

`--pull` merges the remote entries into `public/status-history.json` (local entries win for the same sha). It's
best-effort: if the site is unreachable the build continues with the local file.

Nothing is backfilled. The file was seeded with one real entry from a local build (`sha: "local"`); every later
entry comes from CI.
