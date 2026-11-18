// Computes /status/ at build time. Every state is derived from build data (evals, corpus, collections, files on
// disk, test reports) or, for the Worker-backed components, checked live in the browser. Nothing is hard-coded.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getCollection } from 'astro:content';
import { runEvals } from './evals';
import { profile } from '../data/profile';

export type State = 'operational' | 'degraded' | 'down' | 'not-configured';
export type Group = 'build' | 'edge' | 'gate';
export type Component = {
  id: string;
  name: string;
  group: Group;
  status: State;
  metric: string;
  evidence: string;
  href?: string;
  /** Edge components only: endpoint the browser probes. */
  probe?: string;
};
export type HistoryEntry = { sha: string; date: string; hit1: number; hit3: number; mrr: number; refusal: number; chunks: number };
export type BarState = 'ok' | 'degraded' | 'none';
export type Slot = { state: BarState; entry?: HistoryEntry; current?: boolean };

/** Retrieval gates. Shared with scripts/status-record.mjs via docs/STATUS.md; keep both in sync. */
export const HIT3_MIN = 0.9;
export const REFUSAL_MIN = 1;
export const SLOTS = 90;

export const STATE_LABEL: Record<State, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  'not-configured': 'Not measured',
};
/** Maps a state to the .dot / .chip tone used in global.css (red is styled locally). */
export const STATE_TONE: Record<State, string> = {
  operational: 'signal',
  degraded: 'amber',
  down: 'red',
  'not-configured': 'muted',
};

const ROOT = process.cwd();
const pct = (x: number) => `${+(x * 100).toFixed(1)}%`;
const round = (x: number) => Math.round(x * 1e4) / 1e4;

/** Same sha source as scripts/status-record.mjs, so the live bar and the recorded entry share a key. */
export const currentSha = () => (process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || 'local').slice(0, 7);

export const entryState = (e: Pick<HistoryEntry, 'hit3' | 'refusal'>): BarState =>
  e.hit3 >= HIT3_MIN && e.refusal >= REFUSAL_MIN ? 'ok' : 'degraded';

function readJson(rel: string): unknown {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
}

const isEntry = (e: unknown): e is HistoryEntry =>
  !!e &&
  typeof e === 'object' &&
  typeof (e as HistoryEntry).sha === 'string' &&
  typeof (e as HistoryEntry).date === 'string' &&
  ['hit1', 'hit3', 'mrr', 'refusal', 'chunks'].every((k) => typeof (e as Record<string, unknown>)[k] === 'number');

export function readHistory(): HistoryEntry[] {
  const raw = readJson('public/status-history.json');
  return Array.isArray(raw) ? raw.filter(isEntry) : [];
}

type GateCounts = { passed: number; failed: number };
/** Reads a gate from test-results/summary.json. Accepts { passed, failed } or { violations } (see docs/STATUS.md). */
function gate(summary: Record<string, unknown>, ...keys: string[]): GateCounts | null {
  for (const k of keys) {
    const g = summary[k] as Record<string, unknown> | undefined;
    if (!g || typeof g !== 'object') continue;
    const passed = Number(g.passed ?? 0);
    const failed = Number(g.failed ?? g.violations ?? (g.pass === false ? 1 : 0));
    if (Number.isFinite(passed) && Number.isFinite(failed)) return { passed, failed };
  }
  return null;
}

function qualityGate(): Component {
  const base = { id: 'a11y-csp', name: 'Accessibility & CSP', group: 'gate' as const };
  const summary = readJson('test-results/summary.json');
  if (!summary || typeof summary !== 'object') {
    return { ...base, status: 'not-configured', metric: 'no report', evidence: 'Not measured in this build: no test-results/summary.json was present.' };
  }
  const s = summary as Record<string, unknown>;
  const a11y = gate(s, 'a11y', 'axe', 'accessibility');
  const csp = gate(s, 'csp');
  if (!a11y && !csp) {
    return { ...base, status: 'not-configured', metric: 'no gate data', evidence: 'test-results/summary.json has no a11y or csp section.' };
  }
  const failed = (a11y?.failed ?? 0) + (csp?.failed ?? 0);
  const parts = [a11y && `axe ${a11y.failed} failing / ${a11y.passed} passing`, csp && `CSP ${csp.failed} failing / ${csp.passed} passing`].filter(Boolean);
  const when = typeof s.generatedAt === 'string' ? ` · generated ${s.generatedAt.slice(0, 16).replace('T', ' ')} UTC` : '';
  const from = typeof s.sha === 'string' && s.sha.slice(0, 7) !== currentSha() ? ` · from build ${s.sha.slice(0, 7)}` : '';
  return {
    ...base,
    status: failed ? 'degraded' : 'operational',
    metric: failed ? `${failed} failing` : 'all passing',
    evidence: `${parts.join(' · ')} (test-results/summary.json${when}${from})`,
  };
}

