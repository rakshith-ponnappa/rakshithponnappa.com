// Persona 10: client CTO (buyer, not a recruiter). Wants to know what he'd be buying, see proof it worked
// for a company like theirs, and reach out about a consulting engagement in under ~3 minutes.
// Run: timeout 120 node tests/personas/client-cto.mjs
import { startSession, go, shot, task, friction, note, finish, sleep, type, press, aboveFoldText } from './_lib-b.mjs';

const s = await startSession('client-cto');
const { page } = s;
const cdp = await page.createCDPSession();
await cdp.send('Page.enable');
const requestedNav = [];
cdp.on('Page.frameRequestedNavigation', (e) => requestedNav.push(e.url));
const body = () => page.evaluate(() => document.body.innerText);
const SERVICE = /landing zone|platform engineering|kubernetes|devsecops|ai (deployment|system|platform)|migration|audit|finops|gitops/gi;

await task(s, 'Home: in one viewport, understand what he sells (services) and to whom', async () => {
  await go(s, '/');
  await sleep(900);
  await shot(s, 'home-fold');
  const fold = await aboveFoldText(page);
  const services = [...new Set((fold.match(SERVICE) || []).map((x) => x.toLowerCase()))];
  const consulting = /consult|engagement|hire me for|work with me|for teams|advis/i.test(fold);
  if (!consulting) friction(s, 2, 'Nothing above the fold says he takes consulting engagements; a buyer reads it as a job-seeker page ("Open to new roles", "Download résumé").');
  return { ok: services.length >= 2, detail: { services, consulting, fold: fold.slice(0, 260) } };
});

await task(s, 'Find a services / "how I can help" list anywhere on the home page', async () => {
  const t = await body();
  const heads = await page.$$eval('main h2, main h3', (h) => h.map((x) => x.innerText.trim()).slice(0, 40));
  const servicesHead = heads.find((h) => /services|what i do|how i (can )?help|engagements?|offer/i.test(h));
  const consultMentions = (t.match(/consult/gi) || []).length;
  if (!servicesHead) friction(s, 2, 'No "Services" / "What I can do for you" section: the buyer has to infer the offer from case-study titles.');
  return { ok: !!servicesHead || consultMentions > 0, detail: { servicesHead: servicesHead || null, consultMentions, h2s: heads.slice(0, 12) } };
});

await task(s, 'Proof: a case study for a company like mine, with a business outcome ($, %, time)', async () => {
  await go(s, '/work/');
  await shot(s, 'work-index');
  const cards = await page.$$eval('main a[href^="/work/"]', (a) =>
    a.filter((x) => x.getAttribute('href') !== '/work/').map((x) => ({ href: x.getAttribute('href'), t: x.innerText.replace(/\s+/g, ' ').slice(0, 160) })),
  );
  const pick = cards.find((c) => /retail|bank|telecom|saas|enterprise|global/i.test(c.t)) || cards[0];
  await go(s, pick.href);
  const t = await body();
  const money = t.match(/\$\s?\d[\d,.]*\s?[KkMm]?[^.\n]{0,40}/g) || [];
  const pct = t.match(/\d+(\.\d+)?\s?%[^.\n]{0,40}/g) || [];
  const outcomeY = await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => /outcome/i.test(h.innerText))?.getBoundingClientRect().top + scrollY);
  await page.evaluate((y) => y && scrollTo(0, y - 80), outcomeY);
  await sleep(400);
  await shot(s, 'case-outcome');
  if (outcomeY > 3000) friction(s, 2, `On ${pick.href} the Outcome is ${Math.round(outcomeY)}px down; a CTO wants the result first (TL;DR box at the top).`);
  return { ok: money.length + pct.length > 0, detail: { cases: cards.length, picked: pick.href, money: money.slice(0, 3), pct: pct.slice(0, 3), outcomeY: Math.round(outcomeY || 0) } };
});

