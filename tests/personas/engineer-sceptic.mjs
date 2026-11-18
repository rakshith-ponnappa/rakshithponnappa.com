// Persona 9: sceptical senior engineer. Pokes at the "proof" pages, the GitHub links, the ⌘K easter eggs
// and whether dates/numbers agree across pages and machine-readable files.
// Run: timeout 120 node tests/personas/engineer-sceptic.mjs
import { startSession, go, shot, task, friction, note, finish, sleep, type, combo, fetchText, writeJson } from './_lib-b.mjs';

const s = await startSession('engineer-sceptic');
const { page } = s;
page.on('dialog', (d) => d.dismiss().catch(() => {}));
const text = () => page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText);

await task(s, '/evals: shows real numbers, a method and a date (not just adjectives)', async () => {
  const r = await go(s, '/evals/');
  await shot(s, 'evals', { fullPage: true });
  const t = await text();
  const nums = (t.match(/\d+(\.\d+)?\s*%|\b\d+\s*\/\s*\d+\b/g) || []).length;
  const method = /method|how (it|this) (works|is measured)|dataset|golden|questions?|metric/i.test(t);
  const date = /20\d\d-\d\d-\d\d|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+20\d\d|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20\d\d/i.test(t);
  const src = await page.$$eval('main a[href*="github.com"]', (a) => a.map((x) => x.href));
  if (!date) friction(s, 2, '/evals has no visible run date; a sceptic cannot tell if the numbers are stale.');
  if (!src.length) friction(s, 1, '/evals links to no source/CI run, so the numbers cannot be reproduced.');
  return { ok: r.status() === 200 && nums > 0 && method, detail: { status: r.status(), nums, method, date, sourceLinks: src.slice(0, 3), words: t.split(/\s+/).length } };
});

await task(s, '/status: says what it measures and is not a fake green light', async () => {
  const r = await go(s, '/status/');
  await sleep(800);
  await shot(s, 'status', { fullPage: true });
  const t = await text();
  const operational = /operational/i.test(t);
  const explains = /(static|simulated|not a real|for fun|tongue|joke|measured|checks?|last (checked|updated)|build)/i.test(t);
  const ts = /20\d\d-\d\d-\d\d|ago|UTC|last (checked|updated|deploy)/i.test(t);
  if (!explains) friction(s, 2, '/status never says what is actually monitored; an engineer reads a permanent green light as theatre.');
  if (!ts) friction(s, 1, '/status shows no timestamp / last-checked time.');
  const statusHeadline = (t.match(/all systems operational|partial degradation|major outage|degraded/i) || [''])[0];
  await go(s, '/');
  await sleep(800);
  const homePill = (await page.evaluate(() => document.body.innerText).then((x) => x.match(/all systems operational|partial degradation|major outage|degraded/i)) || [''])[0];
  if (statusHeadline && homePill && statusHeadline.toLowerCase() !== homePill.toLowerCase())
    friction(s, 2, `Home status pill says "${homePill}" but /status says "${statusHeadline}" at the same moment.`);
  return { ok: r.status() === 200 && operational, detail: { status: r.status(), operational, explains, ts, statusHeadline, homePill, head: t.slice(0, 300) } };
});

