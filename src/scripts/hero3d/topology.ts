/**
 * Client layout for the hero topology. Pure maths: no DOM, no WebGL, no three.
 *
 * The portrait card is the core node. Three rings hug it as rounded-rect contours
 * (roles inner, case studies middle, projects outer), offset into whatever free space
 * the hero has on each side. The entity tree is laid out radially along the visible
 * arc (bottom-left → over the top → bottom-right) in career order.
 * Every node then gets a depth such that, at rest, it projects exactly onto its 2D slot.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

/** Everything in canvas CSS px, origin top-left. */
export interface Frame {
  W: number;
  H: number;
  card: Box;
  up: Box | null;
  /** Nothing below this y (the next block in the hero, e.g. the client ticker). */
  bottom: number;
  /** Left edge of the scene; everything left of it stays quiet. */
  quiet: number;
}

export const KNOBS = {
  /** Fraction of the width kept quiet behind the hero copy. */
  quiet: 0.55,
  /** px the scene fades in over, right of `quiet`. */
  fade: 56,
  /** Cap on how far the rings reach out on any side (px). */
  maxBand: 150,
  /** Ring offsets as a fraction of the free band on each side. */
  ring: [0.34, 0.66, 0.95],
  /** Rest depth per ring (px, + is towards the viewer) and per-node jitter. */
  z: [26, -28, -84],
  zJitter: 18,
  focal: 1100,
  /** Port tick: distance outside the card border, and its length. */
  port: 11,
  tick: 9,
  /** Minimum spacing between nodes on each ring (px). */
  gap: [62, 50, 40],
  /** Ring track dash: period + on-fraction (0 = solid). */
  dash: [0, 6.5, 4.3],
  ringAlpha: [0.5, 0.42, 0.34],
  /** Packet speed range (px/s) and how many per 100 px of edge. */
  speed: [24, 44],
  packetDensity: 1.25,
};

export interface Layout {
  cx: number;
  cy: number;
  n: number;
  /** Per node, 8 floats: x, y, z (rest, relative to the core), kind, index, phase, radius, path distance. */
  nodes: Float32Array;
  /** 0 left of the card, 1 above, 2 right. */
  side: Uint8Array;
  /** Per segment, 20 floats: A (xyz, pinned), B (xyz, pinned), kind, lit-by node range lo..hi, colour, alpha, width, dash, -, s0, s1 (path length from the core), -, -. */
  lines: Float32Array;
  nLines: number;
  /** Per packet and path segment, 16 floats: A, B, sA, sB, s(child), s(parent), speed (px/s), phase, gap (negative = outbound), node. */
  packets: Float32Array;
  nPackets: number;
}

type Vec = number[] | Float32Array;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Signed distance from (px, py) to a rounded box. */
export function sdBox(b: Box, px: number, py: number): number {
  const qx = Math.abs(px - b.x - b.w / 2) - b.w / 2 + b.r;
  const qy = Math.abs(py - b.y - b.h / 2) - b.h / 2 + b.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - b.r;
}

const RADIUS = [3.7, 3, 2.4];
const TAU = Math.PI * 2;

