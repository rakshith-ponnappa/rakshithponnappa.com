// Persona 1 — Recruiter doing a 30-second scan on desktop.
import fs from 'node:fs';
import path from 'node:path';
import { startSession, go, shot, click, scroll, task, friction, note, finish, aboveFoldText, sleep } from './_lib.mjs';

const s = await startSession('recruiter');
const { page } = s;
const t0 = Date.now();
await go(s, '/');
await sleep(1200); // let the entrance animation settle, as a human eye would
await shot(s, 'home-first-viewport');
const fold = await aboveFoldText(page);
note(s, 'Above-the-fold text: ' + fold.slice(0, 600));

const want = {
  name: /Rakshith/,
  title: /Principal Platform Engineer/,
  seniority: /\b1\d\+?\s*(years|yrs|y\b)|\b1\dy\b/i,
  location: /Bengaluru|India/,
  availability: /Open to (new )?roles|available/i,
  contact: /@|\+91|mailto|Contact|Open a ticket/i,
};
const contactDirect = /@rakshithponnappa\.com|\+91/;

await task(s, 'Find name, title, seniority, location, availability, contact in first viewport (no scroll)', async () => {
  const found = Object.fromEntries(Object.entries(want).map(([k, re]) => [k, re.test(fold)]));
  found.directContact = contactDirect.test(fold);
  if (!found.seniority) friction(s, 3, 'Seniority (years) is not stated as plain words above the fold; only the "uptime 12y 03m" widget hints at it.');
  if (!found.directContact) friction(s, 3, 'No email or phone above the fold; the only contact CTA is "Open a ticket" (jargon for a recruiter).');
  if (/All systems operational/.test(fold)) friction(s, 1, '"All systems operational" status pill reads like a status page; availability ("Open to new roles") is the last, smallest item in that line and is hidden on narrow screens (.hide-sm).');
  return { ok: found.name && found.title && found.location && found.availability && found.seniority, detail: found };
});

await task(s, 'Find a direct email/phone by scanning down the home page', async () => {
  let scrolls = 0;
  for (; scrolls < 20; scrolls++) {
    const seen = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="mailto:"],a[href^="tel:"],[data-copy]')].some((e) => {
        const r = e.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.width > 0;
      }),
    );
    if (seen) break;
    await scroll(s, 800);
  }
  await shot(s, 'contact-found');
  const where = await page.evaluate(() => Math.round(scrollY));
  if (scrolls > 3) friction(s, 2, `Direct contact first visible only after ${scrolls} scrolls (~${where}px down the home page).`);
  return { ok: scrolls < 20, detail: { scrolls, scrollY: where } };
});

await task(s, 'Seniority check: years stated anywhere obvious', async () => {
  const txt = await page.evaluate(() => document.body.innerText);
  const m = txt.match(/(\d+\+?)\s*years in cloud[^\n]*/i);
  return { ok: !!m, detail: m?.[0] };
});

await go(s, '/');
const dl = path.join(s.out, 'downloads');
fs.rmSync(dl, { recursive: true, force: true });
fs.mkdirSync(dl, { recursive: true });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });

await task(s, 'Download the résumé PDF from the hero', async () => {
  await click(s, '.hero a[download]');
  for (let i = 0; i < 40; i++) {
    const f = fs.readdirSync(dl).filter((x) => !x.endsWith('.crdownload'));
    if (f.length) {
      const buf = fs.readFileSync(path.join(dl, f[0]));
      const isPdf = buf.subarray(0, 5).toString() === '%PDF-';
      const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      return { ok: isPdf, detail: { file: f[0], kb: Math.round(buf.length / 1024), pdf: isPdf, pages } };
    }
    await sleep(250);
  }
  return false;
});
await shot(s, 'after-download');

await task(s, 'Recruiter fallback: open /resume/ HTML page and find years + availability', async () => {
  await go(s, '/resume/');
  await shot(s, 'resume-page');
  const txt = await page.evaluate(() => document.body.innerText);
  const years = /\d+\+?\s*years/i.test(txt);
  const open = /open to/i.test(txt);
  if (!open) friction(s, 2, '/resume/ page does not state availability ("Open to …").');
  return { ok: years, detail: { years, open } };
});

const total = (Date.now() - t0) / 1000;
note(s, `Whole session wall-clock: ${total.toFixed(1)}s`);
await finish(s, { sus: null });