await task(s, 'Every project links to a well-formed GitHub repo, and the repos resolve', async () => {
  await go(s, '/projects/');
  const pages = [...new Set(await page.$$eval('main a[href^="/projects/"]', (a) => a.map((x) => x.getAttribute('href')).filter((h) => h !== '/projects/')))];
  const per = {};
  for (const p of pages) {
    await go(s, p);
    per[p] = [...new Set(await page.$$eval('main a[href*="github.com"]', (a) => a.map((x) => x.href)))];
  }
  await shot(s, 'project-last');
  const all = [...new Set(Object.values(per).flat())];
  const bad = all.filter((h) => !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?($|[#?/])/.test(h));
  const missing = Object.entries(per).filter(([, v]) => !v.length).map(([k]) => k);
  const repoChecks = {};
  for (const h of all.filter((x) => !bad.includes(x)).slice(0, 15)) {
    try {
      const res = await fetch(h, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000) });
      repoChecks[h] = res.status;
    } catch (e) {
      repoChecks[h] = 'offline:' + e.name;
    }
  }
  const dead = Object.entries(repoChecks).filter(([, v]) => v === 404).map(([k]) => k);
  if (missing.length) friction(s, 2, `${missing.length} project page(s) have no GitHub link: ${missing.join(', ')}`);
  if (dead.length) friction(s, 3, `GitHub repo links return 404 (private or renamed?): ${dead.join(', ')}`);
  return { ok: pages.length > 0 && !bad.length && !dead.length, detail: { projects: pages.length, links: all.length, bad, missing, repoChecks } };
});

async function palette(cmd) {
  await go(s, '/');
  await combo(s, 'Meta', 'k');
  await page.waitForSelector('dialog[data-cmdk][open] [data-cmdk-input]', { visible: true });
  await type(s, cmd, 15);
  await page.keyboard.press('Enter');
  s.keys++;
}

await task(s, '⌘K `whoami` prints a terminal-style identity', async () => {
  await palette('whoami');
  await sleep(300);
  const out = await page.$eval('[data-cmdk-out]', (e) => (e.hidden ? '' : e.innerText));
  await shot(s, 'whoami');
  return { ok: /rakshith/i.test(out) && /engineer/i.test(out), detail: { out } };
});

await task(s, '⌘K `sudo hire rakshith` routes to /contact with the Hiring topic preselected', async () => {
  await palette('sudo hire rakshith');
  await sleep(300);
  const out = await page.$eval('[data-cmdk-out]', (e) => e.innerText);
  await shot(s, 'sudo-hire');
  await page.waitForFunction(() => location.pathname.startsWith('/contact'), { timeout: 6000 });
  await sleep(500);
  const topic = await page.evaluate(() => {
    const sel = document.querySelector('form select');
    const radio = document.querySelector('form input[type=radio]:checked');
    return sel ? sel.options[sel.selectedIndex]?.text : radio ? radio.value : null;
  });
  await shot(s, 'contact-after-sudo');
  if (!/hir/i.test(topic || '')) friction(s, 2, `sudo hire landed on /contact but topic is "${topic}", not Hiring.`);
  return { ok: /contact/.test(page.url()) && /hir/i.test(topic || ''), detail: { out, url: page.url().replace(/^https?:\/\/[^/]+/, ''), topic } };
});

await task(s, 'Cross-page consistency: years of experience, career start, headline title, key numbers', async () => {
  const sources = ['/', '/resume/', '/experience/', '/evals/', '/status/'];
  const found = {};
  const grab = (t) => ({
    years: [...new Set((t.match(/\b(\d{1,2})\+?\s*(?:years|yrs)\b/gi) || []).map((m) => m.replace(/\s+/g, ' ').toLowerCase()))],
    since: [...new Set((t.match(/since 20\d\d|20\d\d\s*[–-]\s*(present|now)/gi) || []).map((m) => m.toLowerCase()))],
    sites: [...new Set(t.match(/\b30,?000\b[^.\n]{0,25}/g) || [])],
    certs: [...new Set((t.match(/\b\d{1,2}\s+(?:certifications|certs|certificates)\b/gi) || []).map((m) => m.toLowerCase()))],
  });
  for (const u of sources) {
    await go(s, u);
    found[u] = grab(await page.evaluate(() => document.body.innerText));
  }
  for (const u of ['/llms.txt', '/resume.json']) found[u] = grab((await fetchText(u)).text);
  await palette('uptime');
  await sleep(300);
  const uptime = await page.$eval('[data-cmdk-out]', (e) => e.innerText);
  const yearsNums = [...new Set(Object.values(found).flatMap((f) => f.years.map((y) => +y.match(/\d+/)[0])).filter((n) => n >= 8))];
  const certNums = [...new Set(Object.values(found).flatMap((f) => f.certs.map((c) => +c.match(/\d+/)[0])))];
  const label = JSON.parse((await fetchText('/resume.json')).text).basics?.label;
  if (yearsNums.length > 1) friction(s, 2, `Career length stated differently across pages: ${yearsNums.join(' vs ')} years.`);
  if (certNums.length > 1) friction(s, 2, `Certification count differs across pages: ${certNums.join(' vs ')}.`);
  if (!found['/resume/'].years.some((y) => +y.match(/\d+/)[0] >= 8)) friction(s, 2, '/resume/ (HTML) never states total years of experience, unlike the home page and llms.txt.');
  writeJson(s, 'consistency.json', { found, uptime, label });
  return { ok: yearsNums.length <= 1 && certNums.length <= 1, detail: { yearsNums, certNums, uptime, label } };
});

note(s, 'Sceptic verdict is driven by: dated eval numbers, honest /status copy, live repos, and numbers that agree everywhere.');
await finish(s);
