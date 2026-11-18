// Persona 5 — Mobile commuter: iPhone 13-class viewport, CPU 4x slowdown, Slow 4G (Lighthouse "slow 4G" profile).
// Run: timeout 120 node tests/personas/mobile-slow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { startSession, go, shot, task, friction, note, finish, sleep, IPHONE_UA, BASE } from './_lib-b.mjs';

const s = await startSession('mobile-slow', { viewport: { width: 390, height: 844 }, mobile: true });
const { page } = s;
await page.setUserAgent(IPHONE_UA);
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
// Slow 4G: 150 ms RTT, ~1.6 Mbps down, ~750 kbps up.
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

// LCP + first-input readiness observers, installed before any page script.
await page.evaluateOnNewDocument(() => {
  window.__lcp = 0;
  window.__lcpEl = '';
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__lcp = e.startTime;
      const el = e.element;
      window.__lcpEl = el ? `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} "${(el.textContent || '').trim().slice(0, 50)}"` : e.url;
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  window.__cls = 0;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
  window.__longTasks = 0;
  try {
    new PerformanceObserver((l) => (window.__longTasks += l.getEntries().length)).observe({ type: 'longtask', buffered: true });
  } catch {}
});

const perf = {};
await task(s, 'Home loads on Slow 4G + 4x CPU; LCP <= 2.5 s (good) / <= 4 s (needs improvement)', async () => {
  const t0 = Date.now();
  await go(s, '/', 'domcontentloaded');
  perf.dcl = Date.now() - t0;
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 45000 });
  perf.load = Date.now() - t0;
  // Time to first interaction: the menu button is tappable and its popover opens.
  const tti0 = Date.now();
  await page.waitForSelector('.menu-btn', { visible: true });
  perf.menuVisibleAt = Date.now() - t0;
  await sleep(1500);
  // Freeze LCP by tapping (LCP stops at first input).
  Object.assign(
    perf,
    await page.evaluate(() => ({
      lcp: Math.round(window.__lcp),
      lcpEl: window.__lcpEl,
      cls: +window.__cls.toFixed(3),
      longTasks: window.__longTasks,
      fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
      transferKB: Math.round(performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) / 1024) +
        Math.round((performance.getEntriesByType('navigation')[0]?.transferSize || 0) / 1024),
      resources: performance.getEntriesByType('resource').length,
    })),
  );
  perf.ttiProbeMs = Date.now() - tti0;
  await shot(s, 'home-first-viewport');
  if (perf.lcp > 2500) friction(s, perf.lcp > 4000 ? 3 : 2, `LCP ${perf.lcp} ms on Slow 4G/4x CPU (element: ${perf.lcpEl}).`);
  if (perf.cls > 0.1) friction(s, 2, `CLS ${perf.cls} on mobile load.`);
  return { ok: perf.lcp > 0 && perf.lcp <= 4000, detail: perf };
});

await task(s, 'Time to first interaction: tap the menu, popover opens', async () => {
  const t0 = Date.now();
  await page.tap('.menu-btn');
  await page.waitForSelector('#mobile-nav:popover-open', { timeout: 8000 });
  perf.menuOpenMs = Date.now() - t0;
  await sleep(400);
  await shot(s, 'menu-open');
  const links = await page.$$eval('#mobile-nav a', (as) => as.map((a) => ({ t: a.textContent.trim(), h: Math.round(a.getBoundingClientRect().height) })));
  note(s, 'Mobile menu links: ' + links.map((l) => `${l.t}(${l.h}px)`).join(', '));
  // Close it again with the close button.
  await page.tap('#mobile-nav [popovertargetaction="hide"]');
  await sleep(300);
  const closed = await page.evaluate(() => !document.querySelector('#mobile-nav').matches(':popover-open'));
  if (perf.menuOpenMs > 300) friction(s, 2, `Menu took ${perf.menuOpenMs} ms to open after tap under 4x CPU.`);
  return { ok: closed && links.length >= 5, detail: { menuOpenMs: perf.menuOpenMs, links: links.length, closed } };
});

async function auditTargets(label) {
  return page.evaluate(() => {
    const small = [];
    const seen = new Set();
    const all = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],summary,[tabindex]:not([tabindex="-1"])')];
    const rects = all.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    // WCAG 2.2 SC 2.5.8 spacing exception: a 24px circle centred on the target must not touch any other target.
    const spaced = (r) => {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return rects.every((o) => {
        if (o.left === r.left && o.top === r.top && o.width === r.width) return true;
        const dx = Math.max(o.left - cx, 0, cx - o.right), dy = Math.max(o.top - cy, 0, cy - o.bottom);
        return Math.hypot(dx, dy) >= 12;
      });
    };
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden],dialog:not([open]),[popover]:not(:popover-open)')) continue;
      // WCAG 2.2 SC 2.5.8 exception: inline links inside a sentence.
      const inline = cs.display === 'inline' && el.tagName === 'A' && el.parentElement && /^(P|LI|SPAN|TD|DD)$/.test(el.parentElement.tagName) && (el.parentElement.textContent.trim().length > el.textContent.trim().length + 20);
      if (inline) continue;
      if ((r.width < 23.5 || r.height < 23.5) && !spaced(r)) {
        const k = (el.getAttribute('aria-label') || el.textContent.trim() || el.getAttribute('href') || el.tagName).slice(0, 40);
        if (seen.has(k)) continue;
        seen.add(k);
        small.push({ where: el.closest('header,footer,nav,main')?.tagName.toLowerCase(), el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''), label: k, w: Math.round(r.width), h: +r.height.toFixed(1) });
      }
    }
    return small;
  });
}

