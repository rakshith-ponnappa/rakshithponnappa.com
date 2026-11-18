# Hero3D — "Career topology"

A progressive-enhancement WebGL2 layer in the hero. The `.portrait` card is the topology's **core node**; the
roles, case studies and projects from the résumé data hang off it as a live service graph. It's quiet, slow
and premium, it never covers the card, and it never blocks a click except over a node.

```
src/components/Hero3D.astro        markup (link list), scoped styles, gating and the lazy loader
src/scripts/hero3d/entities.ts     build-time only: résumé data → entity tree (never shipped to the client)
src/scripts/hero3d/topology.ts     pure layout maths: rings, routed traces, packets, projection (no DOM, no GL)
src/scripts/hero3d/gl.ts           hand-written WebGL2: 3 instanced programs (lines, nodes, packets)
src/scripts/hero3d/palette.ts      OKLCH → linear sRGB, per-theme uniforms, readTheme()
src/scripts/hero3d/index.ts        mountHero3D(): canvas, loop, pointer/hover, DPR, pause, theme, dispose
src/scripts/hero3d/topology.test.ts  layout invariants (vitest)
```

There is no three.js. The previous three/WebGPU scene was a 221.7 KB gz chunk; this one is under 8 KB.

## Design intent

- **The card is the core.** Layout is anchored on `.portrait`'s bounding box (re-read on resize and every
  60 frames). Every trace terminates in a short "port" tick just outside the card border, and every
  fragment shader fades to zero within 5–9 px of the card's and the `.uptime` panel's rounded rects
  (signed-distance mask), so nothing ever renders over the photo or the panel.
- **Real entities, not decoration.** Nodes come from `src/data/profile.ts` and the content collections:
  - **roles** (inner ring, green), parent = the portrait
  - **case studies** (middle ring, azure), parent = the employer's role
  - **projects** (outer ring, slate), parent = the case study sharing the most stack keywords
    (`MATCH_MIN` = 2.6), else the role active in the project's year

  Today that's 5 roles, 9 case studies and 12 projects (26 nodes).
- **Rings as rounded-rect contours.** The three rings hug the card as offset rounded rects, pushed into
  whatever free band the hero has on each side (`KNOBS.ring`, capped by `KNOBS.maxBand`). The entity tree is
  laid out radially along the visible arc (bottom-left → over the top → bottom-right) in career order.
  Edges are routed like PCB traces: out along a channel between rings, then square-on into the port.
- **Live traffic.** Packets run along each root-to-leaf path (density `KNOBS.packetDensity` per 100 px,
  speed `KNOBS.speed`), mostly inbound towards the card with some outbound. All motion is in the vertex
  shader; the CPU only updates one uniform array per frame.
- **Deploys.** Every 5–9 s a random node and its ancestor chain turn amber, and a pulse runs down the chain
  to the card.
- **Hover/focus.** Hovering a node (16 px hit radius) or focusing its link lights its chain up to the card
  and shows its label (`role/ensono`, title, meta). The label *is* the entity's link from the hidden list,
  moved onto the node with CSSOM and given `pointer-events: auto`, so clicking the node is a real link click.
- **Depth.** Each ring has a rest depth (`KNOBS.z`) with per-node jitter, chosen so that at rest every node
  projects exactly onto its 2D slot. Pointer parallax tilts the scene by up to 4°, smoothed.
- **Quiet zone.** Nothing renders left of `KNOBS.quiet` (55% of the width) and it fades in over 56 px, so
  the hero copy and CTAs sit on a clean background.
- **Themes.** Dark ("NOC") uses additive blending for glow without post-processing. Light ("Day shift")
  uses normal premultiplied blending with darker ink. A `MutationObserver` on `html[data-theme]` swaps the
  palette uniforms live; without the attribute, `prefers-color-scheme` decides.

Palette (from `global.css`): signal green `oklch(.84 .19 150)`, azure `oklch(.74 .13 240)`, amber
`oklch(.82 .16 80)`; the light variants are darker (L ≈ .42–.62) for 3:1 non-text contrast on paper.

## Accessibility and input

- The canvas is `aria-hidden` and `pointer-events: none`. Clicks pass straight through to the hero copy and
  CTAs (verified with `elementFromPoint` and real clicks on all three CTAs).