await task(s, 'Ask panel (no backend): "Can he run an Azure landing-zone audit for us?" gets a cited answer', async () => {
  await go(s, '/ask/');
  const input = await page.waitForSelector('[data-ask] input[name="q"]', { visible: true });
  s.clicks++;
  await input.click();
  await type(s, 'Can he run an Azure landing zone audit for our company, and what did it achieve before?', 10);
  await press(s, 'Enter');
  await page.waitForFunction(() => {
    const o = document.querySelector('[data-ask-out]');
    return o && !o.hidden && o.innerText.trim().length > 40 && !/thinking|searching|…$/i.test(o.innerText.slice(-20));
  }, { timeout: 20000 });
  await sleep(1000);
  await shot(s, 'ask-answer');
  const r = await page.$eval('[data-ask-out]', (o) => ({ text: o.innerText, links: [...o.querySelectorAll('a')].map((a) => a.getAttribute('href')) }));
  const mode = (r.text.match(/AI answer · cited|From the site · no AI|Not covered/) || [''])[0];
  const refused = /not covered|can't answer|cannot answer|don't have/i.test(r.text);
  if (mode === 'From the site · no AI') note(s, 'Ask ran in extractive fallback (expected: no /api). Answer is stitched sentences, not a direct yes/no.');
  if (refused) friction(s, 2, 'Ask refused a squarely on-topic buyer question (Azure landing-zone audit).');
  return { ok: !refused && r.links.length > 0, detail: { mode, citations: r.links.slice(0, 4), text: r.text.slice(0, 400) } };
});

await task(s, 'Reach contact as a client: Consulting topic, fill, submit, understand what happened', async () => {
  await go(s, '/');
  const t0 = performance.now();
  const cta = await page.$$eval('a[href^="/contact"]', (a) => a.map((x) => ({ href: x.getAttribute('href'), t: x.innerText.trim() })));
  await go(s, '/contact/?topic=consulting');
  s.clicks++;
  const preselected = await page.$eval('#c-topic', (e) => e.value);
  if (preselected !== 'Consulting') {
    friction(s, 2, `/contact/?topic=consulting does not preselect Consulting (got "${preselected}"); only ?topic=hiring is handled (src/pages/contact.astro:273-274).`);
    await page.select('#c-topic', 'Consulting');
    s.clicks++;
  }
  for (const [sel, v] of [['#c-name', 'Priya Menon'], ['#c-email', 'priya.cto@example.com'], ['#c-msg', 'We need an Azure landing zone audit and a GitOps rollout for 40 AKS clusters. Are you available in Q1?']]) {
    s.clicks++;
    await page.click(sel);
    await type(s, v, 2);
  }
  await shot(s, 'contact-filled');
  s.clicks++;
  await page.click('form[data-contact] button[type="submit"]');
  await sleep(2500);
  await shot(s, 'contact-after-submit');
  const status = await page.evaluate(() => {
    const live = [...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map((e) => e.innerText.trim()).filter(Boolean);
    return { live, url: location.href };
  });
  const mailto = requestedNav.find((u) => u.startsWith('mailto:')) || (status.url.startsWith('mailto:') ? status.url : null);
  if (mailto && !status.live.some((x) => /email|mail app|opening|sent|thanks/i.test(x)))
    friction(s, 2, 'Submit silently hands off to mailto: (API 404). No on-page "Opening your email app…" message; on a machine with no mail client nothing happens.');
  const secs = +((performance.now() - t0) / 1000).toFixed(1);
  return { ok: !!mailto || status.live.some((x) => /sent|thanks|received/i.test(x)), detail: { ctas: cta.slice(0, 4), preselected, mailto: mailto?.slice(0, 160), live: status.live.slice(0, 3), secs } };
});

note(s, 'Buyer verdict hinges on: an explicit "I take engagements" line, a services list, outcome-first case studies and a clear post-submit state.');
await finish(s);
