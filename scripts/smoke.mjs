#!/usr/bin/env node
// Post-deploy smoke test against a live origin. Read-only apart from two Ask questions and one contact request
// that Turnstile rejects before any email is sent. Exits 1 if any check fails.
//
//   node scripts/smoke.mjs                                   https://rakshithponnappa.dev
//   node scripts/smoke.mjs https://example.com --sha abc1234 also wait until the footer shows this commit
//
// Used by the deploy job (failure → automatic rollback) and the scheduled monitor (failure → incident issue).
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE = (args[0] && !args[0].startsWith('--') ? args[0] : 'https://rakshithponnappa.dev').replace(/\/$/, '');
const SHA = opt('--sha')?.slice(0, 7);
const PROD = BASE === 'https://rakshithponnappa.dev';
const UA = 'rakshithponnappa-smoke/1.0 (+https://rakshithponnappa.dev/status/)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bust = (url) => `${url}${url.includes('?') ? '&' : '?'}smoke=${Date.now()}`;

async function get(path, init = {}) {
  const url = path.startsWith('http') ? path : BASE + path;
  return fetch(bust(url), { redirect: 'manual', ...init, headers: { 'User-Agent': UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
}
// For hosts that may still be provisioning (a newly attached domain's certificate takes a minute or two):
// retry network errors, but return HTTP responses as-is so real failures still fail.
async function getWithRetry(url, attempts = 12, delayMs = 10_000) {
  for (let i = 1; ; i++) {
    try {
      return await get(url);
    } catch (err) {
      if (i >= attempts) throw err;
      await sleep(delayMs);
    }
  }
}
const post = (path, body, origin = BASE) =>
  get(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: origin } });

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
async function check(name, fn) {
  const t = Date.now();
  try {
    const detail = (await fn()) ?? '';
    results.push({ name, ok: true, ms: Date.now() - t, detail: String(detail) });
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - t, detail: err instanceof Error ? err.message : String(err) });
  }
}

if (SHA) {
  await check(`commit ${SHA} is live`, async () => {
    // Edge propagation of new assets can lag the deploy by a few seconds.
    for (let i = 0; i < 18; i++) {
      const html = await (await get('/')).text();
      if (html.includes(`/commit/${SHA}`)) return `after ${i * 10}s`;
      await sleep(10_000);
    }
    throw new Error(`home page still not built from ${SHA} after 3 minutes`);
  });
}

await check('every sitemap page returns 200 HTML', async () => {
  const xml = await (await get('/sitemap-0.xml')).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://rakshithponnappa.dev', BASE));
  expect(urls.length >= 20, `sitemap lists only ${urls.length} URLs`);
  const bad = [];
  for (let i = 0; i < urls.length; i += 6) {
    await Promise.all(
      urls.slice(i, i + 6).map(async (u) => {
        const r = await get(u);
        if (r.status !== 200 || !(r.headers.get('content-type') ?? '').includes('text/html')) bad.push(`${r.status} ${u}`);
      }),
    );
  }
  expect(bad.length === 0, bad.join(', '));
  return `${urls.length} pages`;
});

await check('key files are served with the right type', async () => {
  const files = [
    ['/robots.txt', 'text/plain'],
    ['/llms.txt', 'text/plain'],
    ['/resume.json', 'application/json'],
    ['/status-history.json', 'application/json'],
    ['/Rakshith_SP_Resume.pdf', 'application/pdf'],
    ['/site.webmanifest', 'application/manifest+json'],
    ['/favicon.svg', 'image/svg+xml'],
  ];
  for (const [path, type] of files) {
    const r = await get(path);
    expect(r.status === 200, `${path} → ${r.status}`);
    expect((r.headers.get('content-type') ?? '').startsWith(type), `${path} is ${r.headers.get('content-type')}`);
    if (path.endsWith('.pdf')) expect((await r.arrayBuffer()).byteLength > 50_000, 'résumé PDF is suspiciously small');
  }
  return `${files.length} files`;
});

