// Persona 8 — AI agent / LLM crawler. Reads only the machine-readable files and tries to answer six
// recruiter questions from each file on its own, the way a retrieval agent with no browser would.
// Run: timeout 120 node tests/personas/ai-crawler.mjs
import fs from 'node:fs';
import path from 'node:path';
import { BASE, OUT_B, fetchText } from './_lib-b.mjs';

const out = path.join(OUT_B, 'ai-crawler');
fs.mkdirSync(out, { recursive: true });
const s = { persona: 'ai-crawler', tasks: [], friction: [], notes: [] };
const friction = (sev, text, evidence = null) => s.friction.push({ sev, text, evidence });
async function task(name, fn) {
  const t0 = performance.now();
  let ok = false, detail = null, error = null;
  try {
    ({ ok, detail } = await fn());
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  s.tasks.push({ name, success: ok ? 'y' : 'n', seconds: +((performance.now() - t0) / 1000).toFixed(2), clicks: 0, keystrokes: 0, detail, error });
  console.log(`[ai-crawler] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 400) : ''}${error ? ' !! ' + error : ''}`);
}

// Ground truth, from src/data/profile.ts (the single source of truth).
const TRUTH = {
  email: 'contact@rakshithponnappa.dev',
  phone: /\+91[\s-]?90354[\s-]?00153/,
  employer: 'Ensono',
  clouds: ['Azure', 'AWS', 'GCP'],
  degree: /Master of Computer Applications|MCA/,
  uni: /Bharathidasan/,
};

const FILES = ['/llms.txt', '/llms-full.txt', '/resume.json', '/corpus.json'];
const src = {};
await task('Fetch the four machine-readable files (200, right content-type, size budget)', async () => {
  const detail = {};
  for (const f of FILES) {
    const r = await fetchText(f);
    src[f] = r.text;
    const tokens = Math.round(r.text.length / 4);
    detail[f] = { status: r.status, type: r.type, kB: Math.round(r.text.length / 1024), approxTokens: tokens };
    if (r.status !== 200) friction(3, `${f} returned ${r.status}.`);
    if (f.endsWith('.json')) JSON.parse(r.text);
    if (f.endsWith('.txt') && !/charset=utf-8/i.test(r.type || '')) friction(1, `${f} is served as "${r.type}" without charset=utf-8 by astro preview (the route sets it, but the prerendered file loses it). Verify on Cloudflare; if missing, add it in public/_headers so é, – and · are not mis-decoded.`);
    if (tokens > 32000) friction(1, `${f} is ~${tokens} tokens; larger than many agents' single-fetch budget, so it may be truncated.`);
  }
  return { ok: Object.values(detail).every((d) => d.status === 200), detail };
});

// A naive agent: per-source text, flattened (JSON gets stringified so keys and values are both visible).
const text = (f) => (f.endsWith('.json') ? JSON.stringify(JSON.parse(src[f]), null, 1) : src[f]);

function answer(f) {
  const t = text(f);
  const a = {};
  // Email / phone
  a.email = t.includes(TRUTH.email) ? 2 : /@/.test(t) ? 1 : 0;
  a.phone = TRUTH.phone.test(t) ? 2 : 0;
  // Current role: needs both title and current employer to be fully answerable.
  let title = false, employer = false;
  if (f === '/resume.json') {
    const r = JSON.parse(src[f]);
    const cur = r.work.find((w) => !w.endDate);
    title = !!cur?.position;
    employer = cur?.name === TRUTH.employer;
  } else if (f === '/corpus.json') {
    title = /Principal Platform Engineer/.test(t);
    employer = /Ensono[^"]{0,120}(to Present|Present|current)/i.test(t) || /(Present|current)[^"]{0,120}Ensono/i.test(t);
  } else {
    title = /Principal Platform Engineer/.test(t);
    employer = /Ensono[^\n]{0,160}(to Present|Present)/i.test(t);
  }
  a.currentRole = title && employer ? 2 : title ? 1 : 0;
  // Cloud skills: all three named in a skills-like context.
  const clouds = TRUTH.clouds.filter((c) => new RegExp(`\\b${c}\\b`).test(t));
  const skillsCtx = /skills?|Cloud\b.*:/i.test(t);
  a.cloudSkills = clouds.length === 3 && skillsCtx ? 2 : clouds.length >= 2 ? 1 : 0;
  // Best case study: an explicit "featured / flagship / start here / best" marker is needed for a confident answer.
  const explicitBest = /\b(featured|flagship|start here|best case study|strongest|headline case)\b/i.test(t);
  const listsCases = /\/work\/[a-z0-9-]+/.test(t);
  a.bestCaseStudy = explicitBest ? 2 : listsCases ? 1 : 0;
  // Education
  const deg = TRUTH.degree.test(t) && TRUTH.uni.test(t);
  a.education = deg ? 2 : /Credentials|education/i.test(t) ? 1 : 0;
  a.total = Object.values(a).reduce((x, y) => x + y, 0);
  a.meta = { clouds, explicitBest, title, employer };
  return a;
}

const scores = {};
for (const f of FILES) {
  await task(`Answer email / phone / current role / cloud skills / best case study / education from ${f} alone`, async () => {
    const a = answer(f);
    scores[f] = a;
    return { ok: a.total >= 10, detail: { score: `${a.total}/12`, ...a } };
  });
}

await task('Answer all six from the four files together (max 12)', async () => {
  const keys = ['email', 'phone', 'currentRole', 'cloudSkills', 'bestCaseStudy', 'education'];
  const best = Object.fromEntries(keys.map((k) => [k, Math.max(...FILES.map((f) => scores[f][k]))]));
  const total = Object.values(best).reduce((a, b) => a + b, 0);
  if (scores['/llms.txt'].currentRole < 2) friction(2, 'llms.txt (the file agents read first) states the headline "Principal Platform Engineer" but never names the current employer (Ensono) or dates; "current role?" needs a second fetch.');
  if (scores['/llms.txt'].education < 2) friction(2, 'llms.txt has no education line at all (only a link to /credentials/), so "education?" fails from the entry file.');
  if (scores['/llms.txt'].cloudSkills < 2) friction(1, 'llms.txt mentions Azure/AWS/GCP only inside prose; there is no "Skills" line an agent can quote.');
  if (Math.max(...FILES.map((f) => scores[f].bestCaseStudy)) < 2)
    friction(2, 'No file marks a flagship/"start here" case study; an agent can only guess (it will usually pick the first listed: the Five Below audit).');
  return { ok: total >= 11, detail: { best, total: `${total}/12` } };
});

await task('Fact check: no wrong or inconsistent facts across the files', async () => {
  const issues = [];
  const all = FILES.map((f) => [f, text(f)]);
  for (const [f, t] of all) {
    // IIT Madras must be a COURSE, never a degree.
    for (const m of t.matchAll(/[\s\S]{0,120}IIT Madras[\s\S]{0,120}/g)) {
      const ctx = m[0];
      const degreeish = /\b(M\.?S\.?|M\.?Sc|Master(?:'s)? of Science|M\.?Tech|degree|graduate of|alumn)/i.test(ctx) && !/not a degree|\(course\)|course,? not/i.test(ctx);
      const course = /course/i.test(ctx);
      if (degreeish || !course) issues.push({ sev: 3, f, text: `IIT Madras not clearly described as a course: "${ctx.trim().slice(0, 160)}"` });
    }
    // Text-extraction damage: a sentence that starts with a bare file extension means "name.py" was cut in half.
    const broken = [...t.matchAll(/(?:^|[.!?:]\s)(py|js|ts|json|yaml|yml|md|sh|toml|x)\s[a-z(]/g)];
    if (broken.length) issues.push({ sev: 2, f, text: `${broken.length} sentence(s) start with an orphaned file extension (e.g. "py orchestrates…"): the chunker drops tokens like "verifier." before "py".` });
    if (/devsecops & ai deployment/.test(t)) issues.push({ sev: 1, f, text: 'Tagline lower-cased into "devsecops & ai deployment" (acronyms lose their capitals).' });
  }
  // Title consistency between the headline and the current job title.
  const r = JSON.parse(src['/resume.json']);
  const cur = r.work.find((w) => !w.endDate);
  if (r.basics.label !== cur.position)
    issues.push({ sev: 1, f: '/resume.json', text: `basics.label "${r.basics.label}" differs from the current position "${cur.position}" at ${cur.name}; agents may report either as the job title. Say "Principal Platform Engineer (title at Ensono: Expert Technology Consultant – DevOps)" once, explicitly.` });
  // Years of experience vs the career start date.
  const start = new Date('2014-08-01');
  const yrs = Math.floor((Date.now() - start) / (365.25 * 864e5));
  for (const [f, t] of all) {
    const m = t.match(/(\d+)\+ years/);
    if (m && +m[1] > yrs) issues.push({ sev: 2, f, text: `Claims ${m[1]}+ years but the career started Aug 2014 (${yrs} full years).` });
  }
  // Education agreement across files.
  const edu = all.map(([f, t]) => [f, /Bharathidasan/.test(t), /CMR Institute/.test(t)]);
  for (const [f, a, b] of edu) if (f !== '/llms.txt' && (!a || !b)) issues.push({ sev: 2, f, text: 'Education missing one of the two degrees.' });
  // Internal links in llms.txt resolve locally.
  const links = [...new Set([...src['/llms.txt'].matchAll(/https:\/\/rakshithponnappa\.dev(\/[^)\s]*)/g)].map((m) => m[1]))];
  const dead = [];
  for (const l of links) {
    const res = await fetch(BASE + l, { method: 'HEAD' });
    if (res.status >= 400) dead.push(`${l} ${res.status}`);
  }
  if (dead.length) issues.push({ sev: 2, f: '/llms.txt', text: `Dead links: ${dead.join(', ')}` });
  s.notes.push(`llms.txt internal links checked: ${links.length}, dead: ${dead.length}`);
  for (const i of issues) friction(i.sev, `${i.f}: ${i.text}`);
  return { ok: !issues.some((i) => i.sev >= 2), detail: { issues: issues.length, deadLinks: dead, yearsSinceStart: yrs } };
});

await task('robots.txt lets AI crawlers reach the machine-readable files', async () => {
  const r = await fetchText('/robots.txt');
  const blocksAll = /User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*$/im.test(r.text);
  const mentionsLlms = /llms/i.test(r.text);
  const sitemap = /Sitemap:/i.test(r.text);
  if (!mentionsLlms) s.notes.push('robots.txt does not reference llms.txt (optional; llms.txt is discovered by convention).');
  return { ok: r.status === 200 && !blocksAll && sitemap, detail: { status: r.status, blocksAll, sitemap, mentionsLlms } };
});

const result = { persona: s.persona, ranAt: new Date().toISOString(), base: BASE, tasks: s.tasks, scores, friction: s.friction, notes: s.notes };
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
console.log('[ai-crawler] friction:');
for (const f of s.friction) console.log(`  - (${f.sev}) ${f.text}`);
console.log('[ai-crawler] scores:', Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, `${v.total}/12`])));
console.log(`[ai-crawler] results -> ${path.join(out, 'results.json')}`);