async function compute() {
  const r = await runEvals();
  const m = r.metrics;
  const work = await getCollection('work');
  const projects = await getCollection('projects');
  const generatedAt = new Date().toISOString();

  const retrievalIssues = [m.hit3 < HIT3_MIN && `hit@3 below ${pct(HIT3_MIN)}`, m.refusal < REFUSAL_MIN && `refusal below ${pct(REFUSAL_MIN)}`].filter(Boolean);

  const pdf = join(ROOT, 'public', profile.resumePdf.replace(/^\//, ''));
  const pdfKb = existsSync(pdf) ? Math.round(statSync(pdf).size / 1024) : null;
  const active = projects.filter((p) => p.data.status === 'active').length;

  const components: Component[] = [
    {
      id: 'retrieval',
      name: 'Ask the runbook (retrieval)',
      group: 'build',
      status: retrievalIssues.length ? 'degraded' : 'operational',
      metric: `hit@3 ${pct(m.hit3)}`,
      evidence: `hit@1 ${pct(m.hit1)} · MRR ${m.mrr.toFixed(3)} · refusal ${pct(m.refusal)} on ${r.cases.length}+${r.negs.length} golden questions${retrievalIssues.length ? `. ${retrievalIssues.join('; ')}.` : ''}`,
      href: '/evals/',
    },
    {
      id: 'corpus',
      name: 'Content corpus',
      group: 'build',
      status: r.chunks > 0 ? 'operational' : 'down',
      metric: `${r.chunks} chunks`,
      evidence: `version ${r.version} · served as /corpus.json to the Worker and the browser fallback`,
      href: '/corpus.json',
    },
    {
      id: 'work',
      name: 'Case studies',
      group: 'build',
      status: work.length ? 'operational' : 'down',
      metric: `${work.length} published`,
      evidence: `${work.filter((w) => w.data.featured).length} featured · rendered from the work collection`,
      href: '/work/',
    },
    {
      id: 'projects',
      name: 'Open-source projects',
      group: 'build',
      status: projects.length ? 'operational' : 'down',
      metric: `${projects.length} published`,
      evidence: `${active} active · ${projects.length - active} archived · rendered from the projects collection`,
      href: '/projects/',
    },
    {
      id: 'resume-pdf',
      name: 'Résumé PDF',
      group: 'build',
      status: pdfKb !== null ? 'operational' : 'degraded',
      metric: pdfKb !== null ? `${pdfKb} KB` : 'missing',
      evidence:
        pdfKb !== null
          ? `public${profile.resumePdf} present at build time`
          : `public${profile.resumePdf} was not present at build time. The HTML résumé at /resume/ still serves.`,
      href: pdfKb !== null ? profile.resumePdf : '/resume/',
    },
    {
      id: 'contact-api',
      name: 'Contact API',
      group: 'edge',
      status: 'not-configured',
      metric: 'POST /api/contact',
      evidence: 'Served by the Cloudflare Worker. If it is unreachable, the ticket form falls back to email.',
      probe: '/api/health',
      href: '/contact/',
    },
    {
      id: 'ask-api',
      name: 'Ask API (LLM)',
      group: 'edge',
      status: 'not-configured',
      metric: 'POST /api/ask',
      evidence: 'Served by the Cloudflare Worker. If it is unreachable, Ask runs the same BM25 index in your browser.',
      probe: '/api/health',
      href: '/ask/',
    },
    qualityGate(),
  ];

  // Edge components can't be known at build time, so only build and gate components drive the headline.
  const measured = components.filter((c) => c.group !== 'edge' && c.status !== 'not-configured');
  const down = measured.filter((c) => c.status === 'down').length;
  const degraded = measured.filter((c) => c.status === 'degraded').length;
  const operational = measured.length - down - degraded;
  const overall: { status: State; headline: string } = down
    ? { status: 'down', headline: down === measured.length ? 'Major outage' : 'Partial outage' }
    : degraded
      ? { status: 'degraded', headline: 'Partial degradation' }
      : { status: 'operational', headline: 'All systems operational' };

  const sha = currentSha();
  const current: HistoryEntry = {
    sha,
    date: generatedAt,
    hit1: round(m.hit1),
    hit3: round(m.hit3),
    mrr: round(m.mrr),
    refusal: round(m.refusal),
    chunks: r.chunks,
  };
  // Recorded history plus this build (replacing a stale record with the same sha), oldest first.
  const recorded = readHistory();
  const history = [...recorded.filter((e) => e.sha !== sha), current]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-SLOTS);

  return {
    overall: { ...overall, operational, degraded, down, measured: measured.length, notMeasured: components.filter((c) => c.group !== 'edge' && c.status === 'not-configured').length },
    components,
    history,
    current,
    recorded: recorded.length,
    generatedAt,
    sha,
  };
}

let cached: ReturnType<typeof compute> | undefined;
export const getStatus = () => (cached ??= compute());

/** Fixed-length slot list for the bar strip: empty "no data" slots first, newest real entry last. */
export function slots(history: HistoryEntry[], n: number, currentSha?: string): Slot[] {
  const tail = history.slice(-n);
  return [
    ...Array.from({ length: n - tail.length }, (): Slot => ({ state: 'none' })),
    ...tail.map((e): Slot => ({ state: entryState(e), entry: e, current: e.sha === currentSha })),
  ];
}

export const describeEntry = (e: HistoryEntry) =>
  `${e.sha === 'local' ? 'local build' : `build ${e.sha}`} · ${e.date.slice(0, 16).replace('T', ' ')} UTC · ${entryState(e) === 'ok' ? 'passing' : 'degraded'} · hit@1 ${pct(e.hit1)} · hit@3 ${pct(e.hit3)} · MRR ${e.mrr.toFixed(3)} · refusal ${pct(e.refusal)} · ${e.chunks} chunks`;

export { pct };
