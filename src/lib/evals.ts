// Runs the golden set against the same BM25 index the Worker uses. Executed at build time.
import { buildCorpus } from './corpus';
import { buildIndex, search, isAnswerable, queryCoverage, REFUSAL_THRESHOLD, MIN_COVERAGE } from './retrieval';
import { golden, negatives } from '../data/evals';

export type CaseResult = { q: string; rank: number | null; top: string | null; score: number; coverage: number; answered: boolean; pass: boolean; ms: number };
export type NegResult = { q: string; score: number; coverage: number; top: string | null; refused: boolean };

export async function runEvals() {
  const corpus = await buildCorpus();
  const t0 = performance.now();
  const index = buildIndex(corpus.docs);
  const indexMs = performance.now() - t0;

  const cases: CaseResult[] = golden.map(({ q, expect }) => {
    const s = performance.now();
    const hits = search(index, q, 10);
    const ms = performance.now() - s;
    // Rank of the first hit belonging to an expected page (dedupe chunks of the same page).
    const pages: string[] = [];
    for (const h of hits) {
      const page = h.doc.id.split('#')[0];
      if (!pages.includes(page)) pages.push(page);
    }
    const idx = pages.findIndex((p) => expect.some((e) => p.startsWith(e)));
    const rank = idx >= 0 ? idx + 1 : null;
    const score = hits[0]?.score ?? 0;
    const answered = isAnswerable(index, q, hits);
    return { q, rank, top: pages[0] ?? null, score, coverage: queryCoverage(index, q, hits), answered, pass: rank !== null && rank <= 3 && answered, ms };
  });

  const negs: NegResult[] = negatives.map((q) => {
    const hits = search(index, q, 10);
    const score = hits[0]?.score ?? 0;
    return { q, score, coverage: queryCoverage(index, q, hits), top: hits[0]?.doc.id.split('#')[0] ?? null, refused: !isAnswerable(index, q, hits) };
  });

  const n = cases.length;
  const hit1 = cases.filter((c) => c.rank === 1).length / n;
  const hit3 = cases.filter((c) => c.rank !== null && c.rank <= 3).length / n;
  const mrr = cases.reduce((a, c) => a + (c.rank ? 1 / c.rank : 0), 0) / n;
  const answered = cases.filter((c) => c.answered).length / n;
  const refusal = negs.filter((x) => x.refused).length / negs.length;
  const p50 = [...cases.map((c) => c.ms)].sort((a, b) => a - b)[Math.floor(n / 2)];

  return {
    version: corpus.version,
    chunks: corpus.docs.length,
    threshold: REFUSAL_THRESHOLD,
    minCoverage: MIN_COVERAGE,
    indexMs,
    p50,
    metrics: { hit1, hit3, mrr, answered, refusal },
    cases,
    negs,
    ranAt: new Date().toISOString(),
  };
}
