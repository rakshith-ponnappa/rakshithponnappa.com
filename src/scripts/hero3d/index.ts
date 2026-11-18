import { KNOBS, layout, project, type Box, type Layout } from './topology';
import { THEMES, readTheme } from './palette';
import { UN, createRenderer } from './gl';

export interface Hero3DOptions {
  /** Render even on a software rasteriser (QA only: `?hero3d=force`). */
  force?: boolean;
}

const MAX_DPR = 2;
const SLOW_FRAME_MS = 20;
const BAIL_FRAME_MS = 30;
const SAMPLE_FRAMES = 60;
const WARMUP_FRAMES = 20;
const MAX_TILT = (4 * Math.PI) / 180;
const HIT_RADIUS = 16;
const LABEL_GAP = 14;

/*
 * Shared uniform array U (vec4 slots):
 *  0 W, H, time, -          1 core x, y, focal, dpr     2 yaw, pitch, hover t0, deploy t0
 *  3 hover chain (4 ids)    4 deploy chain (4 ids)      5 card centre + half size
 *  6 uptime centre + half   7 quiet x, bottom, radii    8 hover path length, -, fade, -
 *  9–16 palette (palette.ts)
 */

/**
 * Mounts the topology into `container` (a `[data-hero3d]` layer inside `.hero`) and returns a dispose function.
 * Never throws. Without WebGL2, on a software rasteriser, or when the hero has no room beside the portrait,
 * it renders nothing.
 */
