#!/usr/bin/env node
// Renders diagrams/*.mmd → public/diagrams/<slug>.{dark,light}.svg with site-matched Mermaid themes.
// Usage: npm run diagrams [-- <slug> ...]
// Needs mermaid-cli (mmdc) + a Chrome. Set MMDC / CHROME_PATH to override discovery.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath (not URL.pathname) so checkouts under paths with spaces or non-ASCII characters work.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'diagrams');
const outDir = path.join(root, 'public', 'diagrams');
fs.mkdirSync(outDir, { recursive: true });

function findMmdc() {
  const candidates = [process.env.MMDC, path.join(root, 'node_modules/.bin/mmdc')].filter(Boolean);
  const hit = candidates.find((c) => fs.existsSync(c));
  if (!hit) {
    console.error('mmdc not found. Install with: PUPPETEER_SKIP_DOWNLOAD=1 npm i -D @mermaid-js/mermaid-cli@11 (or set MMDC).');
    process.exit(1);
  }
  return hit;
}
const chrome =
  process.env.CHROME_PATH ||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) =>
    fs.existsSync(p),
  );

// SVGs load as <img>, so the Geist webfont is unavailable; a system sans is the closest match.
const font = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const themes = {
  dark: {
    background: 'transparent',
    fontFamily: font,
    fontSize: '17px',
    primaryColor: '#1a2130',
    primaryBorderColor: '#3d4a60',
    primaryTextColor: '#e7ebf1',
    secondaryColor: '#14261c',
    secondaryBorderColor: '#2f7a4f',
    secondaryTextColor: '#e7ebf1',
    tertiaryColor: '#131925',
    tertiaryBorderColor: '#2b3445',
    tertiaryTextColor: '#c5ccd8',
    lineColor: '#8090a8',
    textColor: '#c5ccd8',
    nodeTextColor: '#e7ebf1',
    clusterBkg: '#111722',
    clusterBorder: '#2d3748',
    titleColor: '#c5ccd8',
    edgeLabelBackground: '#0f141c',
    actorBkg: '#1a2130',
    actorBorder: '#3d4a60',
    actorTextColor: '#e7ebf1',
    actorLineColor: '#3d4a60',
    signalColor: '#8090a8',
    signalTextColor: '#c5ccd8',
    labelBoxBkgColor: '#1a2130',
    labelBoxBorderColor: '#3d4a60',
    labelTextColor: '#e7ebf1',
    loopTextColor: '#c5ccd8',
    noteBkgColor: '#2a2516',
    noteBorderColor: '#7a6626',
    noteTextColor: '#f1e6c4',
    activationBkgColor: '#203048',
    activationBorderColor: '#4a6aa0',
    sequenceNumberColor: '#0f141c',
  },
  light: {
    background: 'transparent',
    fontFamily: font,
    fontSize: '17px',
    primaryColor: '#ffffff',
    primaryBorderColor: '#b9c0cc',
    primaryTextColor: '#1b2230',
    secondaryColor: '#eaf6ee',
    secondaryBorderColor: '#3d8a5a',
    secondaryTextColor: '#1b2230',
    tertiaryColor: '#f3f2ee',
    tertiaryBorderColor: '#d6d3ca',
    tertiaryTextColor: '#3a4352',
    lineColor: '#6b7689',
    textColor: '#3a4352',
    nodeTextColor: '#1b2230',
    clusterBkg: '#f5f4f0',
    clusterBorder: '#d6d3ca',
    titleColor: '#3a4352',
    edgeLabelBackground: '#fbfaf7',
    actorBkg: '#ffffff',
    actorBorder: '#b9c0cc',
    actorTextColor: '#1b2230',
    actorLineColor: '#b9c0cc',
    signalColor: '#6b7689',
    signalTextColor: '#3a4352',
    labelBoxBkgColor: '#ffffff',
    labelBoxBorderColor: '#b9c0cc',
    labelTextColor: '#1b2230',
    loopTextColor: '#3a4352',
    noteBkgColor: '#fdf6e3',
    noteBorderColor: '#d9c27a',
    noteTextColor: '#4a3f1c',
    activationBkgColor: '#e6eefb',
    activationBorderColor: '#7d9bd1',
    sequenceNumberColor: '#ffffff',
  },
};

const mmdc = findMmdc();
// Scratch configs live inside the project (git-ignored node_modules cache), never in the OS temp dir.
const cacheDir = path.join(root, 'node_modules', '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(cacheDir, 'diagrams-'));
const pptr = path.join(tmp, 'puppeteer.json');
fs.writeFileSync(pptr, JSON.stringify({ ...(chrome && { executablePath: chrome }), args: ['--no-sandbox'] }));
for (const [name, vars] of Object.entries(themes)) {
  fs.writeFileSync(
    path.join(tmp, `${name}.json`),
    JSON.stringify({
      theme: 'base',
      themeVariables: vars,
      flowchart: { curve: 'basis', padding: 14, nodeSpacing: 42, rankSpacing: 50, htmlLabels: true },
      sequence: { mirrorActors: false, actorMargin: 60 },
    }),
  );
}

const only = process.argv.slice(2);
const files = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith('.mmd'))
  .filter((f) => !only.length || only.includes(f.replace(/\.mmd$/, '')));

let failed = 0;
for (const f of files) {
  const slug = f.replace(/\.mmd$/, '');
  let ok = true;
  for (const name of Object.keys(themes)) {
    const out = path.join(outDir, `${slug}.${name}.svg`);
    try {
      execFileSync(mmdc, ['-p', pptr, '-c', path.join(tmp, `${name}.json`), '-b', 'transparent', '-i', path.join(srcDir, f), '-o', out, '-q'], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      // Make the root SVG responsive: drop the fixed max-width style.
      const svg = fs.readFileSync(out, 'utf8').replace(/(<svg[^>]*?)\sstyle="max-width:[^"]*"/, '$1');
      fs.writeFileSync(out, svg);
    } catch (e) {
      ok = false;
      console.error(`✗ ${slug} (${name}): ${String(e.stderr || e.message).split('\n')[0]}`);
    }
  }
  if (ok) console.log(`✓ ${slug}`);
  else failed++;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${files.length - failed}/${files.length} diagrams rendered → public/diagrams`);
process.exit(failed ? 1 : 0);
