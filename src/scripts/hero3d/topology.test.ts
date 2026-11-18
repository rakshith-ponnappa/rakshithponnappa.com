import { describe, expect, it } from 'vitest';
import { buildEntities, type ProjectIn, type WorkIn } from './entities';
import { KNOBS, layout, project, sdBox, type Frame } from './topology';
import type { Role } from '../../data/profile';

const role = (id: string, company: string, start: string, end: string | null, kind: Role['kind'] = 'full-time'): Role => ({
  id,
  title: `Engineer (${id})`,
  company,
  location: '',
  start,
  end,
  kind,
  summary: '',
  bullets: [],
  clients: [],
});
const work = (id: string, employer: string, stack: string[], order: number): WorkIn => ({
  id,
  data: { title: id, client: id, employer, stack, order },
});
const repo = (id: string, year: number, stack: string[], order: number): ProjectIn => ({
  id,
  data: { title: id, tagline: id, year, stack, order },
});

const ROLES = [role('acme', 'Acme', '2016-01', '2019-12'), role('globex', 'Globex', '2020-01', null), role('gig', 'Gig', '2024-03', '2024-05', 'contract')];
const WORK = [
  work('gitlab-upgrade', 'Globex', ['GitLab Omnibus', 'PostgreSQL', 'GitHub Actions'], 1),
  work('k8s-platform', 'Acme', ['Kubernetes', 'Istio', 'GitHub Actions'], 2),
  work('lz-audit', 'Globex', ['Terraform', 'AKS', 'GitHub Actions'], 3),
];
const PROJECTS = [
  repo('gitlab-omnibus-playbook', 2024, ['GitLab Omnibus', 'Bash', 'GitHub Actions'], 1),
  repo('istio-lab', 2018, ['Kubernetes', 'Istio', 'Helm'], 2),
  repo('notes-app', 2024, ['Svelte', 'GitHub Actions'], 3),
  // Unrelated repos give the IDF weighting a realistic corpus.
  ...['Rust', 'Go', 'Zig', 'Elixir', 'Haskell', 'OCaml'].map((l, i) => repo(`${l.toLowerCase()}-tool`, 2024, [l, 'GitHub Actions'], 4 + i)),
];

describe('buildEntities', () => {
  const e = buildEntities(ROLES, WORK, PROJECTS);
  const byKey = (k: string) => e.findIndex((x) => x.key === k);

  it('hangs case studies off their employer and projects off the case study they share a distinctive stack with', () => {
    expect(e[byKey('case/k8s-platform')].p).toBe(byKey('role/acme'));
    expect(e[byKey('case/lz-audit')].p).toBe(byKey('role/globex'));
    expect(e[byKey('repo/gitlab-omnibus-playbook')].p).toBe(byKey('case/gitlab-upgrade'));
    expect(e[byKey('repo/istio-lab')].p).toBe(byKey('case/k8s-platform'));
  });

  it('falls back to the full-time role spanning the project year when nothing distinctive is shared', () => {
    // "GitHub Actions" is everywhere, so it does not count as kinship.
    expect(e[byKey('repo/notes-app')].p).toBe(byKey('role/globex'));
  });

  it('emits a depth-first order (parents first), roles chronological', () => {
    e.forEach((x, i) => expect(x.p).toBeLessThan(i));
    expect(e.filter((x) => x.k === 0).map((x) => x.key)).toEqual(['role/acme', 'role/globex', 'role/gig']);
    expect(e[byKey('role/gig')].meta).toBe('2024');
  });
});

describe('layout', () => {
  const e = buildEntities(ROLES, WORK, PROJECTS);
  const kinds = e.map((x) => x.k);
  const parents = e.map((x) => x.p);
  // The 1440 × 900 home hero: portrait and uptime card stacked in the right column.
  const frame: Frame = {
    W: 1440,
    H: 865,
    card: { x: 920, y: 104, w: 380, h: 434, r: 22 },
    up: { x: 920, y: 552, w: 380, h: 126, r: 14 },
    bottom: 776,
    quiet: 1440 * KNOBS.quiet,
  };

  it('keeps every node outside the cards, right of the quiet zone and inside the hero', () => {
    const L = layout(frame, kinds, parents)!;
    expect(L).not.toBeNull();
    const out = new Float32Array(L.n * 2);
    project(L, 0, 0, out);
    for (let i = 0; i < L.n; i++) {
      const [x, y] = [out[i * 2], out[i * 2 + 1]];
      expect(sdBox(frame.card, x, y)).toBeGreaterThan(20);
      expect(sdBox(frame.up!, x, y)).toBeGreaterThan(20);
      expect(x).toBeGreaterThan(frame.quiet);
      expect(x).toBeLessThan(frame.W);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(frame.bottom);
    }
  });

  it('ends every role edge at a port just outside the portrait border', () => {
    const L = layout(frame, kinds, parents)!;
    const ports = [];
    for (let s = 0; s < L.nLines; s++) {
      const o = s * 20;
      if (L.lines[o + 8] === 2) ports.push([L.cx + (L.lines[o] + L.lines[o + 4]) / 2, L.cy + (L.lines[o + 1] + L.lines[o + 5]) / 2]);
    }
    expect(ports).toHaveLength(ROLES.length);
    for (const [x, y] of ports) expect(sdBox(frame.card, x, y)).toBeCloseTo(KNOBS.port, 0);
  });

  it('renders nothing when the portrait is not in a right-hand column or the arc is too tight', () => {
    expect(layout({ ...frame, card: { ...frame.card, x: 140 }, up: null }, kinds, parents)).toBeNull();
    const many = Array.from({ length: 80 }, (_, i) => (i < 5 ? 0 : 2));
    expect(layout(frame, many, many.map((k) => (k ? 0 : -1)))).toBeNull();
  });
});
