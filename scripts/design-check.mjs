#!/usr/bin/env node
// Design-quality scan of rendered pages: serves a built site locally and runs Impeccable's URL scan, which
// lays the pages out in a real browser so rules that need layout (line length, kicker above heading,
// contrast on the painted background) run too. The file scan (`npm run test:design`) covers every page.
//
//   node scripts/design-check.mjs [build dir, default ./dist] [extra impeccable flags, e.g. --github]
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const [root = 'dist', ...flags] = process.argv.slice(2);
const port = 4471;
const base = `http://127.0.0.1:${port}`;
// /resume/ is excluded: its print stylesheet is evaluated against the screen theme (see .impeccable/config.json).
const pages = ['/', '/work/', '/work/state-street-azure-landing-zone-dr/', '/projects/', '/projects/talentlens/', '/experience/', '/credentials/', '/ask/', '/evals/', '/status/', '/contact/'];

const server = spawn(process.execPath, ['tests/support/serve.mjs', '--root', root, '--port', String(port)], { stdio: 'ignore' });
let up = false;
for (let i = 0; i < 50 && !up; i++) {
  await sleep(200);
  up = await fetch(base + '/').then((r) => r.ok, () => false);
}
if (!up) {
  server.kill();
  console.error(`design-check: no server on ${base}`);
  process.exit(1);
}

const r = spawnSync('npx', ['-y', 'impeccable@4.9.2', 'detect', ...pages.map((p) => base + p), '--no-advisory', ...flags], {
  stdio: 'inherit',
  env: { ...process.env, DO_NOT_TRACK: '1' },
});
server.kill();
process.exit(r.status ?? 1);
