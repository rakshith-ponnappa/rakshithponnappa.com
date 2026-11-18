#!/usr/bin/env node
// Tiny static server that mimics Cloudflare Workers Static Assets for the QA suite:
//   - html_handling "auto-trailing-slash": /work -> 307 /work/, /work/index.html -> 307 /work/
//   - not_found_handling "404-page": unknown paths get /404.html with status 404
//   - public/_headers rules are applied (so header checks also work against the static build)
//   - /api/* always returns 404 JSON, so the browser fallbacks (in-browser BM25, mailto) are exercised.
// Usage: node tests/support/serve.mjs [--root ./.build-qa] [--port 4400] [--https]
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
};

/** Parse a Cloudflare `_headers` file into [{ pattern, headers }]. */
export function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      cur = { pattern: raw.trim(), headers: {} };
      rules.push(cur);
    } else if (cur) {
      const i = raw.indexOf(':');
      if (i > 0) cur.headers[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
    }
  }
  return rules;
}

export function matchesPattern(pattern, path) {
  const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(path);
}

/**
 * Self-signed cert for --https (generated once with openssl into test-results/qa-tls). WebKit applies the
 * CSP `upgrade-insecure-requests` even to 127.0.0.1/localhost, so over plain HTTP every subresource is
 * rewritten to https:// and fails. Serving TLS reproduces production (HTTPS) faithfully.
 */
function selfSignedCert() {
  const dir = resolve('test-results/qa-tls');
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  if (!existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '7', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' });
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

export function startServer({ root = process.env.QA_BUILD_DIR || './.build-qa', port = 4400, host = '127.0.0.1', https = false } = {}) {
  const dir = resolve(root);
  const headersFile = join(dir, '_headers');
  const rules = existsSync(headersFile) ? parseHeaders(readFileSync(headersFile, 'utf8')) : [];
  const isFile = (p) => existsSync(p) && statSync(p).isFile();

  const handler = (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      path = url.pathname;
    }
    const extra = {};
    for (const r of rules) if (matchesPattern(r.pattern, url.pathname)) Object.assign(extra, r.headers);

    const send = (status, file) => {
      res.writeHead(status, { ...extra, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
    };
    const redirect = (to) => {
      res.writeHead(307, { ...extra, Location: to + url.search });
      res.end();
    };

    if (path === '/api' || path.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ error: 'not found (static server: no Worker)' }));
    }

    const abs = join(dir, normalize(path));
    if (!abs.startsWith(dir)) {
      res.writeHead(400);
      return res.end();
    }
    if (path.endsWith('/index.html')) return redirect(path.slice(0, -'index.html'.length));
    if (path.endsWith('.html') && path !== '/404.html' && isFile(abs)) return redirect(path.slice(0, -'.html'.length) + '/');
    if (path.endsWith('/') && isFile(join(abs, 'index.html'))) return send(200, join(abs, 'index.html'));
    if (!path.endsWith('/') && isFile(abs)) return send(200, abs);
    if (!path.endsWith('/') && isFile(join(abs, 'index.html'))) return redirect(path + '/');
    const notFound = join(dir, '404.html');
    if (isFile(notFound)) return send(404, notFound);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  };
  const server = https ? createTlsServer(selfSignedCert(), handler) : createServer(handler);

  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, def) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : def;
  };
  const root = arg('root', process.env.QA_BUILD_DIR || './.build-qa');
  const port = Number(arg('port', process.env.QA_STATIC_PORT ?? 4400));
  if (!existsSync(join(resolve(root), 'index.html'))) {
    console.error(`serve.mjs: ${root}/index.html not found. Run: npx astro build --outDir ${root}`);
    process.exit(1);
  }
  const https = process.argv.includes('--https');
  startServer({ root, port, https }).then(() => console.log(`static QA server: ${https ? 'https' : 'http'}://127.0.0.1:${port} (root ${root})`));
}