export function mountHero3D(container: HTMLElement, opts: Hero3DOptions = {}): () => void {
  const noop = () => {};
  const hero = container.closest<HTMLElement>('.hero') ?? container.parentElement;
  const portrait = hero?.querySelector<HTMLElement>('.portrait');
  const nav = container.querySelector<HTMLElement>('[data-topo]');
  if (!hero || !portrait || !nav) return noop;
  const uptime = hero.querySelector<HTMLElement>('.uptime');
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[data-k]')];
  const kinds = links.map((a) => +a.dataset.k!);
  const parents = links.map((a) => +a.dataset.p!);
  const n = links.length;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: !opts.force,
  });
  const r = gl && createRenderer(gl);
  if (!gl || !r) return noop;
  container.appendChild(canvas);

  // The link list moves to just after the portrait's column, so Tab reaches it after the hero copy and CTAs.
  let grid: Element = portrait;
  while (grid.parentElement && grid.parentElement !== hero) grid = grid.parentElement;
  grid.after(nav);

  const U = new Float32Array(UN * 4);
  const proj = new Float32Array(n * 2);
  let L: Layout | null = null;
  let W = 0;
  let H = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let ox = 0;
  let oy = 0;
  let cardX = 0;
  let cardY = 0;
  let light = false;
  let shown = false;
  let hover = -1;
  let focus = -1;
  let active = -1;
  let time = 0;

  const applyTheme = () => {
    light = readTheme() === 'light';
    U.set(THEMES[light ? 'light' : 'dark'], 36);
  };
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const scheme = window.matchMedia('(prefers-color-scheme: light)');
  scheme.addEventListener('change', applyTheme);

  // ---------- Layout ----------
  const box = (el: Element, c: DOMRect): Box => {
    const b = el.getBoundingClientRect();
    return { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height, r: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 };
  };
  const setBox = (b: Box | null, at: number) => U.set(b ? [b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2] : [-1e5, -1e5, 0, 0], at);

  const relayout = () => {
    const c = container.getBoundingClientRect();
    W = c.width;
    H = c.height;
    ox = c.left + scrollX;
    oy = c.top + scrollY;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    const card = box(portrait, c);
    const up = uptime ? box(uptime, c) : null;
    let next = grid.nextElementSibling;
    if (next === nav) next = nav.nextElementSibling;
    const bottom = next ? next.getBoundingClientRect().top - c.top : H;
    cardX = card.x;
    cardY = card.y;
    L = layout({ W, H, card, up, bottom, quiet: W * KNOBS.quiet }, kinds, parents);
    nav.hidden = !L;
    update();
    if (!L) {
      shown = false;
      container.dataset.ready = 'false';
      show(-1);
      return;
    }
    r.upload(L);
    U.set([W, H], 0);
    U.set([L.cx, L.cy, KNOBS.focal, dpr], 4);
    setBox(card, 20);
    setBox(up, 24);
    U.set([W * KNOBS.quiet, bottom, card.r, up?.r ?? 0], 28);
    U[34] = KNOBS.fade;
    project(L, U[8], U[9], proj);
    if (active >= 0) place(active);
  };

  // ---------- Hover / focus labels ----------
  /** Writes node i and its ancestors (up to the role) into a 4-slot chain uniform. */
  const chain = (i: number, at: number) => {
    for (let k = 0; k < 4; k++, i = i >= 0 ? parents[i] : -1) U[at + k] = i;
  };
  chain(-1, 12);
  chain(-1, 16);

  const place = (i: number) => {
    const el = links[i];
    const x = proj[i * 2];
    const y = proj[i * 2 + 1];
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const s = L!.side[i];
    // Labels open towards the card, never over the hero copy; they flip left only at the viewport edge.
    let lx = s === 1 ? x - w / 2 : x + LABEL_GAP;
    let ly = s === 1 ? y - LABEL_GAP - h : y - h / 2;
    if (lx + w > W - 8) lx = x - LABEL_GAP - w;
    if (ly < 8) ly = y + LABEL_GAP;
    lx = Math.max(8, Math.min(lx, W - w - 8));
    ly = Math.max(8, Math.min(ly, H - h - 8));
    el.style.translate = `${lx}px ${ly}px`;
    el.style.setProperty('--hx', `${x - lx}px`);
    el.style.setProperty('--hy', `${y - ly}px`);
  };

  function show(i: number) {
    if (i === active) return;
    if (active >= 0) links[active].classList.remove('on');
    active = i;
    chain(i, 12);
    if (i < 0 || !L) return;
    U[10] = time;
    U[32] = L.nodes[i * 8 + 7];
    links[i].classList.add('on');
    place(i);
  }
  const sync = () => show(hover >= 0 ? hover : focus);

  const target = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    target.x = (e.clientX / innerWidth) * 2 - 1;
    target.y = (e.clientY / innerHeight) * 2 - 1;
    if (!L) return;
    const x = e.pageX - ox;
    const y = e.pageY - oy;
    let best = -1;
    let bd = HIT_RADIUS * HIT_RADIUS;
    for (let i = 0; i < n; i++) {
      const d = (proj[i * 2] - x) ** 2 + (proj[i * 2 + 1] - y) ** 2;
      if (d < bd) {
        best = i;
        bd = d;
      }
    }
    // Keep the label up while the pointer travels onto it.
    if (best < 0 && active >= 0 && active === hover && links[active].contains(e.target as Node)) best = active;
    hover = best;
    sync();
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });

  const onFocus = (e: FocusEvent) => {
    focus = e.type === 'focusin' ? links.indexOf(e.target as HTMLAnchorElement) : -1;
    sync();
  };
  nav.addEventListener('focusin', onFocus);
  nav.addEventListener('focusout', onFocus);

  // ---------- Loop ----------
  let last = -1;
  let frame = 0;
  let sum = 0;
  let count = 0;
  let raf = 0;
  let nextDeploy = 2.2;
  let yaw = 0;
  let pitch = 0;
  let seed = 0x9e3779b9;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const ms = last < 0 ? 16.7 : now - last;
    last = now;
    const dt = Math.min(ms, 50) / 1000;
    time += dt;
    frame++;

    if (frame > WARMUP_FRAMES) {
      sum += ms;
      if (++count === SAMPLE_FRAMES) {
        const avg = sum / count;
        sum = count = 0;
        if (avg > SLOW_FRAME_MS && dpr > 1) {
          dpr = 1;
          relayout();
          if (!running) return;
        } else if (avg > BAIL_FRAME_MS) {
          // Still too slow at 1×: this device is better served by the static hero.
          container.dataset.hero3d = 'bailed';
          dispose();
          return;
        }
      }
    }
    if (frame % 60 === 0) {
      const c = container.getBoundingClientRect();
      const b = portrait.getBoundingClientRect();
      ox = c.left + scrollX;
      oy = c.top + scrollY;
      if (Math.abs(b.left - c.left - cardX) > 0.5 || Math.abs(b.top - c.top - cardY) > 0.5) relayout();
    }
    if (!L) return;

    // Pointer parallax (≤ 4°) plus a slow idle sway, exponentially smoothed.
    const k = 1 - Math.exp(-dt * 2.5);
    yaw += (target.x * MAX_TILT * 0.8 + Math.sin(time * 0.13) * 0.014 - yaw) * k;
    pitch += (-target.y * MAX_TILT * 0.5 + Math.sin(time * 0.09) * 0.009 - pitch) * k;
    U[2] = time;
    U[8] = Math.max(-MAX_TILT, Math.min(MAX_TILT, yaw));
    U[9] = Math.max(-MAX_TILT, Math.min(MAX_TILT, pitch));
    project(L, U[8], U[9], proj);

    if (time > nextDeploy) {
      let i = Math.floor(rnd() * n);
      if (i === active) i = (i + 1) % n;
      chain(i, 16);
      U[11] = time;
      nextDeploy = time + 5 + rnd() * 4;
    }

    r.draw(U, canvas.width, canvas.height, !light);
    if (!shown) {
      shown = true;
      requestAnimationFrame(() => L && (container.dataset.ready = 'true'));
    }
  };

  // ---------- Visibility / pause ----------
  let inView = true;
  let running = false;
  // Runs only while there is a layout, the hero is on screen and the tab is visible; a resize can restart it.
  function update() {
    const should = !!L && inView && !document.hidden;
    if (should === running) return;
    running = should;
    last = -1;
    sum = count = 0;
    if (running) raf = requestAnimationFrame(loop);
    else cancelAnimationFrame(raf);
  }
  const io = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    update();
  });
  io.observe(container);
  document.addEventListener('visibilitychange', update);

  const ro = new ResizeObserver(() => relayout());
  [container, portrait, uptime].forEach((el) => el && ro.observe(el));
  const onLost = (e: Event) => {
    e.preventDefault();
    dispose();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  relayout();

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    themeObserver.disconnect();
    scheme.removeEventListener('change', applyTheme);
    document.removeEventListener('visibilitychange', update);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('pointerdown', onPointer);
    nav.removeEventListener('focusin', onFocus);
    nav.removeEventListener('focusout', onFocus);
    canvas.removeEventListener('webglcontextlost', onLost);
    show(-1);
    nav.hidden = true;
    container.append(nav);
    r.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
    delete container.dataset.ready;
  };
  return dispose;
}
