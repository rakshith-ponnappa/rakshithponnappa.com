// Build-time Open Graph renderer: satori lays out a small element tree, resvg rasterises it to PNG.
// Fonts are read from @fontsource static .woff files (satori cannot read woff2).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { profile, uptime } from '../data/profile';

export const OG_W = 1200;
export const OG_H = 630;

// OKLCH design tokens from global.css, converted to sRGB hex (satori/resvg have no oklch).
export const c = {
  bg: '#0a0e12',
  raised: '#11151a',
  sunken: '#06080c',
  line: '#2c3137',
  lineSoft: '#1d2126',
  fg: '#eff2f5',
  muted: '#abb2bb',
  faint: '#868d96',
  signal: '#59ec85',
  azure: '#52b5f4',
  amber: '#fab72a',
};

const root = process.cwd();
const font = (pkg: string, file: string) => readFileSync(resolve(root, 'node_modules', pkg, 'files', file));

let fontCache: Parameters<typeof satori>[1]['fonts'] | undefined;
function fonts() {
  fontCache ??= [
    {
      name: 'Geist',
      data: font('@fontsource/geist', 'geist-latin-400-normal.woff'),
      weight: 400,
      style: 'normal',
    },
    {
      name: 'Geist',
      data: font('@fontsource/geist', 'geist-latin-500-normal.woff'),
      weight: 500,
      style: 'normal',
    },
    {
      name: 'Geist',
      data: font('@fontsource/geist', 'geist-latin-600-normal.woff'),
      weight: 600,
      style: 'normal',
    },
    {
      name: 'Geist Mono',
      data: font('@fontsource/geist-mono', 'geist-mono-latin-400-normal.woff'),
      weight: 400,
      style: 'normal',
    },
    {
      name: 'Geist Mono',
      data: font('@fontsource/geist-mono', 'geist-mono-latin-500-normal.woff'),
      weight: 500,
      style: 'normal',
    },
  ];
  return fontCache;
}

type Child = El | string | null | undefined | false;
type El = { type: string; props: Record<string, unknown> };
type Style = Record<string, string | number>;

// The static Geist subsets have no arrow glyphs; swap them for ones they do have.
const glyphSafe = (t: string) => t.replace(/\s*[→⇒]\s*/g, ' – ').replace(/\s*[←⇐]\s*/g, ' – ').replace(/↔/g, '–');

export function h(type: string, style: Style, children?: Child | Child[], extra: Record<string, unknown> = {}): El {
  const kids = (Array.isArray(children) ? children : [children])
    .filter((k) => k !== null && k !== undefined && k !== false)
    .map((k) => (typeof k === 'string' ? glyphSafe(k) : k));
  if (type === 'div' && !style.display) style = { display: 'flex', ...style };
  return {
    type,
    props: { ...extra, style, children: kids.length === 1 ? kids[0] : kids },
  };
}

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// Brand mark from Header.astro: two base nodes, glowing signal apex.
export function markSvg(size: number, base = c.muted) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28">
  <defs><filter id="g" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
  <path d="M7 20 14 8l7 12" fill="none" stroke="${base}" stroke-width="1.4" opacity=".55"/>
  <path d="M7 20h14" fill="none" stroke="${base}" stroke-width="1.4" opacity=".3"/>
  <circle cx="14" cy="8" r="3.6" fill="${c.signal}" opacity=".7" filter="url(#g)"/>
  <circle cx="14" cy="8" r="3" fill="${c.signal}"/>
  <circle cx="7" cy="20" r="2.4" fill="${base}"/>
  <circle cx="21" cy="20" r="2.4" fill="${base}"/>
