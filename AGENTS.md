## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Project conventions (rakshithponnappa.dev)

- `src/data/profile.ts` is the single source of truth for résumé data. Never duplicate facts elsewhere.
- Strict CSP is on (`security.csp` in `astro.config.mjs`). Do not use inline `style=""` attributes. Use classes, `data-*` attributes or `attr()`.
- Content rules: real numbers only. No hostnames, IPs, IDs, ticket numbers or colleague names. Never name "Meta", "OSWorld" or sandbox vendors; say "agentic computer-use benchmark platform" or "a frontier AI lab".
- Positioning: AI work is current, never "moving into / heading towards AI". Leadership is described as senior technical leadership, never as a team head-count. `tests/content/rules.ts` enforces these.
- Change workflow: every change (content or code) goes branch → pull request → CI (all suites + gitleaks) → merge → automatic deploy, live smoke test and rollback. Don't deploy by hand except via the break-glass steps in docs/PIPELINE.md.
- Mermaid labels must be double-quoted (an `@` in an unquoted label breaks Mermaid 11). Render with `npm run diagrams`.
- `src/lib/retrieval.ts` is shared by the Worker, the browser fallback and `/evals`. Run `npm test` and check `/evals` after changing it.
