#!/usr/bin/env node
// Records the current build in public/status-history.json, the per-deploy history behind /status/.
//
//   node scripts/status-record.mjs                 read <dist>/status/index.html, upsert this build's entry
//   node scripts/status-record.mjs --dist ./out    use another build directory (default ./dist)
//   node scripts/status-record.mjs --pull <url>    before a build: merge the deployed history into public/
//
// The entry {sha, date, hit1, hit3, mrr, refusal, chunks} is read from the JSON snapshot that /status/ embeds,
// so the numbers are exactly the ones that build computed. One entry per sha (re-runs replace it), 90 max.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MAX = 90;
const ROOT = resolve(import.meta.dirname, '..');
const HISTORY = join(ROOT, 'public', 'status-history.json');
const KEYS = ['hit1', 'hit3', 'mrr', 'refusal', 'chunks'];

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const isEntry = (e) => e && typeof e.sha === 'string' && typeof e.date === 'string' && KEYS.every((k) => typeof e[k] === 'number');

function load(file) {
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${file} is not a JSON array`);
  return raw.filter(isEntry);
}

/** Union by sha (later lists win), oldest first, capped. */
function merge(...lists) {
  const bySha = new Map();
  for (const list of lists) for (const e of list) bySha.set(e.sha, e);
  return [...bySha.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX);
}

// One entry per line keeps diffs readable if the file is committed.
const serialise = (list) => (list.length ? `[\n${list.map((e) => '  ' + JSON.stringify(e)).join(',\n')}\n]\n` : '[]\n');

function snapshot(dist) {
  const page = join(dist, 'status', 'index.html');
  if (!existsSync(page)) throw new Error(`${page} not found. Build the site first (npm run build).`);
  const m = readFileSync(page, 'utf8').match(/<script type="application\/json" data-status-snapshot[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`No status snapshot in ${page}`);
  const s = JSON.parse(m[1]);
  if (!isEntry(s)) throw new Error('Status snapshot is missing fields');
  return s;
}

async function pull(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`GET ${url}: HTTP ${r.status}`);
  const remote = (await r.json()).filter?.(isEntry) ?? [];
  // Remote first so anything recorded locally for the same sha wins.
  const next = merge(remote, load(HISTORY));
  writeFileSync(HISTORY, serialise(next));
  console.log(`status:record pulled ${remote.length} entries from ${url}; ${next.length} in public/status-history.json`);
}

function record() {
  const dist = resolve(ROOT, opt('--dist') ?? 'dist');
  const snap = snapshot(dist);
  const sha = (process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || 'local').slice(0, 7);
  const entry = { sha, date: snap.date, ...Object.fromEntries(KEYS.map((k) => [k, snap[k]])) };

  const before = load(HISTORY);
  const next = merge(before, [entry]);
  writeFileSync(HISTORY, serialise(next));
  // Keep the copy in the build output in step, so this deploy ships its own entry.
  writeFileSync(join(dist, 'status-history.json'), serialise(next));

  const verb = before.some((e) => e.sha === sha) ? 'updated' : 'recorded';
  console.log(`status:record ${verb} ${sha} (hit@3 ${entry.hit3}, refusal ${entry.refusal}, ${entry.chunks} chunks); ${next.length}/${MAX} entries`);
}

try {
  const url = opt('--pull');
  if (url) await pull(url);
  else record();
} catch (err) {
  console.error(`status:record failed: ${err.message}`);
  process.exit(1);
}
