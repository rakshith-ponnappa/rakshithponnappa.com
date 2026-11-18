// Shared harness for the simulated persona runs. Read-only against the site: it only navigates, clicks and types.
// Usage: node tests/personas/<persona>.mjs   (env: BASE, PERSONA_OUT, PUPPETEER_PATH, CHROME_PATH, HEADFUL=1)
import fs from 'node:fs';
import path from 'node:path';

export const BASE = process.env.BASE || 'http://127.0.0.1:4321';
export const OUT_ROOT =
  process.env.PERSONA_OUT || path.resolve('test-results/persona-runs');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function loadPuppeteer() {
  if (process.env.PUPPETEER_PATH) return (await import(process.env.PUPPETEER_PATH)).default;
  try {
    return (await import('puppeteer')).default;
  } catch {
    const dir = fs.readFileSync('/tmp/mmd_workdir', 'utf8').trim();
    return (await import(path.join(dir, 'node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js'))).default;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startSession(persona, { viewport = { width: 1440, height: 900 }, mobile = false } = {}) {
  const puppeteer = await loadPuppeteer();
  const out = path.join(OUT_ROOT, persona);
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.HEADFUL ? false : 'new',
    // The site ships speculation-rules prerendering; activating a prerendered page swaps the
    // main frame and Puppeteer then throws "detached Frame". Real users still get prerender.
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-features=Prerender2,PrerenderFallbackToPreconnect'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  await page.setViewport(
    mobile ? { ...viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : viewport,
  );
  const s = {
    persona,
    out,
    browser,
    page,
    clicks: 0,
    keys: 0,
    consoleErrors: [],
    failedRequests: [],
    tasks: [],
    friction: [],
    notes: [],
    shots: [],
    _shot: 0,
  };
  page.on('pageerror', (e) => s.consoleErrors.push({ url: page.url(), msg: 'pageerror: ' + e.message }));
  page.on('console', (m) => {
    if (m.type() === 'error') s.consoleErrors.push({ url: page.url(), msg: m.text() });
  });
  page.on('response', (r) => {
    if (r.status() >= 400) s.failedRequests.push({ status: r.status(), url: r.url().replace(BASE, '') });
  });
  return s;
}

export async function shot(s, name, opts = {}) {
  const file = path.join(s.out, `${String(++s._shot).padStart(2, '0')}-${name}.png`);
  await s.page.screenshot({ path: file, ...opts });
  s.shots.push(file);
  return file;
}

export async function go(s, url, waitUntil = 'load') {
  await s.page.goto(url.startsWith('http') ? url : BASE + url, { waitUntil, timeout: 30_000 });
}

export async function click(s, selector, { nav = false } = {}) {
  s.clicks++;
  const el = typeof selector === 'string' ? await s.page.waitForSelector(selector, { visible: true, timeout: 8000 }) : selector;
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  if (nav) {
    // waitForNavigation can miss fast or soft (view-transition) navigations and then burns
    // its full timeout, so wait for the URL to change and the document to finish loading instead.
    const before = s.page.url();
    await el.click();
    await s.page.waitForFunction((u) => location.href !== u && document.readyState === 'complete', { timeout: 15_000 }, before).catch(() => {});
  } else await el.click();
}

export async function tap(s, selector) {
  s.clicks++;
  const el = typeof selector === 'string' ? await s.page.waitForSelector(selector, { visible: true, timeout: 8000 }) : selector;
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await el.tap();
}

export async function type(s, text, delay = 25) {
  s.keys += [...text].length;
  await s.page.keyboard.type(text, { delay });
}

export async function press(s, key, times = 1) {
  for (let i = 0; i < times; i++) {
    s.keys++;
    await s.page.keyboard.press(key);
  }
}

export async function combo(s, mod, key) {
  s.keys++;
  await s.page.keyboard.down(mod);
  await s.page.keyboard.press(key);
  await s.page.keyboard.up(mod);
}

export async function scroll(s, px = 700, steps = 1) {
  for (let i = 0; i < steps; i++) {
    await s.page.mouse.wheel({ deltaY: px });
    await sleep(250);
  }
}

export function friction(s, sev, text, evidence) {
  s.friction.push({ sev, text, evidence: evidence ?? s.shots.at(-1) ?? null });
}

export function note(s, text) {
  s.notes.push(text);
}

// Runs a task, timing it and counting the clicks/keys it consumed. fn returns true/false (or throws => fail).
export async function task(s, name, fn) {
  const c0 = s.clicks,
    k0 = s.keys,
    t0 = performance.now();
  let ok = false,
    error = null,
    detail = null;
  try {
    const r = await fn();
    if (r && typeof r === 'object') ({ ok, detail } = r);
    else ok = !!r;
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  const t = {
    name,
    success: ok ? 'y' : 'n',
    seconds: +((performance.now() - t0) / 1000).toFixed(1),
    clicks: s.clicks - c0,
    keystrokes: s.keys - k0,
    detail,
    error,
  };
  s.tasks.push(t);
  console.log(`[${s.persona}] ${ok ? 'PASS' : 'FAIL'} ${name} (${t.seconds}s, ${t.clicks} clicks, ${t.keystrokes} keys)${detail ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''}${error ? ' !! ' + error : ''}`);
  return ok;
}

export async function finish(s, extra = {}) {
  await s.browser.close();
  const result = {
    persona: s.persona,
    ranAt: new Date().toISOString(),
    base: BASE,
    tasks: s.tasks,
    totals: { clicks: s.clicks, keystrokes: s.keys },
    friction: s.friction,
    notes: s.notes,
    consoleErrors: s.consoleErrors,
    failedRequests: [...new Map(s.failedRequests.map((r) => [r.url, r])).values()],
    screenshots: s.shots,
    ...extra,
  };
  fs.writeFileSync(path.join(s.out, 'results.json'), JSON.stringify(result, null, 2));
  console.log(`[${s.persona}] friction:`);
  for (const f of s.friction) console.log(`  - (${f.sev}) ${f.text}`);
  console.log(`[${s.persona}] console errors: ${s.consoleErrors.length}`, s.consoleErrors.slice(0, 5));
  console.log(`[${s.persona}] results -> ${path.join(s.out, 'results.json')}`);
  return result;
}

// Visible text inside the first viewport (what a 5-second scanner actually sees).
export async function aboveFoldText(page) {
  return page.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode,
        el = n.parentElement;
      if (!n.textContent.trim() || !el) continue;
      const r = el.getBoundingClientRect(),
        cs = getComputedStyle(el);
      if (r.bottom > 0 && r.top < innerHeight && r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && !el.closest('[aria-hidden="true"]'))
        out.push(n.textContent.trim());
    }
    return out.join(' ').replace(/\s+/g, ' ');
  });
}
