// Persona 2 — Hiring manager for a platform-engineering role (desktop).
import { startSession, go, shot, click, type, press, scroll, task, friction, note, finish, sleep } from './_lib.mjs';

const s = await startSession('hiring-manager');
const { page } = s;
await go(s, '/');
await sleep(800);

let caseUrl = null;
await task(s, 'Find a case study with hard numbers (from home, via nav)', async () => {
  await click(s, 'header nav a[href="/work/"]', { nav: true });
  await sleep(500);
  await shot(s, 'work-index');
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('main a[href^="/work/"]')]
      .filter((a) => a.getAttribute('href') !== '/work/')
      .map((a) => ({ href: a.getAttribute('href'), text: a.innerText.replace(/\s+/g, ' ').slice(0, 220) })),
  );
  const uniq = [...new Map(cards.map((c) => [c.href, c])).values()];
  const withNums = uniq.filter((c) => /\$\d|\d+%|\d{2,}/.test(c.text));
  note(s, `Work index: ${uniq.length} case studies, ${withNums.length} show numbers on the card.`);
  if (!withNums.length) friction(s, 2, 'Case-study cards on /work/ show no numbers; you must open each one to find impact.');
  caseUrl = (withNums[0] || uniq[0])?.href;
  return { ok: !!caseUrl, detail: { caseStudies: uniq.length, cardsWithNumbers: withNums.length, picked: caseUrl } };
});

await task(s, 'Open it and read the Outcome section', async () => {
  await click(s, `main a[href="${caseUrl}"]`, { nav: true });
  await sleep(500);
  await shot(s, 'case-study-top');
  const info = await page.evaluate(() => {
    const h = [...document.querySelectorAll('main h2')];
    const o = h.find((x) => /outcome/i.test(x.textContent));
    let txt = '';
    if (o) {
      for (let n = o.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) txt += n.innerText + ' ';
      o.scrollIntoView({ block: 'start' });
    }
    const top = o ? o.getBoundingClientRect().top + scrollY : null;
    return {
      h2s: h.map((x) => x.textContent.trim()),
      outcome: txt.trim().slice(0, 600),
      outcomeY: Math.round(top),
      docH: document.documentElement.scrollHeight,
      metricsAboveFold: [...document.querySelectorAll('main *')].some((e) => /\$\d+K|\d+%/.test(e.textContent) && e.children.length === 0 && e.getBoundingClientRect().top < innerHeight),
      toc: !!document.querySelector('nav[aria-label*="contents" i], .toc, aside nav'),
    };
  });
  s.clicks++; // a human scrolls/clicks to reach the outcome
  await sleep(300);
  await shot(s, 'case-study-outcome');
  if (info.outcomeY > 3000) friction(s, 2, `Outcome section starts ${info.outcomeY}px down (page ${info.docH}px); a hiring manager has to scroll past Context/Constraints/Decisions to reach it.${info.toc ? '' : ' No table of contents to jump there.'}`);
  if (!info.metricsAboveFold) friction(s, 2, 'Case study hero has no headline metric visible above the fold.');
  return { ok: /\d/.test(info.outcome), detail: info };
});

await task(s, 'Check career timeline (/experience/) for dates, titles, gaps/overlaps', async () => {
  await click(s, 'header nav a[href="/experience/"]', { nav: true });
  await sleep(600);
  await shot(s, 'experience-top');
  const visibleDates = await page.evaluate(() => (document.querySelector('main').innerText.match(/[A-Z][a-z]{2} (19|20)\d\d/g) || []).length);
  const heads = await page.$$('main details.span > summary');
  for (const h of heads) await click(s, h);
  await sleep(400);
  const roles = await page.evaluate(() => {
    const txt = document.querySelector('main').innerText;
    return { txt: txt.slice(0, 6000), dates: (txt.match(/[A-Z][a-z]{2} (19|20)\d\d/g) || []).length, titles: [...document.querySelectorAll('main .span .op')].map((e) => e.textContent.trim()) };
  });
  await shot(s, 'experience-expanded');
  if (visibleDates < 3) friction(s, 2, `Collapsed timeline shows no month/year dates (only '14…'26 ticks and durations); the hiring manager must expand ${heads.length} spans (${heads.length} clicks) to read start/end dates.`);
  if (/Turing[\s\S]{0,600}2026/.test(roles.txt) && /Ensono[\s\S]{0,600}(present|now)/i.test(roles.txt))
    friction(s, 2, 'Timeline shows a Sep–Oct 2026 Turing contract overlapping the current full-time Ensono role with no explanation. Hiring managers will ask.');
  note(s, 'Timeline titles: ' + roles.titles.join(' | '));
  return { ok: roles.dates >= 5, detail: { datesVisibleCollapsed: visibleDates, datesAfterExpand: roles.dates, spans: heads.length } };
});

