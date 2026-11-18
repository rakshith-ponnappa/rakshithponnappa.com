// Persona 6 — Keyboard-only + screen-reader user (desktop, no mouse at all).
// Run: timeout 120 node tests/personas/keyboard-sr.mjs
import { startSession, go, shot, task, friction, note, finish, sleep, press, type, combo } from './_lib-b.mjs';

const s = await startSession('keyboard-sr');
const { page } = s;
const cdp = await page.createCDPSession();
await cdp.send('Page.enable');
const requestedNav = [];
cdp.on('Page.frameRequestedNavigation', (e) => requestedNav.push(e.url));
page.on('dialog', (d) => d.dismiss().catch(() => {}));

// Describe the focused element and whether a focus indicator is actually painted.
const focusInfo = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: 'body' };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const ring = cs.boxShadow && cs.boxShadow !== 'none';
    let parentRing = false;
    for (let p = el.parentElement, i = 0; p && i < 3 && !parentRing; p = p.parentElement, i++) {
      const pc = getComputedStyle(p);
      parentRing = p.matches(':focus-within') && pc.boxShadow !== 'none' && /0px 0px 0px [1-9]/.test(pc.boxShadow);
    }
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    return {
      tag: el.tagName.toLowerCase(),
      name,
      href: el.getAttribute('href'),
      landmark: el.closest('header,nav,main,footer,dialog,aside')?.tagName.toLowerCase(),
      siteFooter: !!el.closest('body > footer, .site-footer, [role=contentinfo]'),
      visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight + 2000,
      inViewport: r.top >= 0 && r.bottom <= innerHeight,
      focusVisible: el.matches(':focus-visible'),
      indicator: outline ? `outline ${cs.outlineWidth} ${cs.outlineStyle}` : ring ? 'box-shadow' : parentRing ? 'parent :focus-within ring' : 'none',
    };
  });

const stops = [];
await task(s, 'First Tab lands on a visible "Skip to content" link', async () => {
  await go(s, '/');
  await sleep(800);
  await press(s, 'Tab');
  const f = await focusInfo();
  stops.push(f);
  await shot(s, 'tab1-skip-link');
  const vis = await page.evaluate(() => {
    const r = document.activeElement.getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.width > 1 && r.height > 1;
  });
  if (!vis) friction(s, 3, 'Skip link receives focus but is not visible on screen.');
  return { ok: /skip/i.test(f.name) && vis, detail: f };
});

await task(s, 'Activating the skip link moves focus into <main>', async () => {
  await press(s, 'Enter');
  await sleep(300);
  const f = await page.evaluate(() => ({ id: document.activeElement.id, inMain: !!document.activeElement.closest('main') }));
  await press(s, 'Tab');
  const next = await focusInfo();
  return { ok: f.id === 'main' || f.inMain, detail: { after: f, nextStop: next } };
});

await task(s, 'Tab through the home page: every stop has a visible focus indicator and a name', async () => {
  await go(s, '/');
  await sleep(600);
  stops.length = 0;
  for (let i = 0; i < 80; i++) {
    await press(s, 'Tab');
    let f = await focusInfo();
    if (!f.visible) {
      await sleep(300); // skip links animate in; re-measure before judging
      f = await focusInfo();
    }
    stops.push(f);
    if (i === 6) await shot(s, 'tab-header-stop');
    if (i === 20) await shot(s, 'tab-mid-page-stop');
    if (f.siteFooter) break;
  }
  const noIndicator = stops.filter((f) => f.tag !== 'body' && f.indicator === 'none');
  const noName = stops.filter((f) => f.tag !== 'body' && !f.name);
  const hidden = stops.filter((f) => f.tag !== 'body' && !f.visible);
  note(s, 'Home tab order: ' + stops.map((f, i) => `${i + 1}.${f.tag}[${f.landmark ?? '-'}] "${f.name}"`).join(' | '));
  if (noIndicator.length) friction(s, 3, `${noIndicator.length} focus stop(s) with no outline/box-shadow: ${noIndicator.slice(0, 4).map((f) => f.name || f.tag).join('; ')}`);
  if (noName.length) friction(s, 3, `${noName.length} focus stop(s) without an accessible name: ${noName.slice(0, 4).map((f) => f.tag + ' ' + (f.href || '')).join('; ')}`);
  if (hidden.length) friction(s, 2, `${hidden.length} focus stop(s) on invisible elements: ${hidden.slice(0, 4).map((f) => f.name || f.tag).join('; ')}`);
  const toMain = stops.findIndex((f) => f.landmark === 'main');
  if (toMain > 10) friction(s, 1, `${toMain} Tab presses to reach the first control in <main> without the skip link.`);
  return { ok: !noIndicator.length && !noName.length, detail: { stops: stops.length, firstMainStop: toMain + 1, noIndicator: noIndicator.length, noName: noName.length, hidden: hidden.length } };
});

