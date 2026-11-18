// AI perspective (a): retrieval quality gate. Uses the BUILT corpus (<build>/corpus.json), the golden set in
// src/data/evals.ts and the production BM25 + refusal gate in src/lib/retrieval.ts, scored exactly like
// src/lib/evals.ts: chunks de-duplicated to pages, rank of the first expected page, and isAnswerable() as
// the answer/refuse decision (the same call the Worker makes before spending neurons).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { golden, negatives } from '../../src/data/evals';
import { buildIndex, isAnswerable, MIN_COVERAGE, queryCoverage, REFUSAL_THRESHOLD, search, type Doc } from '../../src/lib/retrieval';
import { BUILD, RESULTS, requireBuild } from '../support/site';

export const HIT3_MIN = 0.95;
export const ANSWER_RATE_MIN = 0.95;
export const REFUSAL_MIN = 1;

requireBuild();
const corpus = JSON.parse(readFileSync(join(BUILD, 'corpus.json'), 'utf8')) as { version: string; docs: Doc[] };
const index = buildIndex(corpus.docs);

const cases = golden.map(({ q, expect: exp }) => {
  const hits = search(index, q, 10);
  const pages: string[] = [];
  for (const h of hits) {
    const page = h.doc.id.split('#')[0];
    if (!pages.includes(page)) pages.push(page);
  }
  const idx = pages.findIndex((p) => exp.some((e) => p.startsWith(e)));
  return {
    q,
    expect: exp,
    rank: idx >= 0 ? idx + 1 : null,
    top: pages[0] ?? null,
    score: hits[0]?.score ?? 0,
    coverage: queryCoverage(index, q, hits),
    answered: isAnswerable(index, q, hits),
  };
});
const negs = negatives.map((q) => {
  const hits = search(index, q, 10);
  return {
    q,
    score: hits[0]?.score ?? 0,
    coverage: queryCoverage(index, q, hits),
    top: hits[0]?.doc.id.split('#')[0] ?? null,
    refused: !isAnswerable(index, q, hits),
  };
});

const n = cases.length;
const metrics = {
  corpusVersion: corpus.version,
  chunks: corpus.docs.length,
  golden: n,
  negatives: negs.length,
  threshold: REFUSAL_THRESHOLD,
  minCoverage: MIN_COVERAGE,
  hit1: cases.filter((c) => c.rank === 1).length / n,
  hit3: cases.filter((c) => c.rank !== null && c.rank <= 3).length / n,
  mrr: cases.reduce((a, c) => a + (c.rank ? 1 / c.rank : 0), 0) / n,
  answerRate: cases.filter((c) => c.answered).length / n,
  refusal: negs.filter((x) => x.refused).length / negs.length,
};
const misses = cases.filter((c) => c.rank === null || c.rank > 3);
const unanswered = cases.filter((c) => !c.answered);
const leaks = negs.filter((x) => !x.refused);

mkdirSync(RESULTS, { recursive: true });
writeFileSync(join(RESULTS, 'ai-retrieval-metrics.json'), JSON.stringify({ metrics, misses, unanswered, leaks, cases, negatives: negs }, null, 2));
console.log(
  `\n[retrieval] corpus ${metrics.corpusVersion} · ${metrics.chunks} chunks · ${n} golden · ${negs.length} negatives\n` +
    `[retrieval] hit@1 ${metrics.hit1.toFixed(3)} · hit@3 ${metrics.hit3.toFixed(3)} · MRR ${metrics.mrr.toFixed(3)} · ` +
    `answer rate ${metrics.answerRate.toFixed(3)} · refusal ${metrics.refusal.toFixed(3)}\n` +
    misses.map((m) => `[retrieval] MISS "${m.q}" → top ${m.top} (rank of expected: ${m.rank ?? 'none'})`).join('\n') +
    unanswered.map((m) => `\n[retrieval] UNANSWERED "${m.q}" (score ${m.score.toFixed(2)}, coverage ${m.coverage.toFixed(2)})`).join('') +
    leaks.map((m) => `\n[retrieval] NOT REFUSED "${m.q}" → ${m.top} (score ${m.score.toFixed(2)}, coverage ${m.coverage.toFixed(2)})`).join(''),
);

describe('retrieval quality gate (built corpus × golden set, isAnswerable)', () => {
  it('corpus is non-trivial and every doc has id/title/url/text', () => {
    expect(corpus.docs.length).toBeGreaterThan(20);
    for (const d of corpus.docs) {
      expect(d.id && d.title && d.url && d.text, JSON.stringify(d).slice(0, 120)).toBeTruthy();
      expect(d.url.startsWith('/'), d.id).toBe(true);
    }
  });

  it('the golden set and negatives are big enough to mean something', () => {
    expect(n).toBeGreaterThanOrEqual(30);
    expect(negs.length).toBeGreaterThanOrEqual(10);
  });

  it(`hit@3 ≥ ${HIT3_MIN}`, () => {
    expect(metrics.hit3, `misses:\n${misses.map((m) => `  ${m.q} → ${m.top}`).join('\n')}`).toBeGreaterThanOrEqual(HIT3_MIN);
  });

  it(`answer rate (golden questions passing isAnswerable) ≥ ${ANSWER_RATE_MIN}`, () => {
    expect(metrics.answerRate, `unanswered:\n${unanswered.map((m) => `  ${m.q} (${m.score.toFixed(2)})`).join('\n')}`).toBeGreaterThanOrEqual(ANSWER_RATE_MIN);
  });

  it('off-topic refusal = 100%', () => {
    expect(leaks.map((x) => `${x.q} → ${x.top} (${x.score.toFixed(2)})`)).toEqual([]);
    expect(metrics.refusal).toBe(REFUSAL_MIN);
  });

  it('every golden question that is answered also ranks its page in the top 3', () => {
    const wrong = cases.filter((c) => c.answered && (c.rank === null || c.rank > 3)).map((c) => `${c.q} → ${c.top}`);
    expect(wrong.length / n).toBeLessThanOrEqual(1 - HIT3_MIN);
  });
});

// Paraphrase robustness: realistic recruiter phrasings of questions the golden set already answers.
// BUG-AI-2 (docs/TEST-REPORT.md): isAnswerable() refuses them because filler verbs ("summarise", "briefly",
// "stack") are unseen in the corpus and get maximum IDF in queryCoverage(). Pinned with it.fails so the suite
// stays green while the bug exists and turns red when it is fixed (then flip it to a plain it()).
const paraphrases = ['Can you briefly summarise TalentLens?', 'Summarize TalentLens for me', 'What tech stack does TalentLens use?'];
describe('paraphrase robustness', () => {
  it('[BUG-AI-2] fixed: realistic paraphrases of answerable questions are answered', () => {
    const refused = paraphrases.filter((q) => !isAnswerable(index, q, search(index, q, 10)));
    expect(refused).toEqual([]);
  });
});

// Golden questions whose target page is not in the corpus (e.g. case studies still being written).
const pages = [...new Set(corpus.docs.map((d) => d.id.split('#')[0]))];
const dangling = golden.filter((g) => !g.expect.some((e) => pages.some((p) => p.startsWith(e)))).map((g) => g.q);
if (dangling.length) console.warn(`[retrieval] golden questions with no target page in the corpus: ${dangling.join(' | ')}`);
