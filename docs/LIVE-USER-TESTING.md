# Live-user and persona testing

The automated suites prove the site works. This layer checks whether it works **for the people who visit it**:
whether a recruiter finds the right facts in 30 seconds, whether a sceptical engineer believes the numbers, and
whether someone on a slow phone or using a screen reader can get through it. There are two parts: scripted
personas that run against any build, and a short script for real people.

## Scripted personas

Each persona drives Google Chrome (puppeteer) the way that visitor would, records friction points with a severity
(1 = annoying, 3 = blocks the goal), saves screenshots, and passes only if the visitor reaches their goal.

| # | Persona | Goal | Script |
|---|---|---|---|
| 1 | Recruiter, 30-second desktop scan | Current role, years, location, availability and a résumé download | `recruiter.mjs` |
| 2 | Hiring manager, platform engineering | Depth on two case studies, consistent dates, proof behind claims | `hiring-manager.mjs` |
| 5 | Mobile commuter (iPhone-class, 4× CPU, slow 4G) | Usable home, case study and contact on a slow connection | `mobile-slow.mjs` |
| 6 | Keyboard-only and screen-reader user | Every journey without a mouse, with sensible names and focus order | `keyboard-sr.mjs` |
| 7 | Non-native English reader (B2) | Copy that reads clearly; ranks the hardest sentences for rewriting | `non-native.mjs` |
| 8 | AI agent / LLM crawler | Answer recruiter questions from `llms.txt`, `resume.json` and `corpus.json` alone | `ai-crawler.mjs` |
| 9 | Sceptical senior engineer | Proof pages, GitHub links and numbers that agree across pages and machine-readable files | `engineer-sceptic.mjs` |
| 10 | Client CTO (buyer) | What they would be buying, proof for a company like theirs, a consulting contact in under 3 minutes | `client-cto.mjs` |

Run one against a local preview or production:

```sh
npm run build && npx astro preview            # http://127.0.0.1:4321
timeout 120 node tests/personas/recruiter.mjs  # BASE=https://rakshithponnappa.com for production
```

Environment: `BASE` (site origin), `PERSONA_OUT` (results, default `test-results/persona-runs`), `CHROME_PATH`,
`PUPPETEER_PATH` and `HEADFUL=1` to watch the run. Results are a JSON report plus screenshots per persona.

### Acting on findings

Each friction point becomes a fix or a recorded decision. For example, the recruiter persona flagged that
availability was the last and smallest item in the hero line and hidden on narrow screens, so the hero now leads
with "Open to new roles". After a fix, re-run the persona that found it.

## Real-user testing (UAT)

Before a significant change goes live, ask two or three real people, ideally a recruiter, a platform engineer and
someone outside tech, to do these tasks on their own phone or laptop while you watch without helping:

1. "In 30 seconds, tell me what he does, how senior he is and where he's based."
2. "Find a project that's closest to what your company needs and tell me what he actually did."
3. "Ask the assistant a question you'd ask in a screening call."
4. "Download his résumé."
5. "Get in touch about a role." (Stop before sending, or send a message marked TEST.)

Write down where they hesitate, what they misread and anything they say out loud. Treat a task that takes
more than twice the expected time, or that needs a hint, as a defect, fix it, and run the matching persona
again to stop it regressing.