await check('security headers and CSP', async () => {
  const r = await get('/');
  const h = (k) => r.headers.get(k) ?? '';
  expect(h('strict-transport-security').includes('max-age='), 'no HSTS');
  expect(h('x-content-type-options') === 'nosniff', 'no nosniff');
  expect(h('referrer-policy') !== '', 'no Referrer-Policy');
  expect(h('permissions-policy') !== '', 'no Permissions-Policy');
  expect(/http-equiv="content-security-policy"/i.test(await r.text()), 'no CSP meta tag');
});

await check('unknown paths return the 404 page', async () => {
  const r = await get('/__smoke-not-found__/');
  expect(r.status === 404, `got ${r.status}`);
});

await check('no private email address is published', async () => {
  for (const path of ['/', '/contact/', '/resume/', '/llms.txt']) {
    const body = await (await get(path)).text();
    expect(!/@gmail\.com/i.test(body), `${path} contains a gmail address`);
  }
});

if (PROD) {
  await check('alias domains redirect to the canonical site', async () => {
    const aliases = ['www.rakshithponnappa.dev', 'rakshithponnappa.com', 'www.rakshithponnappa.com'];
    for (const host of aliases) {
      const r = await getWithRetry(`https://${host}/work/?from=smoke`);
      expect(r.status === 301, `${host} → ${r.status}`);
      expect((r.headers.get('location') ?? '').startsWith('https://rakshithponnappa.dev/work/?from=smoke'), `${host} → ${r.headers.get('location')}`);
    }
    return `${aliases.length} aliases`;
  });
}

await check('API health', async () => {
  const r = await get('/api/health');
  expect(r.status === 200, `got ${r.status}`);
  const j = await r.json();
  expect(j.status === 'ok', `status ${j.status}`);
  return `corpus ${j.corpusVersion}`;
});

await check('Ask answers an on-topic question with citations', async () => {
  const r = await post('/api/ask', { question: 'What did he build for State Street?' });
  expect(r.status === 200, `got ${r.status}`);
  const j = await r.json();
  expect(typeof j.answer === 'string' && j.answer.length > 40, 'empty answer');
  expect(j.mode !== 'refused', 'refused an on-topic question');
  expect((j.citations ?? []).some((c) => String(c.url).startsWith('/work/state-street')), 'no State Street citation');
  return `mode ${j.mode}, ${j.latencyMs} ms`;
});

await check('Ask refuses an off-topic question', async () => {
  const j = await (await post('/api/ask', { question: 'Recipe for chocolate cake' })).json();
  expect(j.mode === 'refused', `mode ${j.mode}`);
});

await check('API rejects other origins', async () => {
  const r = await post('/api/ask', { question: 'What did he build for State Street?' }, 'https://evil.example');
  expect(r.status === 403, `got ${r.status}`);
});

await check('contact form requires Turnstile (no email sent)', async () => {
  const r = await post('/api/contact', { name: 'Smoke test', email: 'smoke@example.com', topic: 'Other', message: 'Automated smoke test; must be rejected.' });
  const j = await r.json().catch(() => ({}));
  expect(r.status === 403 && j.error === 'verification required', `got ${r.status} ${JSON.stringify(j)}`);
});

const failed = results.filter((r) => !r.ok);
const lines = results.map((r) => `${r.ok ? '✓' : '✗'} ${r.name} (${r.ms} ms)${r.detail ? ` — ${r.detail}` : ''}`);
console.log(`Smoke test ${BASE}${SHA ? ` @ ${SHA}` : ''}\n${lines.join('\n')}\n${results.length - failed.length}/${results.length} passed`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.ms} ms | ${r.detail.replace(/\|/g, '\\|')} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Smoke test: ${BASE}\n\n| | Check | Time | Detail |\n|---|---|---|---|\n${rows.join('\n')}\n\n`);
}
process.exit(failed.length ? 1 : 0);