</svg>`;
}

// Background: NOC grid on 56px pitch, faded with a radial mask, plus two soft glows.
function backdrop(glow: string = c.signal, glow2: string = c.azure) {
  const lines: string[] = [];
  for (let x = 56; x < OG_W; x += 56) lines.push(`<path d="M${x} 0V${OG_H}"/>`);
  for (let y = 42; y < OG_H; y += 56) lines.push(`<path d="M0 ${y}H${OG_W}"/>`);
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
  <defs>
    <radialGradient id="fade" cx="38%" cy="45%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0.15"/></radialGradient>
    <mask id="m"><rect width="100%" height="100%" fill="url(#fade)"/></mask>
    <radialGradient id="g1" cx="12%" cy="0%" r="60%"><stop offset="0" stop-color="${glow}" stop-opacity=".16"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="92%" cy="100%" r="60%"><stop offset="0" stop-color="${glow2}" stop-opacity=".13"/><stop offset="1" stop-color="${glow2}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${c.bg}"/>
  <g stroke="#eff2f5" stroke-opacity=".055" stroke-width="1" mask="url(#m)">${lines.join('')}</g>
  <rect width="100%" height="100%" fill="url(#g1)"/>
  <rect width="100%" height="100%" fill="url(#g2)"/>
  <rect x=".5" y=".5" width="${OG_W - 1}" height="${OG_H - 1}" fill="none" stroke="#eff2f5" stroke-opacity=".08"/>
</svg>`);
}

const mono = (size: number, color: string = c.faint, extra: Style = {}): Style => ({
  fontFamily: 'Geist Mono',
  fontSize: size,
  color,
  letterSpacing: '0.02em',
  ...extra,
});

function statusPill(label = 'Open to new roles') {
  return h(
    'div',
    {
      alignItems: 'center',
      gap: 12,
      padding: '10px 18px 10px 16px',
      borderRadius: 999,
      border: `1px solid ${c.line}`,
      backgroundColor: 'rgba(17,21,26,0.85)',
      ...mono(19, c.muted),
    },
    [
      h('div', {
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: c.signal,
        boxShadow: `0 0 12px ${c.signal}`,
      }),
      label,
    ],
  );
}

function topBar(path: string) {
  return h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%' }, [
    h('div', { alignItems: 'center', gap: 14 }, [
      h('img', { width: 40, height: 40 }, null, {
        src: svgUri(markSvg(40)),
        width: 40,
        height: 40,
      }),
      h('div', { ...mono(21, c.fg, { fontWeight: 500 }) }, 'rakshithponnappa.com'),
      path ? h('div', mono(21, c.faint), path) : null,
    ]),
    statusPill(),
  ]);
}

function footerBar(left: string, right: string) {
  return h(
    'div',
    {
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      paddingTop: 22,
      borderTop: `1px solid ${c.lineSoft}`,
      ...mono(18, c.faint),
    },
    [h('div', {}, left), h('div', {}, right)],
  );
}

const frame = (children: Child[], glow?: string, glow2?: string) =>
  h(
    'div',
    {
      // satori sizes boxes content-box, so subtract the padding.
      width: OG_W - 128,
      height: OG_H - 92,
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '48px 64px 44px',
      fontFamily: 'Geist',
      color: c.fg,
      backgroundColor: c.bg,
      backgroundImage: `url(${backdrop(glow, glow2)})`,
      backgroundSize: `${OG_W}px ${OG_H}px`,
    },
    children,
  );

export const renderSvg = (tree: El) => satori(tree as never, { width: OG_W, height: OG_H, fonts: fonts() });

export async function renderPng(tree: El) {
  const svg = await renderSvg(tree);
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_W },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  return png;
}

export function pngResponse(body: Uint8Array | Buffer, type = 'image/png') {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max).replace(/[\s,;:.(–-]+\S*$/, '');
  return `${cut}…`;
}

const PORTRAIT = resolve(root, 'src/assets/rakshith-portrait.png');

