// Dependency-free BM25 retrieval. Shared by the Cloudflare Worker (/api/ask),
// the in-browser fallback and the build-time evals, so all three rank identically.

export type Doc = { id: string; title: string; url: string; section?: string; text: string };
export type Hit<D extends Doc = Doc> = { doc: D; score: number };
export type Index<D extends Doc = Doc> = {
  docs: D[];
  tf: Map<string, number>[];
  len: number[];
  avgdl: number;
  df: Map<string, number>;
  N: number;
};

const K1 = 1.2;
const B = 0.75;
// Title/section terms count extra so "what is TalentLens" lands on the TalentLens page.
const TITLE_BOOST = 2;

/** Minimum top score for an answerable question. Tuned against the golden set on /evals. */
export const REFUSAL_THRESHOLD = 2.5;
/** When a query mentions terms the corpus has never seen, this share of its IDF mass must be matched by the top docs. */
export const MIN_COVERAGE = 0.65;

const STOP = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have he her him his how i if in into is it its ' +
    'me my of on or our she so than that the their them then there these they this to was we were what when where which who ' +
    'whom why will with would you your about any all also just more most other some such only own same too very s t ' +
    'rakshith sp tell give show know please much many ' +
    // Question filler: adjectives that carry no topical signal ("how deep is…", "best at…").
    'deep good strong solid really well level best worth great ' +
    // Request phrasing ("briefly summarise…", "give an overview of…"): never topical, often absent from the corpus.
    'briefly brief summarise summarize summary explain describe overview quick quickly detail details elaborate outline kindly could would can us'
  ).split(/\s+/),
);

const SYNONYMS: Record<string, string[]> = {
  k8s: ['kubernetes'],
  kube: ['kubernetes'],
  tf: ['terraform'],
  gcp: ['google', 'cloud'],
  az: ['azure'],
  llms: ['llm'],
  genai: ['ai', 'llm'],
  cicd: ['ci', 'cd', 'pipeline'],
  dr: ['disaster', 'recovery'],
  iac: ['infrastructure', 'code', 'terraform'],
  sre: ['sre', 'reliability'],
  cv: ['resume'],
  tech: ['stack'],
  techstack: ['stack'],
  tooling: ['tool'],
};

export function stem(w: string) {
  if (w.length <= 4 || /\d/.test(w)) return w;
  if ((w.endsWith('ies') || w.endsWith('ied')) && w.length > 5) return w.slice(0, -3) + 'y';
  // "splitting" → "split", "planned" → "plan": drop the doubled consonant left by the suffix.
  const undouble = (x: string) => (/([b-df-hj-np-tv-z])\1$/.test(x) && !/(ll|ss|zz)$/.test(x) ? x.slice(0, -1) : x);
  if (w.endsWith('ing') && w.length > 6) return undouble(w.slice(0, -3));
  if (w.endsWith('ed') && w.length > 5) return undouble(w.slice(0, -2));
  if (/(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[\p{L}\p{N}]+/gu);
  if (!words) return out;
  for (const w of words) {
    if (STOP.has(w)) continue;
    const syn = SYNONYMS[w];
    if (syn) for (const s of syn) out.push(stem(s));
    else out.push(stem(w));
  }
  return out;
}

export function buildIndex<D extends Doc>(docs: D[]): Index<D> {
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  for (const d of docs) {
    const terms = tokenize(d.text);
    const head = tokenize(`${d.title} ${d.section ?? ''}`);
    const m = new Map<string, number>();
    for (const t of terms) m.set(t, (m.get(t) ?? 0) + 1);
    for (const t of head) m.set(t, (m.get(t) ?? 0) + TITLE_BOOST);
    tf.push(m);
    len.push(terms.length + head.length * TITLE_BOOST);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = docs.length;
  const avgdl = len.reduce((a, b) => a + b, 0) / Math.max(N, 1);
  return { docs, tf, len, avgdl, df, N };
}

export function search<D extends Doc>(index: Index<D>, query: string, k = 5): Hit<D>[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length) return [];
  const hits: Hit<D>[] = [];
  for (let i = 0; i < index.N; i++) {
    const m = index.tf[i];
    let s = 0;
    for (const t of q) {
      const f = m.get(t);
      if (!f) continue;
      const n = index.df.get(t)!;
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.len[i]) / index.avgdl)));
    }
    if (s > 0) hits.push({ doc: index.docs[i], score: s });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}

/** Share of the query's IDF mass found in the top `k` hits. Unseen terms get the maximum IDF. */
export function queryCoverage<D extends Doc>(index: Index<D>, query: string, hits: Hit<D>[], k = 3): number {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return 0;
  const unseen = Math.log(1 + (index.N + 0.5) / 0.5);
  const tops = hits.slice(0, k).map((h) => index.tf[index.docs.indexOf(h.doc)]).filter(Boolean);
  let all = 0;
  let got = 0;
  for (const t of terms) {
    const n = index.df.get(t) ?? 0;
    const idf = n ? Math.log(1 + (index.N - n + 0.5) / (n + 0.5)) : unseen;
    all += idf;
    if (tops.some((m) => m.has(t))) got += idf;
  }
  return got / all;
}

/** Retrieval-side refusal gate, run before any model call. Shared by the Worker, the browser fallback and /evals. */
export function isAnswerable<D extends Doc>(index: Index<D>, query: string, hits: Hit<D>[]): boolean {
  if (!hits.length || hits[0].score < REFUSAL_THRESHOLD) return false;
  const hasUnseen = tokenize(query).some((t) => !index.df.has(t));
  return !hasUnseen || queryCoverage(index, query, hits) >= MIN_COVERAGE;
}
