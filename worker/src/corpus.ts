import { buildIndex, type Doc, type Index } from '../../src/lib/retrieval';
import type { Env } from './env';

export type Corpus = { version: string; docs: Doc[] };
export type LoadedCorpus = { version: string; index: Index<Doc>; urls: Set<string> };

// Module-scope cache: survives across requests in the same isolate. Assets are versioned with the
// Worker, so the version rarely changes, but we still re-check it periodically and rebuild on change.
let cache: { loaded: LoadedCorpus; checkedAt: number } | null = null;
const RECHECK_MS = 5 * 60_000;

export function _resetCorpusCache() {
  cache = null;
  inflight = null;
}

function isDoc(d: unknown): d is Doc {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.title === 'string' && typeof o.url === 'string' && typeof o.text === 'string';
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/g;

/** Every URL that legitimately appears in the corpus (doc URLs plus links inside chunk text). */
export function corpusUrls(docs: Doc[]): Set<string> {
  const urls = new Set<string>();
  for (const d of docs) {
    urls.add(d.url);
    for (const m of d.text.match(URL_IN_TEXT) ?? []) urls.add(m.replace(/[.,;:!?]+$/, ''));
  }
  return urls;
}

// One fetch per isolate at a time: concurrent cold requests share it instead of each rebuilding the index.
let inflight: Promise<LoadedCorpus> | null = null;

export async function loadCorpus(env: Env, requestUrl: string): Promise<LoadedCorpus> {
  if (cache && Date.now() - cache.checkedAt < RECHECK_MS) return cache.loaded;
  inflight ??= refresh(env, requestUrl).finally(() => (inflight = null));
  try {
    return await inflight;
  } catch (err) {
    // A failed re-check must not take the assistant down while a previously loaded index is still usable.
    if (!cache) throw err;
    console.warn('corpus refresh failed; serving cached index', String(err));
    cache.checkedAt = Date.now();
    return cache.loaded;
  }
}

async function refresh(env: Env, requestUrl: string): Promise<LoadedCorpus> {
  const now = Date.now();
  const res = await env.ASSETS.fetch(new Request(new URL('/corpus.json', requestUrl)));
  if (!res.ok) throw new Error(`corpus.json: HTTP ${res.status}`);
  const data = (await res.json()) as Partial<Corpus>;
  if (!data || !Array.isArray(data.docs)) throw new Error('corpus.json: malformed');
  const version = String(data.version ?? 'unknown');
  if (cache && cache.loaded.version === version) {
    cache.checkedAt = now;
    return cache.loaded;
  }
  const docs = data.docs.filter(isDoc);
  const loaded = { version, index: buildIndex(docs), urls: corpusUrls(docs) };
  cache = { loaded, checkedAt: now };
  return loaded;
}
