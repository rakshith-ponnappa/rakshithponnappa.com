// Round-B helpers (personas 5-8). Builds on _lib.mjs (owned by round A) without editing it.
// Differences: 15 s default timeouts and 'load'/'domcontentloaded' navigation (never networkidle0).
import fs from 'node:fs';
import path from 'node:path';
import { startSession as startA, BASE } from './_lib.mjs';

export * from './_lib.mjs';

export const OUT_B =
  process.env.PERSONA_OUT_B || path.resolve('test-results/persona-runs/b');

export const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// Same session object as _lib.startSession, but screenshots/results go to persona-runs/b/<persona>.
export async function startSession(persona, opts = {}) {
  const prev = process.env.PERSONA_OUT;
  process.env.PERSONA_OUT = OUT_B;
  const s = await startA(persona, opts);
  if (prev === undefined) delete process.env.PERSONA_OUT;
  else process.env.PERSONA_OUT = prev;
  // _lib computes OUT_ROOT at import time, so re-point the output folder explicitly.
  s.out = path.join(OUT_B, persona);
  fs.mkdirSync(s.out, { recursive: true });
  s.page.setDefaultTimeout(15000);
  s.page.setDefaultNavigationTimeout(30000);
  return s;
}

export async function go(s, url, waitUntil = 'load') {
  return s.page.goto(url.startsWith('http') ? url : BASE + url, { waitUntil, timeout: 45000 });
}

export async function fetchText(url) {
  const r = await fetch(url.startsWith('http') ? url : BASE + url);
  return { status: r.status, type: r.headers.get('content-type'), text: await r.text() };
}

export function writeJson(s, name, data) {
  fs.writeFileSync(path.join(s.out, name), JSON.stringify(data, null, 2));
}