async function ask(q, label) {
  const input = await page.$('[data-ask] input[name="q"]');
  s.clicks++;
  await input.click({ clickCount: 3 });
  await type(s, q, 15);
  await press(s, 'Enter');
  await page.waitForFunction(() => {
    const o = document.querySelector('[data-ask-out]');
    return o && !o.hidden && o.innerText.trim().length > 40 && !/thinking|searching|…$/i.test(o.innerText.slice(-20));
  }, { timeout: 20000 });
  await sleep(1200);
  await shot(s, label);
  return page.$eval('[data-ask-out]', (o) => ({ text: o.innerText, links: [...o.querySelectorAll('a')].map((a) => a.getAttribute('href')) }));
}

await task(s, 'Ask: Kubernetes depth', async () => {
  await click(s, 'header nav a[href="/ask/"]', { nav: true });
  await sleep(500);
  await shot(s, 'ask-page');
  const r = await ask('How deep is his Kubernetes experience? Has he run production clusters?', 'ask-kubernetes');
  note(s, 'Ask/K8s answer: ' + r.text.replace(/\s+/g, ' ').slice(0, 700));
  const good = /CKA|AKS|EKS|GKE|Kubernetes/.test(r.text);
  if (!r.links.length) friction(s, 2, 'Ask answer for Kubernetes has no clickable citations.');
  if (/BM25/.test(r.text)) friction(s, 1, 'Fallback badge says "in-browser BM25", engineer jargon; a hiring manager does not know it means "offline search, not AI".');
  if (r.text.length > 1500) friction(s, 1, `Kubernetes answer is ${r.text.length} chars, a wall of retrieved snippets rather than a direct answer.`);
  return { ok: good, detail: { chars: r.text.length, citations: r.links.length } };
});

await task(s, 'Ask: Terraform depth', async () => {
  const r = await ask('How much Terraform has he written? Modules, Terraform Enterprise, at what scale?', 'ask-terraform');
  note(s, 'Ask/Terraform answer: ' + r.text.replace(/\s+/g, ' ').slice(0, 700));
  const good = /Terraform/.test(r.text) && /(landing zone|TFE|Enterprise|module)/i.test(r.text);
  return { ok: good, detail: { chars: r.text.length, citations: r.links.length, refused: /can.?t|don.?t know|not (in|on) (this|the) site/i.test(r.text) } };
});

await task(s, 'Ask an off-topic/salary question (expect polite refusal)', async () => {
  const r = await ask('What salary does he expect and is he willing to relocate to London?', 'ask-salary');
  note(s, 'Ask/salary answer: ' + r.text.replace(/\s+/g, ' ').slice(0, 500));
  const head = r.text.slice(0, 400);
  const refused = /can.?t answer|cannot|don.?t have|not covered|no (relevant )?information|outside (what|the)|isn.?t (in|on|covered)/i.test(head) && !/most relevant passages/i.test(head);
  if (!refused) friction(s, 2, 'Ask fallback did not refuse a salary/relocation question; it returned "the most relevant passages" (AKS landing-zone vending), contradicting the "refuses the rest" promise under the box.');
  return { ok: refused, detail: { chars: r.text.length } };
});

await finish(s);
