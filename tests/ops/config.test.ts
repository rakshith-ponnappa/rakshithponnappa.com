// Ops perspective: static deployment checks. wrangler.jsonc must declare every binding the Worker reads
// (worker/src/env.ts), and public/_headers must give static pages the same security headers the Worker sets
// on /api/* (worker/src/http.ts SECURITY_HEADERS), plus long-lived caching for hashed /_astro/* assets.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS } from '../../worker/src/http';
import { ROOT } from '../support/site';
// @ts-expect-error untyped .mjs helper
import { parseJsonc } from '../support/stack.mjs';

type Wrangler = {
  name: string;
  main: string;
  compatibility_date: string;
  assets: { directory: string; binding: string; run_worker_first?: string[] | boolean; not_found_handling?: string };
  ai?: { binding: string };
  ratelimits?: { name: string; namespace_id: string; simple: { limit: number; period: number } }[];
  send_email?: { name: string; destination_address?: string }[];
  vars?: Record<string, string>;
};

const cfg = parseJsonc(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')) as Wrangler;
const headersFile = readFileSync(join(ROOT, 'public/_headers'), 'utf8');

/** Parse the Cloudflare _headers format into { pattern: { header: value } }. */
function parseHeaders(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let cur: Record<string, string> | null = null;
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      cur = out[raw.trim()] = {};
      continue;
    }
    const i = raw.indexOf(':');
    if (cur && i > 0) cur[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
  }
  return out;
}
const rules = parseHeaders(headersFile);

describe('wrangler.jsonc', () => {
  it('parses and points at the Worker entry and the Astro build', () => {
    expect(cfg.main).toBe('worker/src/index.ts');
    expect(cfg.assets.directory).toBe('./dist');
    expect(cfg.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('declares every binding the Worker uses: ASSETS, AI, RATE_LIMITER, CONTACT_LIMITER, EMAIL', () => {
    const names = [
      cfg.assets?.binding,
      cfg.ai?.binding,
      ...(cfg.ratelimits ?? []).map((r) => r.name),
      ...(cfg.send_email ?? []).map((e) => e.name),
    ];
    for (const b of ['ASSETS', 'AI', 'RATE_LIMITER', 'CONTACT_LIMITER', 'EMAIL']) expect(names, b).toContain(b);
  });

  it('rate limiters are sane (contact stricter than ask) with distinct namespaces', () => {
    const rl = Object.fromEntries((cfg.ratelimits ?? []).map((r) => [r.name, r]));
    expect(rl.RATE_LIMITER.simple.period).toBe(60);
    expect(rl.CONTACT_LIMITER.simple.limit).toBeLessThan(rl.RATE_LIMITER.simple.limit);
    expect(rl.RATE_LIMITER.namespace_id).not.toBe(rl.CONTACT_LIMITER.namespace_id);
  });

  it('only /api/* runs the Worker first; static 404s use the 404 page', () => {
    expect(cfg.assets.run_worker_first).toEqual(['/api/*']);
    expect(cfg.assets.not_found_handling).toBe('404-page');
  });

  it('sets the vars the Worker reads, and keeps secrets out of vars', () => {
    expect(Object.keys(cfg.vars ?? {}).sort()).toEqual(['AI_MODEL', 'CONTACT_FROM']);
    expect(JSON.stringify(cfg.vars)).not.toMatch(/secret|token|key/i);
    // The private inbox is the CONTACT_TO secret, so no personal address is committed.
    expect(cfg.send_email?.[0].destination_address).toBeUndefined();
    expect(JSON.stringify(cfg)).not.toMatch(/@gmail\.com/i);
  });
});

describe('public/_headers', () => {
  it('covers /* and /_astro/*', () => {
    expect(Object.keys(rules)).toEqual(expect.arrayContaining(['/*', '/_astro/*']));
  });

  it.each(Object.entries(SECURITY_HEADERS))('/* sets %s exactly like the Worker', (name, value) => {
    expect(rules['/*'][name]).toBe(value);
  });

  it('/* forbids framing via CSP frame-ancestors', () => {
    expect(rules['/*']['Content-Security-Policy']).toMatch(/frame-ancestors 'none'/);
  });

  it('HSTS is at least one year and includes subdomains', () => {
    const m = rules['/*']['Strict-Transport-Security'].match(/max-age=(\d+)/);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(31_536_000);
    expect(rules['/*']['Strict-Transport-Security']).toMatch(/includeSubDomains/);
  });

  it('/_astro/* is immutable for a year', () => {
    expect(rules['/_astro/*']['Cache-Control']).toMatch(/max-age=31536000/);
    expect(rules['/_astro/*']['Cache-Control']).toMatch(/immutable/);
  });
});
