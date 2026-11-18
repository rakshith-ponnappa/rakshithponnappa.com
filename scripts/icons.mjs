#!/usr/bin/env node
// Generates raster icons from the brand mark: favicon.ico (PNG-in-ICO), apple-touch-icon, PWA icons (incl. maskable).
// Usage: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const BG = '#0d1117';

// Same geometry as public/favicon.svg, drawn for a dark tile. `pad` shrinks the mark into a safe zone (maskable).
const mark = (size, pad = 0.14, rounded = true) => {
  const s = 32;
  const inner = s * (1 - 2 * pad);
  const k = inner / 24;
  const o = s * pad - 4 * k;
  const t = (x, y) => `${(o + x * k).toFixed(2)} ${(o + y * k).toFixed(2)}`;
  const r = (v) => (v * k).toFixed(2);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rounded ? 7 : 0}" fill="${BG}"/>
  <radialGradient id="g" cx="50%" cy="30%" r="60%"><stop offset="0" stop-color="#2bd46f" stop-opacity=".22"/><stop offset="1" stop-color="#2bd46f" stop-opacity="0"/></radialGradient>
  <rect width="32" height="32" rx="${rounded ? 7 : 0}" fill="url(#g)"/>
  <path d="M${t(8, 23)} L${t(16, 9)} L${t(24, 23)} M${t(8, 23)} L${t(24, 23)}" fill="none" stroke="#9aa4b2" stroke-width="${r(1.8)}" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
  <circle cx="${(o + 16 * k).toFixed(2)}" cy="${(o + 9 * k).toFixed(2)}" r="${r(4.2)}" fill="#2bd46f"/>
  <circle cx="${(o + 8 * k).toFixed(2)}" cy="${(o + 23 * k).toFixed(2)}" r="${r(3.2)}" fill="#cbd5e1"/>
  <circle cx="${(o + 24 * k).toFixed(2)}" cy="${(o + 23 * k).toFixed(2)}" r="${r(3.2)}" fill="#cbd5e1"/>
</svg>`);
};

const png = (size, pad, rounded) => sharp(mark(size, pad, rounded), { density: 72 * (size / 32) }).resize(size, size).png().toBuffer();

const out = {
  'apple-touch-icon.png': await png(180, 0.16, false),
  'icon-192.png': await png(192, 0.14, true),
  'icon-512.png': await png(512, 0.14, true),
  'icon-mask.png': await png(512, 0.24, false),
};
for (const [f, buf] of Object.entries(out)) fs.writeFileSync(path.join(pub, f), buf);

// ICO container with embedded PNGs (supported by every current browser).
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map((s) => png(s, 0.06, true)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(imgs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += imgs[i].length;
});
fs.writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([header, ...imgs]));
console.log('icons →', [...Object.keys(out), 'favicon.ico'].join(', '));
