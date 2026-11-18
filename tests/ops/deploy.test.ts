// Ops perspective: the deploy bundle builds. `wrangler deploy --dry-run` compiles the Worker with the real
// wrangler.jsonc (bindings, assets config) without contacting Cloudflare. Output goes to <build>/dry.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILD, ROOT } from '../support/site';

describe('wrangler deploy --dry-run', () => {
  it.skipIf(!existsSync(join(ROOT, 'dist', 'index.html')))('bundles the Worker with every binding (needs ./dist from `npm run build`)', () => {
    const outdir = join(BUILD, 'dry');
    const r = spawnSync('timeout', ['120', 'npx', 'wrangler', 'deploy', '--dry-run', '--outdir', outdir], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
    });
    const log = `${r.stdout}\n${r.stderr}`;
    expect(r.status, log.slice(-2000)).toBe(0);
    expect(log).toMatch(/--dry-run: exiting now/);
    for (const b of ['env.ASSETS', 'env.AI', 'env.RATE_LIMITER', 'env.CONTACT_LIMITER', 'env.EMAIL']) expect(log, b).toContain(b);
    expect(readdirSync(outdir).some((f) => f.endsWith('.js'))).toBe(true);
  }, 130_000);
});