export function layout(f: Frame, kinds: ArrayLike<number>, parents: ArrayLike<number>, seed = 7): Layout | null {
  const K = KNOBS;
  const n = kinds.length;
  const { card, up } = f;
  const cx = card.x + card.w / 2;
  const cy = card.y + card.h / 2;
  // The rings wrap the whole node column (portrait + uptime card) when the two are stacked.
  const core: Box =
    up && up.x < card.x + card.w && up.x + up.w > card.x
      ? {
          x: Math.min(card.x, up.x),
          y: card.y,
          w: Math.max(card.x + card.w, up.x + up.w) - Math.min(card.x, up.x),
          h: up.y + up.h - card.y,
          r: card.r,
        }
      : card;
  const left = f.quiet + K.fade * 0.5;
  const band = (v: number) => Math.min(K.maxBand, Math.max(0, v));
  const bL = band(core.x - left);
  const bT = band(core.y - 12);
  const bR = band(f.W - 22 - core.x - core.w);
  const bB = band(f.bottom - 24 - core.y - core.h);
  if (bT < 40 || cx < left) return null;

  const ringBox = (k: number): Box => ({
    x: core.x - bL * k,
    y: core.y - bT * k,
    w: core.w + (bL + bR) * k,
    h: core.h + (bT + bB) * k,
    r: core.r + Math.min(bL, bT, bR) * k * 0.9,
  });
  const rings = K.ring.map(ringBox);
  /** Trace channels: halfway between the inner and middle rings, and between the middle and outer rings. */
  const chans = [ringBox((K.ring[0] + K.ring[1]) / 2), ringBox((K.ring[1] + K.ring[2]) / 2)];

  const pt = [0, 0];
  /** Where the ray from the portrait centre at angle `a` crosses box `b` (written to `pt`). */
  const ray = (b: Box, a: number) => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let lo = 0;
    let hi = 4000;
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2;
      if (sdBox(b, cx + dx * m, cy + dy * m) < 0) lo = m;
      else hi = m;
    }
    pt[0] = cx + dx * lo;
    pt[1] = cy + dy * lo;
  };

  const clear = (x: number, y: number) =>
    x > f.quiet + K.fade * 0.5 &&
    x < f.W - 22 &&
    y > 12 &&
    y < f.bottom - 30 &&
    sdBox(card, x, y) > 22 &&
    (!up || sdBox(up, x, y) > 22);

  // Visible arc: the longest run of angles (clockwise from the bottom-left, over the top) where
  // every ring is clear and the inner ring is still beside the portrait, so role stubs reach it.
  const N = 240;
  const a0 = Math.PI * 0.5;
  const step = Math.PI / N;
  let runA = -1;
  let runB = -1;
  for (let i = 0, s = -1; i <= 2 * N; i++) {
    let ok = i < 2 * N;
    for (let k = 0; k < 3 && ok; k++) {
      ray(rings[k], a0 + i * step);
      ok = clear(pt[0], pt[1]) && (k > 0 || pt[1] < card.y + card.h - 24);
    }
    if (ok && s < 0) s = i;
    if (!ok && s >= 0) {
      if (i - s > runB - runA) [runA, runB] = [s, i];
      s = -1;
    }
  }
  if (runA < 0) return null;

  // Arc-length parametrisation of that run, measured along the middle ring.
  const M = runB - runA;
  const acc = new Float32Array(M);
  ray(rings[1], a0 + runA * step);
  for (let i = 1, px = pt[0], py = pt[1]; i < M; i++) {
    ray(rings[1], a0 + (runA + i) * step);
    acc[i] = acc[i - 1] + Math.hypot(pt[0] - px, pt[1] - py);
    [px, py] = pt;
  }
  const arc = acc[M - 1];
  // Not enough arc to space every ring's nodes calmly (e.g. a narrow two-column hero): render nothing.
  for (let k = 0; k < 3; k++) {
    let count = 0;
    for (let i = 0; i < n; i++) count += +(kinds[i] === k);
    if (count * K.gap[k] > arc) return null;
  }
  const angle = (t: number) => {
    const s = t * arc;
    let i = 1;
    while (i < M - 1 && acc[i] < s) i++;
    const u = (s - acc[i - 1]) / Math.max(acc[i] - acc[i - 1], 1e-6);
    return a0 + (runA + i - 1 + Math.min(1, Math.max(0, u))) * step;
  };

  // Radial tree: every subtree gets a share of the arc proportional to its leaf count.
  const kids: number[][] = Array.from({ length: n }, () => []);
  const roots: number[] = [];
  for (let i = 0; i < n; i++) (parents[i] < 0 ? roots : kids[parents[i]]).push(i);
  const w = new Float32Array(n);
  const weigh = (i: number): number => (w[i] = Math.max(1, kids[i].reduce((s, c) => s + weigh(c), 0)));
  roots.forEach(weigh);
  const t = new Float32Array(n);
  const share = (list: number[], a: number, b: number) => {
    const unit = (b - a) / list.reduce((s, c) => s + w[c], 0);
    for (const c of list) {
      const span = unit * w[c];
      t[c] = a + span / 2;
      share(kids[c], a, a + span);
      a += span;
    }
  };
  share(roots, 0, 1);

  // Keep a minimum gap between neighbours on each ring (forward pass, then backward).
  for (let k = 0; k < 3; k++) {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) if (kinds[i] === k) ids.push(i);
    const g = Math.min(K.gap[k] / arc, 1 / Math.max(ids.length, 1));
    ids.forEach((id, j) => (t[id] = Math.max(t[id], j ? t[ids[j - 1]] + g : g / 2)));
    for (let j = ids.length - 1; j >= 0; j--) t[ids[j]] = Math.min(t[ids[j]], j < ids.length - 1 ? t[ids[j + 1]] - g : 1 - g / 2);
  }

  const rnd = mulberry32(seed);
  const F = K.focal;
  const nodes = new Float32Array(n * 8);
  const theta = new Float32Array(n);
  const side = new Uint8Array(n);
  const dist = new Float32Array(n);
  /** 3D rest position (relative to the core) that projects exactly onto screen (x, y). */
  const lift = (x: number, y: number, z: number): Vec => [((x - cx) * (F - z)) / F, ((y - cy) * (F - z)) / F, z, 0];
  /** Rest screen position of a lifted (or pinned) point. */
  const screen = (v: Vec) => (v[3] ? [cx + v[0], cy + v[1]] : [cx + (v[0] * F) / (F - v[2]), cy + (v[1] * F) / (F - v[2])]);
  const gap = (a: Vec, b: Vec) => {
    const [ax, ay] = screen(a);
    const [bx, by] = screen(b);
    return Math.hypot(bx - ax, by - ay);
  };
  const node3: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const k = kinds[i];
    theta[i] = angle(t[i]);
    ray(rings[k], theta[i]);
    side[i] = pt[1] < card.y ? 1 : pt[0] < cx ? 0 : 2;
    node3[i] = lift(pt[0], pt[1], K.z[k] + (rnd() - 0.5) * 2 * K.zJitter);
    nodes.set([...node3[i].slice(0, 3), k, i, rnd() * TAU, RADIUS[k]], i * 8);
  }

  const lines: number[] = [];
  /** Segment: A, B, [kind, lo, hi, colour], [alpha, width, dash, 0], [s0, s1, 0, 0]. Nodes lo..hi light it up. */
  const seg = (A: Vec, B: Vec, kind: number, lo: number, hi: number, col: number, alpha: number, width: number, dash: number, s0: number, s1: number) =>
    lines.push(...A, ...B, kind, lo, hi, col, alpha, width, dash, 0, s0, s1, 0, 0);

  // Ring tracks: full loops; the shader clips them.
  const R = 200;
  for (let k = 0; k < 3; k++) {
    let s = 0;
    let prev: Vec | null = null;
    for (let j = 0; j <= R; j++) {
      ray(rings[k], (j / R) * TAU);
      const p = lift(pt[0], pt[1], K.z[k]);
      if (prev) {
        const d = gap(prev, p);
        seg(prev, p, 0, -2, -2, 4, K.ringAlpha[k], 1, K.dash[k], s, s + d);
        s += d;
      }
      prev = p;
    }
  }

  // Edges are routed like PCB traces: out from the parent to a channel between the rings, along the
  // channel, then in to the child. Siblings share the trunk, which is drawn once.
  const end = new Int32Array(n);
  const last = (i: number): number => (end[i] = kids[i].reduce((m, c) => Math.max(m, last(c)), i));
  roots.forEach(last);
  /** Per node: the segments of the path from its parent, as [A, B, sA, sB]. */
  const paths: number[][][] = Array.from({ length: n }, () => []);
  const trace = (A: Vec, B: Vec, s0: number, lo: number, hi: number, col: number, users: number[]) => {
    const s1 = s0 + gap(A, B);
    seg(A, B, 1, lo, hi, col, 1, 1, 0, s0, s1);
    for (const u of users) paths[u].push([...A, ...B, s0, s1]);
    return s1;
  };

  for (let p = 0; p < n; p++) {
    if (parents[p] < 0) {
      // Role → a port just outside the card border, with a tick across it.
      const [x, y] = screen(node3[p]);
      const d = sdBox(card, x, y);
      let nx = sdBox(card, x + 0.5, y) - sdBox(card, x - 0.5, y);
      let ny = sdBox(card, x, y + 0.5) - sdBox(card, x, y - 0.5);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const px = x - nx * (d - K.port) - cx;
      const py = y - ny * (d - K.port) - cy;
      const h = K.tick / 2;
      dist[p] = trace([px, py, 0, 1], node3[p], 0, p, p, 0, [p]);
      seg([px - ny * h, py + nx * h, 0, 1], [px + ny * h, py - nx * h, 0, 1], 2, p, p, 5, 1, 1.5, 0, 0, 0);
    }
    for (const kc of [1, 2]) {
      const group = kids[p].filter((c) => kinds[c] === kc);
      if (!group.length) continue;
      const box = chans[kc - 1];
      const zc = (K.z[kc - 1] + K.z[kc]) / 2;
      const at = (a: number) => (ray(box, a), lift(pt[0], pt[1], zc));
      /** Angle of the point on the channel closest to node i, so connectors meet the channel square-on. */
      const foot = (i: number) => {
        const [x, y] = screen(node3[i]);
        const d = sdBox(box, x, y);
        const nx = sdBox(box, x + 0.5, y) - sdBox(box, x - 0.5, y);
        const ny = sdBox(box, x, y + 0.5) - sdBox(box, x, y - 0.5);
        const l = Math.hypot(nx, ny) || 1;
        let a = Math.atan2(y - (ny / l) * d - cy, x - (nx / l) * d - cx);
        while (a < a0) a += TAU;
        return a;
      };
      const tp = foot(p);
      const tc = new Map(group.map((c) => [c, foot(c)]));
      group.sort((a, b) => tc.get(a)! - tc.get(b)!);
      const root = at(tp);
      const s0 = trace(node3[p], root, dist[p], Math.min(...group), Math.max(...group.map((u) => end[u])), kc, group);
      for (const branch of [group.filter((c) => tc.get(c)! >= tp), group.filter((c) => tc.get(c)! < tp).reverse()]) {
        let a = tp;
        let s = s0;
        let prev = root;
        branch.forEach((c, j) => {
          const users = branch.slice(j);
          const lo = Math.min(...users);
          const hi = Math.max(...users.map((u) => end[u]));
          const ta = tc.get(c)!;
          const steps = Math.ceil(Math.abs(ta - a) / 0.02);
          let held: Vec | null = null;
          for (let q = 1; q <= steps; q++) {
            const next = at(a + ((ta - a) * q) / steps);
            // Merge collinear steps (the straight sides) into one segment.
            if (held) {
              const ux = held[0] - prev[0];
              const uy = held[1] - prev[1];
              const vx = next[0] - held[0];
              const vy = next[1] - held[1];
              if (Math.abs(ux * vy - uy * vx) > 0.004 * Math.hypot(ux, uy) * Math.hypot(vx, vy)) {
                s = trace(prev, held, s, lo, hi, kc, users);
                prev = held;
              }
            }
            held = next;
          }
          if (held) {
            s = trace(prev, held, s, lo, hi, kc, users);
            prev = held;
          }
          a = ta;
          dist[c] = trace(prev, node3[c], s, c, end[c], kc, [c]);
        });
      }
    }
  }

  // Packets ride those paths; each packet is instanced once per segment and clipped to it in the shader.
  const packets: number[] = [];
  for (let i = 0; i < n; i++) {
    const s1 = dist[i];
    const s0 = parents[i] < 0 ? 0 : dist[parents[i]];
    const len = s1 - s0;
    const count = Math.max(1, Math.round((len / 100) * K.packetDensity));
    for (let j = 0; j < count; j++) {
      const v = K.speed[0] + rnd() * (K.speed[1] - K.speed[0]);
      const g = (0.3 + rnd() * 1.6) * (rnd() < 0.22 ? -1 : 1);
      const ph = rnd();
      for (const sg of paths[i]) packets.push(...sg, s1, s0, v, ph, g, i);
    }
    nodes[i * 8 + 7] = s1;
  }

  return {
    cx,
    cy,
    n,
    nodes,
    side,
    lines: new Float32Array(lines),
    nLines: lines.length / 20,
    packets: new Float32Array(packets),
    nPackets: packets.length / 16,
  };
}

/** CPU twin of the vertex shader's projection, for hit-testing and label placement. */
export function project(L: Layout, yaw: number, pitch: number, out: Float32Array): void {
  const F = KNOBS.focal;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  for (let i = 0; i < L.n; i++) {
    const x = L.nodes[i * 8];
    const y = L.nodes[i * 8 + 1];
    const z = L.nodes[i * 8 + 2];
    const z1 = z * cy - x * sy;
    const k = F / (F - y * sp - z1 * cp);
    out[i * 2] = L.cx + (x * cy + z * sy) * k;
    out[i * 2 + 1] = L.cy + (y * cp - z1 * sp) * k;
  }
}
