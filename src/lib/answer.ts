// Extractive answers for when no LLM is available (static preview, Workers AI quota, model errors).
// Shared by the Worker and the browser fallback so both render the same answer for the same question.
import { tokenize, type Doc, type Hit, type Index } from './retrieval';

export type Passage = { id: string; title: string; section?: string; url: string; text: string };

export const EXTRACTIVE_LEAD = 'Here’s what his public material says:';
export const PASSAGE_WORDS = 55;
const PAGES = 3;

// Split before a capital/number/quote that follows sentence punctuation; good enough for this corpus.
const SENTENCE = /(?<=[.!?])(?<!\b(?:incl|e\.g|i\.e|etc|vs|approx|no|fig|[A-Z])\.)\s+(?=[A-Z“"'(£$€])/;
// Corpus metadata lines ("Client: …", "Stack: …") are for retrieval, not for reading.
const META = /^(Client|Role|Stack|Code|Project|Clients and workstreams|Delivered via|LinkedIn|GitHub):/;

function clip(text: string, words: number) {
  const w = text.trim().split(/\s+/);
  return w.length > words ? w.slice(0, words).join(' ').replace(/[,;:–-]$/, '') + '…' : w.join(' ');
}

const RELATIVE_FLOOR = 0.78;
const PAGE_COVERAGE = 0.75;

// IDF-weighted share of the query found in one doc; unseen terms weigh the most.
function coverage<D extends Doc>(index: Index<D>, query: string, doc: D) {
  const terms = [...new Set(tokenize(query))];
  const tf = index.tf[index.docs.indexOf(doc)];
  if (!terms.length || !tf) return 0;
  const unseen = Math.log(1 + (index.N + 0.5) / 0.5);
  let all = 0;
  let got = 0;
  for (const t of terms) {
    const n = index.df.get(t) ?? 0;
    const idf = n ? Math.log(1 + (index.N - n + 0.5) / (n + 0.5)) : unseen;
    all += idf;
    if (tf.has(t)) got += idf;
  }
  return got / all;
}

function pick(text: string, query: string, max: number, words: number) {
  const q = new Set(tokenize(query));
  const sentences = text
    .split(SENTENCE)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 5);
  if (!sentences.length) return { text: clip(text, words), score: 0 };
  const scored = sentences.map((s, i) => {
    const terms = new Set(tokenize(s));
    let hit = 0;
    for (const t of q) if (terms.has(t)) hit++;
    // Prefer concrete numbers; penalise list-like sentences (inventories of names read badly as answers).
    const commas = (s.match(/,/g) ?? []).length;
    const penalty = Math.max(0, commas - 2) * 0.5 + (META.test(s) ? 2 : 0);
    return { s, i, hit, score: hit + (/\d/.test(s) ? 0.3 : 0) - penalty - i * 0.01 };
  });
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  // A second sentence must be about as on-topic as the first.
  const picked = ranked.slice(0, max).filter((x, n) => n === 0 || (x.score >= 1 && x.hit >= Math.ceil(best.hit * 0.75)));
  return {
    text: clip(
      picked
        .sort((a, b) => a.i - b.i)
        .map((x) => x.s)
        .join(' '),
      words,
    ),
    score: ranked[0].hit,
  };
}

/** The one or two sentences of `text` that best match the question, in their original order. */
export function bestSentences(text: string, query: string, max = 2, words = PASSAGE_WORDS): string {
  return pick(text, query, max, words).text;
}

/**
 * Top hits collapsed to one passage per page, each reduced to its most relevant sentences.
 * Pages scoring well below the best hit, or whose best sentence matches no query term, are dropped.
 */
export function extractive<D extends Doc>(query: string, hits: Hit<D>[], pages = PAGES, index?: Index<D>): Passage[] {
  const seen = new Set<string>();
  const out: Passage[] = [];
  const top = hits[0]?.score ?? 0;
  for (const h of hits) {
    const page = h.doc.id.split('#')[0];
    if (seen.has(page)) continue;
    seen.add(page);
    const best = pick(h.doc.text, query, 2, PASSAGE_WORDS);
    // Supporting pages must be close to the best hit and cover most of the question, not one incidental word.
    if (out.length && (h.score < top * RELATIVE_FLOOR || best.score === 0 || (index && coverage(index, query, h.doc) < PAGE_COVERAGE))) continue;
    out.push({ id: h.doc.id, title: h.doc.title, section: h.doc.section, url: h.doc.url, text: best.text });
    if (out.length >= pages) break;
  }
  return out;
}
