// Ops perspective: optional full-stack checks against `wrangler dev --local` (Worker + the built assets),
// started through tests/support/stack.mjs (temp config at <build>/wrangler.qa.jsonc, no remote AI binding).
// Skips with a reason when wrangler dev cannot start. QA_OPS_STACK=0 disables it; QA_OPS_PORT picks the port.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD, ROOT } from '../support/site';

const enabled = process.env.QA_OPS_STACK !== '0';
let base = '';
let child: ChildProcess | null = null;
let reason = '';
let log = '';

const portFree = (port: number) =>
  new Promise<boolean>((res) => {
    const s = createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true)));
    s.listen(port, '127.0.0.1');
  });

beforeAll(async () => {
  if (!enabled) return void (reason = 'QA_OPS_STACK=0');
  const wanted = Number(process.env.QA_OPS_PORT ?? 8788);
  let port = wanted;
  // Another suite (QA-B Playwright, QA_TARGET=stack) may already hold 8788; never share its rate-limit state.
  while (!(await portFree(port)) && port < wanted + 20) port++;
  base = `http://127.0.0.1:${port}`;
  child = spawn('timeout', ['60', 'node', 'tests/support/stack.mjs', '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, QA_STACK_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return void console.log(`[stack] wrangler dev ready on ${base} after ${45_000 - (deadline - Date.now())} ms`);
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  reason = `wrangler dev did not become ready on ${base} within 45 s: ${log.slice(-600)}`;
}, 50_000);

afterAll(() => {
  child?.kill('SIGTERM');
});

const ip = () => `198.18.${200 + Math.floor(Math.random() * 50)}.${1 + Math.floor(Math.random() * 250)}`;
const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Origin: base, 'CF-Connecting-IP': ip(), ...headers } });

describe('full stack (wrangler dev --local)', () => {
  const gate = (ctx: { skip: (note?: string) => void }) => {
    if (reason) ctx.skip(reason);
  };

  it('/api/health is ok and serves the corpus of the build under test', async (ctx) => {
    gate(ctx);
    const r = await fetch(`${base}/api/health`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { status: string; corpusVersion: string | null };
    expect(body.status).toBe('ok');
    expect(body.corpusVersion).toBe(JSON.parse(readFileSync(join(BUILD, 'corpus.json'), 'utf8')).version);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('rate limit gives 429 + Retry-After once the bucket is spent', async (ctx) => {
    gate(ctx);
    const who = ip();
    const statuses: number[] = [];
    let last: Response | null = null;
    for (let i = 0; i < 14; i++) {
      last = await post('/api/ask', '{}', { 'CF-Connecting-IP': who });
      statuses.push(last.status);
      if (last.status === 429) break;
    }
    expect(statuses, statuses.join(',')).toContain(429);
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(last!.headers.get('cache-control')).toBe('no-store');
  });

  it('cross-origin POST is rejected with 403', async (ctx) => {
    gate(ctx);
    for (const path of ['/api/ask', '/api/contact']) {
      const r = await post(path, JSON.stringify({ question: 'What is TalentLens?' }), { Origin: 'https://evil.example' });
      expect(r.status, path).toBe(403);
    }
  });

  it('POST without an Origin header is rejected', async (ctx) => {
    gate(ctx);
    const r = await fetch(`${base}/api/ask`, { method: 'POST', body: '{"question":"What is TalentLens?"}', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip() } });
    expect(r.status).toBe(403);
  });

  it('non-JSON is rejected with 415', async (ctx) => {
    gate(ctx);
    const r = await post('/api/ask', 'question=What+is+TalentLens', { 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(r.status).toBe(415);
  });

  it('API responses are no-store JSON with security headers; /api/ask degrades to retrieval without AI', async (ctx) => {
    gate(ctx);
    const r = await post('/api/ask', JSON.stringify({ question: 'What is TalentLens?' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(((await r.json()) as { mode: string }).mode).toMatch(/^(retrieval|llm)$/);
    const nf = await fetch(`${base}/api/nope`);
    expect(nf.status).toBe(404);
    expect(nf.headers.get('cache-control')).toBe('no-store');
  });

  it('static pages carry the _headers security headers', async (ctx) => {
    gate(ctx);
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('strict-transport-security')).toMatch(/max-age=/);
  });
});
