// Persona 7 — Non-native English reader (B2 level). Scores copy clarity on home, a case study and a project.
// Ranks sentences by a difficulty score (length, long words, jargon, idioms, symbols). The human-written
// rewrites for the worst 10 live in docs/LIVE-USER-TESTING.md, keyed by the same sentence text.
// Run: timeout 120 node tests/personas/non-native.mjs
import { startSession, go, shot, task, friction, note, finish, sleep, writeJson } from './_lib-b.mjs';

const PAGES = ['/', '/work/eks-30000-site-migration/', '/projects/talentlens/'];

// Words/phrases a B2 reader is likely to stumble on (idioms, insider jargon, unexpanded acronyms).
const IDIOMS = [/\bthe hard way\b/i, /\bon the ground\b/i, /\bway back\b/i, /\bin the open\b/i, /\bship(ped|ping)?\b/i, /\blands?\b(?! zone)/i, /\bstraight\b/i, /\bat a glance\b/i, /\bopen a ticket\b/i, /\bblast radius\b/i, /\bbreak-glass\b/i, /\bwhat it took\b/i, /\blong-running trace\b/i, /\bsuits you\b/i, /\bheavy lifting\b/i, /\bgreenfield\b/i, /\bbrownfield\b/i, /\bout of the box\b/i, /\btoil\b/i, /\bpaved road\b/i, /\bgolden path\b/i];
const ACRONYM = /\b[A-Z]{2,6}s?\b/g;
const KNOWN = new Set(['AWS', 'GCP', 'AI', 'UK', 'US', 'IT', 'PDF', 'CV', 'IST', 'API', 'LLM', 'LLMs', 'CI', 'CD', 'DNS']);

function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) || []).length);
}

function score(sentence) {
  const words = sentence.match(/[A-Za-zÀ-ÿ'’-]+/g) || [];
  const long = words.filter((w) => syllables(w) >= 3).length;
  const idioms = IDIOMS.filter((r) => r.test(sentence)).map((r) => sentence.match(r)[0]);
  const acr = [...new Set((sentence.match(ACRONYM) || []).filter((a) => !KNOWN.has(a)))];
  const symbols = (sentence.match(/[·→/&+]|--|—/g) || []).length;
  const s = words.length * 1 + long * 1.5 + idioms.length * 6 + acr.length * 3 + symbols * 1.5 + (words.length > 25 ? 10 : 0);
  return { words: words.length, long, idioms, acronyms: acr, symbols, score: +s.toFixed(1) };
}

function flesch(text) {
  const sents = text.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 2);
  const words = text.match(/[A-Za-zÀ-ÿ'’-]+/g) || [];
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return {
    sentences: sents.length,
    words: words.length,
    avgSentence: +(words.length / Math.max(1, sents.length)).toFixed(1),
    fleschEase: +(206.835 - 1.015 * (words.length / Math.max(1, sents.length)) - 84.6 * (syl / Math.max(1, words.length))).toFixed(1),
  };
}

const s = await startSession('non-native');
const { page } = s;
const all = [];
const pageStats = {};

for (const url of PAGES) {
  await task(s, `Read ${url} as a B2 English reader: Flesch ease >= 40, avg sentence <= 20 words`, async () => {
    await go(s, url);
    await sleep(800);
    await shot(s, 'read-' + (url.replace(/\W+/g, '_') || 'home'));
    // Prose only: paragraphs, list items and headings in <main>, skipping code, nav and aria-hidden decoration.
    const blocks = await page.evaluate(() =>
      [...document.querySelectorAll('main p, main li, main h1, main h2, main h3, main figcaption, main dd')]
        .filter((e) => !e.closest('pre,code,nav,[aria-hidden="true"],.mono,dialog,form') && e.textContent.trim().split(/\s+/).length >= 6)
        .filter((e) => ![...e.querySelectorAll('p,li')].length)
        .map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    );
    const text = [...new Set(blocks)].map((b) => (/[.!?]$/.test(b) ? b : b + '.')).join(' ');
    const stats = flesch(text);
    pageStats[url] = stats;
    // Split per block so headings and eyebrows never merge into the next paragraph.
    const sents = [...new Set(blocks.flatMap((b) => b.split(/(?<=[.!?])\s+(?=[A-Z“"‘(])/)).map((x) => x.trim()).filter((x) => x.split(' ').length >= 6))];
    for (const t of sents) all.push({ url, text: t, ...score(t) });
    if (stats.fleschEase < 40) friction(s, 2, `${url}: Flesch reading ease ${stats.fleschEase} (hard; aim for 50+ for non-native readers).`);
    if (stats.avgSentence > 20) friction(s, 2, `${url}: average sentence is ${stats.avgSentence} words (aim for <= 20).`);
    return { ok: stats.fleschEase >= 40 && stats.avgSentence <= 20, detail: stats };
  });
}

await task(s, 'Jargon & idiom inventory across the three pages', async () => {
  const idioms = {};
  const acr = {};
  for (const x of all) {
    x.idioms.forEach((i) => (idioms[i.toLowerCase()] = (idioms[i.toLowerCase()] || 0) + 1));
    x.acronyms.forEach((a) => (acr[a] = (acr[a] || 0) + 1));
  }
  note(s, 'Idioms: ' + JSON.stringify(idioms));
  note(s, 'Unexpanded acronyms: ' + JSON.stringify(acr));
  const n = Object.keys(acr).length;
  if (n > 8) friction(s, 2, `${n} different acronyms used without expansion (${Object.keys(acr).slice(0, 10).join(', ')}).`);
  return { ok: n <= 8, detail: { idioms, acronyms: acr } };
});

const worst = all.sort((a, b) => b.score - a.score).slice(0, 15);
console.log('\nTop 15 hardest sentences:');
worst.forEach((w, i) => console.log(`${i + 1}. [${w.score}] ${w.url} (${w.words}w, idioms=${w.idioms.join('/')}, acr=${w.acronyms.join('/')})\n   ${w.text}`));
writeJson(s, 'worst-sentences.json', worst);
await finish(s, { pageStats, worst });