let outline = [];
await task(s, 'Landmarks and heading outline (accessibility tree) make sense on /, a case study and /contact', async () => {
  const report = {};
  for (const url of ['/', '/work/eks-30000-site-migration/', '/contact/']) {
    await go(s, url);
    await sleep(500);
    const snap = await page.accessibility.snapshot({ interestingOnly: true });
    const lm = [];
    const hs = [];
    const walk = (n) => {
      if (!n) return;
      if (['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region', 'search', 'form'].includes(n.role)) lm.push(`${n.role}${n.name ? ':' + n.name : ''}`);
      if (n.role === 'heading') hs.push({ level: n.level, name: (n.name || '').slice(0, 60) });
      (n.children || []).forEach(walk);
    };
    walk(snap);
    const h1 = hs.filter((h) => h.level === 1).length;
    const hashed = hs.filter((h) => /^#/.test(h.name));
    if (hashed.length) friction(s, 2, `${url}: ${hashed.length} heading(s) are announced with a literal "##" prefix (CSS ::before content is in the accessible name), e.g. "${hashed[0].name}".`);
    const skips = [];
    for (let i = 1; i < hs.length; i++) if (hs[i].level > hs[i - 1].level + 1) skips.push(`h${hs[i - 1].level}→h${hs[i].level} "${hs[i].name}"`);
    const navs = lm.filter((l) => l.startsWith('navigation'));
    report[url] = { hashed: hashed.length, landmarks: lm, h1, headingCount: hs.length, skips, outline: hs.map((h) => `${'  '.repeat(h.level - 1)}h${h.level} ${h.name}`) };
    if (url === '/') outline = report[url].outline;
    if (h1 !== 1) friction(s, 2, `${url} has ${h1} <h1> in the accessibility tree.`);
    if (skips.length) friction(s, 2, `Heading level skips on ${url}: ${skips.slice(0, 3).join('; ')}`);
    if (!lm.includes('main')) friction(s, 3, `No main landmark on ${url}.`);
    if (new Set(navs).size !== navs.length) friction(s, 1, `Duplicate unnamed navigation landmarks on ${url}: ${navs.join(', ')}`);
  }
  return { ok: Object.values(report).every((r) => r.h1 === 1 && r.landmarks.includes('main') && !r.hashed), detail: report };
});

await task(s, '⌘K opens the palette with focus in the input; type, arrow, Enter navigates; Esc restores focus', async () => {
  await go(s, '/');
  await sleep(600);
  await press(s, 'Tab', 3); // focus somewhere in the header first, so we can check focus return
  const before = await focusInfo();
  await combo(s, 'Meta', 'k');
  await sleep(300);
  let open = await page.evaluate(() => document.querySelector('[data-cmdk]').open);
  let used = 'Meta+K';
  if (!open) {
    await combo(s, 'Control', 'k');
    await sleep(300);
    open = await page.evaluate(() => document.querySelector('[data-cmdk]').open);
    used = 'Ctrl+K';
  }
  const inInput = await page.evaluate(() => document.activeElement?.matches('[data-cmdk-input]'));
  await type(s, 'kubernetes');
  await sleep(300);
  const opts = await page.$$eval('[data-cmdk-list] [role=option]', (os) => os.map((o) => o.innerText.replace(/\s+/g, ' ').slice(0, 60)));
  const announced = await page.evaluate(() => ({ live: document.querySelector('[data-cmdk-out]')?.textContent?.trim().slice(0, 80) || '', count: document.querySelector('[data-cmdk-list]')?.children.length }));
  await press(s, 'ArrowDown');
  const ad = await page.evaluate(() => {
    const i = document.querySelector('[data-cmdk-input]');
    const id = i.getAttribute('aria-activedescendant');
    return { id, label: id && document.getElementById(id)?.innerText.replace(/\s+/g, ' ').slice(0, 60) };
  });
  await shot(s, 'cmdk-open');
  await press(s, 'Escape');
  await sleep(250);
  const after = await focusInfo();
  const closed = await page.evaluate(() => !document.querySelector('[data-cmdk]').open);
  // Re-open and actually navigate with Enter.
  await combo(s, used.startsWith('Meta') ? 'Meta' : 'Control', 'k');
  await sleep(200);
  await type(s, 'resume');
  await sleep(200);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }).catch(() => null), press(s, 'Enter')]);
  const landed = new URL(page.url()).pathname;
  const restored = after.name === before.name && after.tag === before.tag;
  if (!restored) friction(s, 2, `After Esc, focus went to ${after.tag} "${after.name}" instead of back to ${before.tag} "${before.name}".`);
  if (!announced.live) friction(s, 1, 'Palette result count is not announced: the aria-live region stays empty while filtering (SR users hear nothing as the list changes).');
  return { ok: open && inInput && opts.length > 0 && !!ad.id && closed, detail: { used, inInput, results: opts.slice(0, 4), activeDescendant: ad, focusRestored: restored, before, after, landed, announced } };
});

