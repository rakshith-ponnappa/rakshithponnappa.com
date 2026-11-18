// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_SCRIPT, SPECULATION_RULES, sha256 } from './src/lib/inline-scripts.mjs';

/** Moves Astro's CSP <meta> directly after <meta charset> so it governs every later head element. */
const cspMetaFirst = {
  name: 'csp-meta-first',
  hooks: {
    /** @param {{ dir: URL }} opts */
    'astro:build:done': async ({ dir }) => {
      const root = fileURLToPath(dir);
      for (const f of await readdir(root, { recursive: true })) {
        if (!f.endsWith('.html')) continue;
        const p = path.join(root, f);
        const html = await readFile(p, 'utf8');
        const m = html.match(/<meta http-equiv="content-security-policy"[^>]*>/i);
        if (!m) continue;
        await writeFile(p, html.replace(m[0], '').replace(/<meta charset="utf-8">/i, (c) => c + m[0]));
      }
    },
  },
};

/** @param {string} pkg @param {string} file */
const fs = (pkg, file) => `./node_modules/${pkg}/files/${file}`;

export default defineConfig({
  site: 'https://rakshithponnappa.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [
    mdx(),
    sitemap({ filter: (page) => !/\/(404|og)\b/.test(page) }),
    cspMetaFirst,
  ],
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Geist',
      cssVariable: '--font-geist',
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      options: {
        variants: [
          { src: [fs('@fontsource-variable/geist', 'geist-latin-wght-normal.woff2')], weight: '100 900', style: 'normal' },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Geist Mono',
      cssVariable: '--font-geist-mono',
      fallbacks: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      options: {
        variants: [
          { src: [fs('@fontsource-variable/geist-mono', 'geist-mono-latin-wght-normal.woff2')], weight: '100 900', style: 'normal' },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Instrument Serif',
      cssVariable: '--font-instrument',
      fallbacks: ['ui-serif', 'Georgia', 'serif'],
      options: {
        variants: [
          { src: [fs('@fontsource/instrument-serif', 'instrument-serif-latin-400-normal.woff2')], weight: '400', style: 'normal' },
          { src: [fs('@fontsource/instrument-serif', 'instrument-serif-latin-400-italic.woff2')], weight: '400', style: 'italic' },
        ],
      },
    },
  ],
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        // Cloudflare Web Analytics (cookieless) is injected at the edge and beacons to cloudflareinsights.com.
        "connect-src 'self' https://cloudflareinsights.com",
        "frame-src https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'upgrade-insecure-requests',
      ],
      scriptDirective: {
        resources: ["'self'", 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com'],
        hashes: [sha256(THEME_SCRIPT), sha256(SPECULATION_RULES)],
      },
    },
  },
  // Prism emits classes (not inline styles), so code blocks stay compatible with the strict CSP.
  markdown: { syntaxHighlight: 'prism' },
  vite: {
    plugins: [tailwindcss()],
  },
});
