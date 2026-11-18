#!/usr/bin/env node
// Full-stack QA target: Worker + static assets via `wrangler dev --local` on port 8788.
// Writes .build-qa/wrangler.qa.jsonc (assets -> ./.build-qa) derived from the real wrangler.jsonc, minus
// the `ai` binding: Workers AI is remote-only and needs `wrangler login`, which the suite must never run.
// Without the binding env.AI is undefined, AI.run throws, and /api/ask answers in "retrieval" mode,
// which is exactly the degradation path under test. RATE_LIMITER and send_email are simulated locally.
// Usage: node tests/support/stack.mjs [--port 8788]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const BUILD = resolve(process.env.QA_BUILD_DIR || '.build-qa');
export const QA_CONFIG = resolve(BUILD, 'wrangler.qa.jsonc');

/** Strip // and /* *\/ comments and trailing commas from JSONC (string-aware). */
export function parseJsonc(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i];
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

export function writeQaConfig() {
  if (!existsSync(resolve(BUILD, 'index.html'))) throw new Error('.build-qa is missing. Run: npx astro build --outDir ./.build-qa');
  const base = parseJsonc(readFileSync('wrangler.jsonc', 'utf8'));
  const { ai: _ai, routes: _routes, observability: _obs, $schema: _schema, ...rest } = base;
  const cfg = {
    ...rest,
    name: `${base.name}-qa`,
    main: '../worker/src/index.ts',
    assets: { ...base.assets, directory: '.' },
  };
  writeFileSync(QA_CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  // Keep the QA config, the dry-run bundle and local state out of the served assets.
  writeFileSync(resolve(BUILD, '.assetsignore'), ['wrangler.qa.jsonc', '.assetsignore', 'dry', '.wrangler', ''].join('\n'));
  return cfg;
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) {
  const i = process.argv.indexOf('--port');
  const port = i > -1 ? process.argv[i + 1] : (process.env.QA_STACK_PORT ?? '8788');
  writeQaConfig();
  const child = spawn(
    'npx',
    ['wrangler', 'dev', '--local', '--config', QA_CONFIG, '--port', port, '--ip', '127.0.0.1', '--persist-to', resolve('.wrangler/qa-state'), '--show-interactive-dev-session=false'],
    { stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: process.env.CI ?? '1' } },
  );
  const stop = () => child.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code ?? 0));
}