- `Hero3D.astro` renders a `<nav class="topo" aria-label="Career topology" data-topo>` with one real link per
  entity. At mount it's moved to just after the portrait's column, so Tab reaches it after the hero copy and
  CTAs. Each link is visually hidden until it's focused or its node is hovered; then it becomes that node's
  label, positioned next to the node (`--hx`/`--hy` via CSSOM, so it's CSP-safe).
- Only the one active label is `pointer-events: auto`; everything else in the layer ignores the pointer.
- If the topology doesn't mount (gated, no WebGL2, no room), the list stays `hidden` and the hero is the
  plain static card.

## Gating

All of this happens in `Hero3D.astro`'s client script, before the dynamic `import()`.

1. **Skip** if any of these is true:
   - `prefers-reduced-motion: reduce` (the CSS also hides the layer)
   - `navigator.connection.saveData`, or a `2g` effective type
   - `navigator.deviceMemory < 4` or `hardwareConcurrency < 4`
   - `innerWidth < 768`
   - the portrait isn't in the right-hand half of the viewport (single-column layouts skip the download)
2. If the page is being **prerendered** (`document.prerendering`), wait for `prerenderingchange`.
3. Wait for `window.load`, then `requestIdleCallback` (2.5 s timeout; `setTimeout` fallback), then for the
   container to intersect the viewport.
4. `import('../scripts/hero3d/index')`. The chunk is never preloaded and never in the initial bundle.
5. Torn down on a switch to reduced motion mid-session and on `astro:before-swap`; re-run on
   `astro:page-load`.

Inside `mountHero3D` there are further bail-outs, each of which leaves the static hero untouched:
no WebGL2 context, `failIfMajorPerformanceCaveat` (software rasterisers), or a layout that can't space the
nodes (`layout()` returns `null` when the free band beside the card is too thin or the arc too short; at a
1024 px viewport that's the case, so 1024 renders the plain card).

`?hero3d=force` skips the device gates and the performance caveat, for QA in headless/software GL.

## Runtime behaviour and performance budget

| Item | Budget / behaviour |
| --- | --- |
| Lazy chunk (`_astro/hero3d.*.js`) | **≤ 12 KB gz**. Measured: **16.9 KB raw, 7.9 KB gzip -9**. No `three` import. |
| Loader (`Hero3D.astro` script) | 1.6 KB raw, 0.9 KB gzip |
| Entity data | Inlined in the HTML as the link list (built by `entities.ts` at build time) |
| Draw calls | 3 instanced triangle strips per frame (lines, nodes, packets); one `uniform4fv` each |
| Per-frame CPU | Pointer smoothing, projection of n nodes for hit-testing, one 17 × vec4 uniform upload |
| DPR | Starts at `min(devicePixelRatio, 2)`. After 20 warm-up frames it averages 60 frames: above 20 ms it drops to 1× once; still above 30 ms at 1× it disposes and sets `data-hero3d="bailed"`. |
| Pause | The rAF loop stops when `document.hidden`, when the container is off-screen (`IntersectionObserver`) or when there's no layout. dt is clamped to 50 ms, so resuming doesn't jump. |
| Resize | A `ResizeObserver` re-reads the card, the `.uptime` panel and the next block's top, and re-lays out. If the layout becomes possible again (e.g. 1024 → 1440), the loop and the link list re-arm. |
| Fade-in | `opacity` 0 → 1 after the first rendered frame (`data-ready="true"`). |
| Dispose | Idempotent: cancels rAF, removes all listeners and observers, deletes GL programs, VAOs and buffers, loses the context, removes the canvas, and hides and returns the link list. A lost context disposes too. |

## Tuning knobs

| Knob | Where | Default | Effect |
| --- | --- | --- | --- |
| `quiet` / `fade` | `KNOBS` (`topology.ts`) | 0.55 / 56 px | Quiet zone behind the copy and its fade width |
| `ring` / `maxBand` | `KNOBS` | [.34, .66, .95] / 150 px | Ring offsets as a fraction of the free band, and the band cap |
| `gap` | `KNOBS` | [62, 50, 40] px | Minimum node spacing per ring; also decides when the layout gives up |
| `z` / `zJitter` / `focal` | `KNOBS` | [26, -28, -84] / 18 / 1100 | Rest depth per ring and the projection's focal length |
| `port` / `tick` | `KNOBS` | 11 / 9 px | Where traces meet the card border |
| `dash` / `ringAlpha` | `KNOBS` | per ring | Ring track styling |
| `speed` / `packetDensity` | `KNOBS` | 24–44 px/s / 1.25 per 100 px | Traffic |
| `MATCH_MIN` | `entities.ts` | 2.6 | Keyword score needed to hang a project off a case study |
| `MAX_DPR`, `SLOW_FRAME_MS`, `BAIL_FRAME_MS` | `index.ts` | 2, 20, 30 | Adaptive resolution and bail-out |
| `MAX_TILT`, `HIT_RADIUS`, `LABEL_GAP` | `index.ts` | 4°, 16 px, 14 px | Parallax, hover target size, label offset |
| `THEMES` | `palette.ts` | per theme | Colours, alphas, glow (additive) vs ink |

## Usage

```astro
---
import Hero3D from '../components/Hero3D.astro';
---
<section class="hero">        <!-- positioned box -->
  <Hero3D />                  <!-- absolute, inset 0, z-index 0 -->
  <div class="hero-grid">…<div class="portrait">…</div><div class="uptime">…</div></div>
</section>
```

`Hero3D` needs a `.portrait` inside the same `.hero`; the optional `.uptime` panel is masked too. Keep the
hero copy above the layer (`position: relative; z-index: 1`) using classes, not inline styles (CSP).

## Tests

`npx vitest run src/scripts/hero3d` checks the entity tree (case studies hang off their employer, projects
off a distinctive shared stack or else the role active that year, depth-first order) and the layout
invariants (every node outside the cards, right of the quiet line and inside the hero; role edges end at a
port just outside the portrait border; `null` when there's no right-hand column or the arc is too tight).