async function overflow() {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const culprits = [];
    if (sw > vw)
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && r.width > 0 && !el.closest('pre,[data-scroll-x],.table-wrap')) {
          culprits.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)}`);
          if (culprits.length > 5) break;
        }
      }
    return { vw, sw, overflow: sw > vw, culprits };
  });
}

const targetReport = {};
const overflowReport = {};
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); // speed the rest of the walk; perf already measured
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: -1, uploadThroughput: -1 });

for (const url of ['/', '/work/', '/work/eks-30000-site-migration/', '/projects/talentlens/', '/resume/', '/contact/']) {
  await task(s, `Tap targets >= 24px and no horizontal overflow on ${url}`, async () => {
    await go(s, url);
    await sleep(600);
    const small = await auditTargets();
    const of = await overflow();
    targetReport[url] = small;
    overflowReport[url] = of;
    if (of.overflow) {
      await shot(s, 'overflow-' + url.replace(/\W+/g, '_'));
      friction(s, 3, `Horizontal overflow on ${url}: scrollWidth ${of.sw} > ${of.vw}. ${of.culprits.slice(0, 3).join('; ')}`);
    }
    if (small.length) friction(s, 2, `${small.length} tap target(s) < 24px on ${url}: ${small.slice(0, 4).map((x) => `${x.label} ${x.w}x${x.h}`).join('; ')}`);
    return { ok: !of.overflow && small.length === 0, detail: { small: small.slice(0, 6), overflow: of.overflow, sw: of.sw } };
  });
}

await task(s, 'Résumé PDF download link works (HEAD 200, application/pdf, reachable from home + /resume)', async () => {
  const hrefs = {};
  for (const url of ['/', '/resume/']) {
    await go(s, url);
    hrefs[url] = await page.$$eval('a[href$=".pdf"]', (as) => as.map((a) => ({ href: a.getAttribute('href'), dl: a.hasAttribute('download'), text: a.textContent.trim().slice(0, 40), h: Math.round(a.getBoundingClientRect().height) })));
  }
  const pdf = hrefs['/resume/'][0]?.href || hrefs['/'][0]?.href;
  const r = pdf ? await fetch(BASE + pdf, { method: 'HEAD' }) : null;
  const size = r ? +r.headers.get('content-length') : 0;
  const detail = { hrefs, status: r?.status, type: r?.headers.get('content-type'), sizeKB: Math.round(size / 1024) };
  if (!hrefs['/'].length) friction(s, 2, 'No résumé PDF link on the mobile home page.');
  if (size > 600 * 1024) friction(s, 1, `Résumé PDF is ${detail.sizeKB} KB, heavy on Slow 4G.`);
  return { ok: r?.status === 200 && /pdf/.test(detail.type || ''), detail };
});

await task(s, 'tel: and mailto: links present, well-formed and tappable on /contact and /resume', async () => {
  const out = {};
  for (const url of ['/', '/contact/', '/resume/']) {
    await go(s, url);
    out[url] = await page.$$eval('a[href^="tel:"],a[href^="mailto:"]', (as) =>
      as.map((a) => {
        const r = a.getBoundingClientRect();
        return { href: a.getAttribute('href'), w: Math.round(r.width), h: +r.height.toFixed(1), visible: r.width > 0 };
      }),
    );
  }
  const all = Object.values(out).flat();
  const tel = all.filter((l) => l.href.startsWith('tel:'));
  const mail = all.filter((l) => l.href.startsWith('mailto:'));
  const telOk = tel.length && tel.every((l) => /^tel:\+\d{10,15}$/.test(l.href));
  const mailOk = mail.length && mail.every((l) => /^mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}/i.test(l.href));
  if (!out['/'].some((l) => l.href.startsWith('tel:') && l.visible)) friction(s, 1, 'No visible tel: link on the mobile home page (phone only on /contact and /resume).');
  const tiny = all.filter((l) => l.visible && l.h < 23.5);
  if (tiny.length) friction(s, 1, `tel:/mailto: links under 24px tall (pass WCAG 2.5.8 only via the spacing exception; far below the 44px iOS guideline): ${tiny.map((t) => `${t.href} ${t.w}x${t.h}`).join('; ')}`);
  await go(s, '/contact/');
  await shot(s, 'contact-mobile', { fullPage: false });
  return { ok: !!telOk && !!mailOk, detail: out };
});

await finish(s, { perf, targetReport, overflowReport });
fs.writeFileSync(path.join(s.out, 'perf.json'), JSON.stringify(perf, null, 2));