async function portraitCard(w: number, hgt: number) {
  // Pre-crop at 2x so the card stays sharp; bias the crop towards the face.
  const buf = await sharp(PORTRAIT)
    .resize(w * 2, hgt * 2, { fit: 'cover', position: 'north' })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export async function portraitJpeg(size = 800) {
  const meta = await sharp(PORTRAIT).metadata();
  const side = Math.min(meta.width!, meta.height!);
  // Square crop from the top (head and shoulders), keeping the full width.
  return sharp(PORTRAIT)
    .extract({
      left: Math.round((meta.width! - side) / 2),
      top: 0,
      width: side,
      height: side,
    })
    .resize(size, size)
    .flatten({ background: c.bg })
    .jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

function uptimeLabel() {
  const u = uptime();
  return `uptime ${u.years}y ${u.months}m`;
}

export async function defaultTree() {
  const pw = 316;
  const ph = 372;
  const photo = await portraitCard(pw, ph);
  return frame([
    topBar(''),
    h(
      'div',
      {
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: -8,
      },
      [
        h('div', { flexDirection: 'column', width: 640 }, [
          h(
            'div',
            {
              ...mono(18, c.signal, {
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }),
              marginBottom: 20,
            },
            '~/profile · Bengaluru, IN',
          ),
          h(
            'div',
            {
              fontSize: 104,
              fontWeight: 600,
              letterSpacing: '-0.045em',
              lineHeight: 1,
              color: c.fg,
            },
            profile.name,
          ),
          h(
            'div',
            {
              fontSize: 36,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              color: c.muted,
              marginTop: 18,
            },
            profile.headline,
          ),
          h(
            'div',
            {
              flexDirection: 'column',
              marginTop: 30,
              fontSize: 34,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
            },
            [
              h('div', { color: c.fg }, 'Building the platforms enterprises run on,'),
              h('div', { color: c.muted }, 'and the infrastructure AI agents are trained in.'),
            ],
          ),
        ]),
        h(
          'div',
          {
            position: 'relative',
            padding: 6,
            borderRadius: 30,
            border: `1px solid ${c.line}`,
            backgroundColor: 'rgba(17,21,26,0.7)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
          },
          [
            h('img', { width: pw, height: ph, borderRadius: 24 }, null, {
              src: photo,
              width: pw,
              height: ph,
            }),
            h(
              'div',
              {
                position: 'absolute',
                left: 22,
                bottom: 22,
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px',
                borderRadius: 999,
                backgroundColor: 'rgba(6,8,12,0.78)',
                border: '1px solid rgba(239,242,245,0.14)',
                ...mono(16, c.fg),
              },
              [
                h('div', {
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: c.signal,
                  boxShadow: `0 0 10px ${c.signal}`,
                }),
                'on-call · 12+ yrs',
              ],
            ),
          ],
        ),
      ],
    ),
    footerBar(`${uptimeLabel()}  ·  azure · aws · gcp  ·  k8s · terraform · llm evals`, 'region blr-1 · utc+05:30'),
  ]);
}

function metricBlock(m: { value: string; label: string }, color: string, size = 76) {
  return h(
    'div',
    {
      flexDirection: 'column',
      flex: 1,
      paddingLeft: 24,
      borderLeft: `2px solid ${color}`,
    },
    [
      h(
        'div',
        {
          fontSize: size,
          fontWeight: 600,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color,
        },
        m.value,
      ),
      h('div', { fontSize: 22, color: c.muted, marginTop: 12, lineHeight: 1.3 }, clip(m.label, 44)),
    ],
  );
}

const titleSize = (t: string) => (t.length > 64 ? 50 : t.length > 44 ? 58 : t.length > 28 ? 66 : 76);

export function workTree(d: {
  title: string;
  client: string;
  industry: string;
  period: string;
  metrics: { value: string; label: string }[];
}) {
  const metrics = d.metrics.slice(0, 2);
  const valueSize = Math.max(...metrics.map((m) => m.value.length), 0) > 7 ? 60 : 76;
  return frame(
    [
      topBar('/work'),
      h('div', { flexDirection: 'column', width: '100%' }, [
        h(
          'div',
          {
            ...mono(20, c.azure, {
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }),
            marginBottom: 18,
          },
          `${d.client} · ${d.industry}`,
        ),
        h(
          'div',
          {
            fontSize: titleSize(d.title),
            fontWeight: 600,
            letterSpacing: '-0.035em',
            lineHeight: 1.04,
            maxWidth: 1040,
          },
          clip(d.title, 96),
        ),
        metrics.length
          ? h(
              'div',
              { gap: 40, marginTop: 40, width: '100%' },
              metrics.map((m, i) => metricBlock(m, i === 0 ? c.signal : c.amber, valueSize)),
            )
          : null,
      ]),
      footerBar(`case study  ·  ${d.period}`, `${profile.name}  ·  ${profile.headline}`),
    ],
    c.azure,
    c.signal,
  );
}

const categoryMeta = {
  ai: { label: 'AI system', color: c.signal },
  platform: { label: 'Platform', color: c.azure },
  tools: { label: 'Tool', color: c.amber },
} as const;

export function projectTree(d: {
  title: string;
  tagline: string;
  category: keyof typeof categoryMeta;
  year: number;
  status: string;
  stack: string[];
  metrics: { value: string; label: string }[];
}) {
  const cat = categoryMeta[d.category];
  const m = d.metrics[0];
  const mSize = m && m.value.length > 7 ? 52 : 80;
  return frame(
    [
      topBar('/projects'),
      h(
        'div',
        {
          width: '100%',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 48,
        },
        [
          h('div', { flexDirection: 'column', flex: 1 }, [
            h('div', { alignItems: 'center', gap: 14, marginBottom: 22 }, [
              h(
                'div',
                {
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 14px',
                  borderRadius: 999,
                  border: `1px solid ${cat.color}`,
                  backgroundColor: `${cat.color}1f`,
                  ...mono(18, cat.color, {
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }),
                },
                [
                  h('div', {
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: cat.color,
                  }),
                  cat.label,
                ],
              ),
              h('div', mono(18, c.faint), `${d.year} · ${d.status}`),
            ]),
            h(
              'div',
              {
                fontSize: titleSize(d.title),
                fontWeight: 600,
                letterSpacing: '-0.035em',
                lineHeight: 1.04,
              },
              d.title,
            ),
            h(
              'div',
              {
                fontSize: 26,
                lineHeight: 1.4,
                color: c.muted,
                marginTop: 22,
                maxWidth: m ? 760 : 1000,
              },
              clip(d.tagline, m ? 150 : 200),
            ),
          ]),
          m
            ? h(
                'div',
                {
                  flexDirection: 'column',
                  width: 260,
                  padding: '26px 26px 24px',
                  borderRadius: 20,
                  border: `1px solid ${c.line}`,
                  backgroundColor: 'rgba(17,21,26,0.82)',
                },
                [
                  h(
                    'div',
                    mono(15, c.faint, {
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      marginBottom: 14,
                    }),
                    'metric',
                  ),
                  h(
                    'div',
                    {
                      fontSize: mSize,
                      fontWeight: 600,
                      letterSpacing: '-0.04em',
                      lineHeight: 1,
                      color: cat.color,
                    },
                    m.value,
                  ),
                  h(
                    'div',
                    {
                      fontSize: 20,
                      color: c.muted,
                      marginTop: 12,
                      lineHeight: 1.3,
                    },
                    clip(m.label, 48),
                  ),
                ],
              )
            : null,
        ],
      ),
      footerBar(clip(d.stack.slice(0, 4).join(' · ').toLowerCase(), 70), `${profile.name}  ·  open source`),
    ],
    cat.color,
    c.azure,
  );
}

export type WorkData = Parameters<typeof workTree>[0];
export type ProjectData = Parameters<typeof projectTree>[0];
export const defaultCard = async () => renderPng(await defaultTree());
export const workCard = (d: WorkData) => renderPng(workTree(d));
export const projectCard = (d: ProjectData) => renderPng(projectTree(d));
