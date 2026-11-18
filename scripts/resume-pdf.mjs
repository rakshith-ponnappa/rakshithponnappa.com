#!/usr/bin/env node
// Prints /resume/ from a built site to an A4 PDF with headless Chrome (the page carries its own print stylesheet).
// Usage: npm run pdf [-- <built dir, default ./dist>]   Writes <dir>/Rakshith_SP_Resume.pdf and public/Rakshith_SP_Resume.pdf.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(root, process.argv[2] ?? 'dist');
const NAME = 'Rakshith_SP_Resume.pdf';
const chrome =
  process.env.CHROME_PATH ||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!chrome) throw new Error('Chrome not found; set CHROME_PATH');
if (!fs.existsSync(path.join(dir, 'resume', 'index.html'))) throw new Error(`${dir} has no /resume/; build first`);

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dir, path.normalize(p));
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const out = path.join(dir, NAME);
try {
  // Async on purpose: a sync spawn would block this process's event loop and the static server with it.
  await promisify(execFile)(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000', `--print-to-pdf=${out}`, `http://127.0.0.1:${port}/resume/`],
    { timeout: 60_000 },
  );
} finally {
  server.close();
}
fs.copyFileSync(out, path.join(root, 'public', NAME));
console.log(`résumé → ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB) and public/${NAME}`);
