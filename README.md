# rakshithponnappa.com

[![CI/CD](https://github.com/rakshith-ponnappa/rakshithponnappa.com/actions/workflows/ci.yml/badge.svg)](https://github.com/rakshith-ponnappa/rakshithponnappa.com/actions/workflows/ci.yml) [![Live monitor](https://github.com/rakshith-ponnappa/rakshithponnappa.com/actions/workflows/monitor.yml/badge.svg)](https://github.com/rakshith-ponnappa/rakshithponnappa.com/actions/workflows/monitor.yml)

Personal site of **Rakshith S P**, Principal Platform Engineer. The concept is that the site behaves like a live production system: it has a status-page hero, a career rendered as a distributed trace, case studies written as postmortems, and a small retrieval-grounded assistant whose evals are public.

**Live:** https://rakshithponnappa.com · **Résumé:** [/resume](https://rakshithponnappa.com/resume/) · **For LLMs:** [/llms.txt](https://rakshithponnappa.com/llms.txt)

## Stack

| Layer | Choice | Why |
|---|---|---|
| Site | [Astro 7](https://astro.build) (static output), MDX, Tailwind 4 | Zero JS by default. Content is typed with zod collections. |
| Type & colour | Geist, Geist Mono, Instrument Serif; OKLCH tokens | Dark "NOC" and light "Day shift" themes from a single token set. |
| Motion | CSS scroll-driven animations and cross-document View Transitions | No animation runtime and no scroll-jacking. Disabled under `prefers-reduced-motion`. |
| Hero | Hand-written WebGL2 "career topology" (~8 KB gz) | Progressive enhancement, loaded only on capable devices, after idle and when in view. See [docs/HERO3D.md](docs/HERO3D.md). |
| Backend | Cloudflare Worker + static assets, Workers AI, Email Routing, Turnstile | `/api/ask` (BM25 RAG with guardrails) and `/api/contact`. See [docs/BACKEND.md](docs/BACKEND.md). |
| Delivery | GitHub Actions → Cloudflare | Build once, test that build, deploy it, smoke-test production, roll back automatically. See [docs/PIPELINE.md](docs/PIPELINE.md). |
| Diagrams | Mermaid → themed SVG at build time | Rendered in light and dark variants, so no Mermaid runtime is shipped. |
| OG images | satori + resvg at build time | One card per page. |

## Quality bars

- First-load JS on the home page is about 8 KB gzipped, and the WebGL hero adds about 8 KB gz only on capable devices.
- Strict CSP: Astro hashes every script and style. There are no inline `style=""` attributes, and Prism (not Shiki) is used for code.
- WCAG 2.2 AA:
  - skip link, visible focus and semantic landmarks;
  - every chart has a text equivalent;
  - full keyboard support, including <kbd>⌘K</kbd> and <kbd>/</kbd>.
- Every number on the site is real. The assistant's retrieval quality is measured on every build at [/evals](https://rakshithponnappa.com/evals/).
- Tested from five perspectives: unit, AI (retrieval, refusal, adversarial), content and confidentiality, ops (config, deploy, secrets, pipeline) and real browsers (journeys, accessibility, CSP). See [docs/TESTING.md](docs/TESTING.md).

## Delivery

Every change goes through a pull request and the same pipeline: build once → all test suites and a secret scan →
merge → deploy that exact build → live smoke test for the commit → automatic rollback on failure. A scheduled
monitor smoke-tests production every 6 hours and opens an incident issue if it fails. Details in
[docs/PIPELINE.md](docs/PIPELINE.md).

## Structure

```
src/
  data/profile.ts        single source of truth for the résumé (pages, PDF, JSON Resume, JSON-LD, AI corpus)
  data/evals.ts          golden questions for the assistant
  content/work/*.mdx     client case studies (postmortem format)
  content/projects/*.mdx open-source deep-dives
  lib/retrieval.ts       dependency-free BM25, shared by Worker, browser fallback and evals
  lib/corpus.ts          builds /corpus.json and /llms-full.txt from the content
  pages/                 routes, plus endpoints for corpus.json, llms.txt, resume.json, security.txt and og/*.png
worker/                  Cloudflare Worker (/api/ask, /api/contact) and its tests; www-redirect/ 301s alias domains (.dev, www) to the canonical site
tests/                   AI, content, ops, E2E/QA suites and persona scripts (see docs/TESTING.md)
.github/workflows/       CI/CD (ci.yml) and the live monitor (monitor.yml)
diagrams/*.mmd           Mermaid sources → public/diagrams/*.{dark,light}.svg
scripts/                 diagrams, icons, résumé PDF, portrait cut-out, status history and the live smoke test
```

## Develop

Requires Node ≥ 22.23 (Astro 7).

```sh
npm install
npm run dev            # http://localhost:4321
npm test               # Worker + retrieval unit tests (vitest)
npm run diagrams       # re-render Mermaid diagrams (needs mermaid-cli + Chrome)
npm run build          # static site → dist/ (also runs evals, OG images, corpus)
npm run pdf            # print /resume/ to public/Rakshith_SP_Resume.pdf (needs Chrome)
npm run cf:dev         # Worker + assets locally via wrangler
node scripts/smoke.mjs # smoke-test production (or pass another origin)
```

Production deploys come from CI ([docs/PIPELINE.md](docs/PIPELINE.md)); `npm run cf:deploy` is the break-glass path.
One-time Cloudflare setup is in [docs/BACKEND.md](docs/BACKEND.md).

## Content rules

- Client names are real and used with care. There are no hostnames, IPs, internal IDs, ticket numbers or colleague names.
- Metrics come only from the work itself. If a number isn't real, it doesn't ship.
- Every case study follows the same structure: Context → Constraints → What I did → Key decisions → Outcome → What I'd do next.

## Licence

© Rakshith Siragaje Ponnappa. All rights reserved. The code, content, case studies, diagrams, design and portrait are published for review as part of a portfolio; see [LICENSE](LICENSE). Ask before reusing any of it: contact@rakshithponnappa.com.