await task(s, 'Contact form by keyboard: empty submit focuses first error; filled submit gives feedback (API 404 → mailto fallback)', async () => {
  await go(s, '/contact/');
  await sleep(600);
  // Reach the form by tabbing only.
  let guard = 0;
  let f;
  do {
    await press(s, 'Tab');
    f = await page.evaluate(() => document.activeElement?.id || '');
  } while (f !== 'c-topic' && ++guard < 40);
  const tabsToForm = guard + 1;
  await press(s, 'ArrowDown'); // change the select with the keyboard
  const topic = await page.$eval('#c-topic', (e) => e.value);
  // Jump to the submit button and submit empty.
  for (let i = 0; i < 4; i++) await press(s, 'Tab');
  const onSubmit = await page.evaluate(() => document.activeElement?.type === 'submit');
  await press(s, 'Enter');
  await sleep(300);
  const firstInvalid = await page.evaluate(() => ({ id: document.activeElement?.id, invalid: document.activeElement?.matches(':invalid'), describedBy: document.activeElement?.getAttribute('aria-describedby'), ariaInvalid: document.activeElement?.getAttribute('aria-invalid') }));
  await shot(s, 'contact-empty-submit');
  // Fill it.
  await page.focus('#c-name');
  await type(s, 'Kay Board', 5);
  await press(s, 'Tab');
  await type(s, 'kay@example.com', 5);
  await press(s, 'Tab');
  await type(s, 'Testing the contact form with the keyboard only.', 2);
  requestedNav.length = 0;
  await press(s, 'Tab');
  await press(s, 'Enter');
  await sleep(1500);
  const state = await page.evaluate(() => ({
    err: document.querySelector('[data-err]')?.textContent.trim(),
    done: !document.querySelector('[data-done]')?.hidden,
    focus: document.activeElement?.tagName.toLowerCase() + ' ' + (document.activeElement?.innerText || '').trim().slice(0, 30),
  }));
  await shot(s, 'contact-after-submit');
  const mailto = requestedNav.find((u) => u.startsWith('mailto:'));
  if (!firstInvalid.invalid) friction(s, 2, 'Empty submit did not move focus to the first invalid field.');
  if (firstInvalid.invalid && !firstInvalid.ariaInvalid && !firstInvalid.describedBy)
    friction(s, 1, 'Validation relies on the browser bubble only: no aria-invalid / aria-describedby inline error text that persists for SR users.');
  if (/^body/.test(state.focus)) friction(s, 2, 'After submitting, keyboard focus is dropped to <body> (the submit button is disabled while the request runs), so SR/keyboard users lose their place.');
  if (mailto && !state.err && !state.done)
    friction(s, 2, 'With the API down, submit silently hands off to mailto:. No on-page status ("Opening your email app…") is announced; if no mail client is set up, nothing visibly happens.');
  return { ok: firstInvalid.invalid && (state.done || !!mailto || !!state.err), detail: { tabsToForm, topic, onSubmit, firstInvalid, state, mailto: mailto?.slice(0, 90) } };
});

await task(s, 'Mobile menu (popover) is operable by keyboard at 390px and returns focus', async () => {
  await page.setViewport({ width: 390, height: 844 });
  await go(s, '/');
  await sleep(500);
  await page.focus('.menu-btn');
  await press(s, 'Enter');
  await sleep(300);
  const open = await page.evaluate(() => document.querySelector('#mobile-nav').matches(':popover-open'));
  await press(s, 'Tab');
  const inMenu = await page.evaluate(() => !!document.activeElement.closest('#mobile-nav'));
  await press(s, 'Escape');
  await sleep(200);
  const back = await page.evaluate(() => document.activeElement.matches('.menu-btn'));
  const expanded = await page.$eval('.menu-btn', (b) => b.getAttribute('aria-expanded'));
  if (!back) friction(s, 2, 'Focus not returned to the menu button after Esc.');
  return { ok: open && inMenu && back, detail: { open, inMenu, focusBack: back, ariaExpanded: expanded } };
});

await finish(s, { outlineHome: outline });
