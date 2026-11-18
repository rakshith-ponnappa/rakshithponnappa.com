/**
 * Build-time only: turns the résumé data into the hero topology's entity tree.
 *   core (the portrait) → roles → case studies (by employer) → projects (by shared stack, else by year → role)
 * Imported by Hero3D.astro's frontmatter, never by the client chunk.
 */
import type { Role } from '../../data/profile';

/** 0 = role (inner ring), 1 = case study (middle), 2 = project (outer). */
export type Kind = 0 | 1 | 2;

export interface Entity {
  k: Kind;
  /** Index of the parent entity, or -1 for a role (its parent is the portrait). */
  p: number;
  /** Resource-style key shown in the label, e.g. `case/planhub-aws-platform`. */
  key: string;
  title: string;
  meta: string;
  href: string;
}

export interface WorkIn {
  id: string;
  data: { title: string; client: string; employer: string; stack: string[]; order: number };
}

export interface ProjectIn {
  id: string;
  data: { title: string; tagline: string; year: number; stack: string[]; order: number };
}

const STOP = new Set('the and for with only from via add app lab kit data devops delivery engine pipeline pipelines platform platforms template templates'.split(' '));

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize('NFKD')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !STOP.has(w)),
  );

/** Minimum summed IDF of the shared stack/title words before a project is attached to a case study. */
export const MATCH_MIN = 2.6;

const year = (ym: string | null) => (ym ? +ym.slice(0, 4) : new Date().getUTCFullYear());

/** The role a project was built under: the full-time role spanning its year, else the closest one. */
function roleFor(roles: Role[], y: number): number {
  let best = 0;
  let score = -Infinity;
  roles.forEach((r, i) => {
    const s = (y >= year(r.start) && y <= year(r.end) ? 100 : -Math.abs(y - year(r.end))) + (r.kind === 'full-time' ? 10 : 0) + year(r.start) / 1e4;
    if (s > score) [best, score] = [i, s];
  });
  return best;
}

export function buildEntities(experience: Role[], work: WorkIn[], projects: ProjectIn[]): Entity[] {
  const roles = [...experience].sort((a, b) => a.start.localeCompare(b.start));
  const cases = [...work].sort((a, b) => a.data.order - b.data.order);
  const repos = [...projects].sort((a, b) => a.data.order - b.data.order);

  const caseWords = cases.map((w) => words([w.data.title, ...w.data.stack].join(' ')));
  const repoWords = repos.map((p) => words([p.data.title, p.id, ...p.data.stack].join(' ')));
  const docs = [...caseWords, ...repoWords];
  // Words in more than a third of the corpus (GitHub Actions, Python, …) say nothing about kinship.
  const idf = (w: string) => {
    const df = docs.filter((d) => d.has(w)).length;
    return df * 3 > docs.length ? 0 : Math.log(docs.length / df);
  };

  const caseRole = cases.map((w) => {
    const i = roles.findIndex((r) => r.company === w.data.employer);
    return i < 0 ? roleFor(roles, new Date().getUTCFullYear()) : i;
  });

  // Each project hangs off the case study (from a role spanning its year) it shares the most distinctive stack with.
  const repoParent = repos.map((p, pi) => {
    let best = -1;
    let score = MATCH_MIN;
    caseWords.forEach((cw, ci) => {
      const r = roles[caseRole[ci]];
      if (p.data.year < year(r.start) || p.data.year > year(r.end)) return;
      let s = 0;
      for (const w of repoWords[pi]) if (cw.has(w)) s += idf(w);
      if (s > score) [best, score] = [ci, s];
    });
    return best >= 0 ? { c: best } : { r: roleFor(roles, p.data.year) };
  });

  // Depth-first order: role, its case studies (each followed by its projects), then its direct projects.
  // The layout sweeps this order clockwise, so the arc reads as a timeline.
  const out: Entity[] = [];
  roles.forEach((r, ri) => {
    const ro = out.length;
    const from = r.start.slice(0, 4);
    const to = r.end ? r.end.slice(0, 4) : 'now';
    out.push({
      k: 0,
      p: -1,
      key: `role/${r.id}`,
      title: `${r.company}, ${r.title.replace(/\s*\(.*\)$/, '')}`,
      meta: from === to ? from : `${from}–${to}`,
      href: '/experience/',
    });
    const addRepo = (p: ProjectIn, parent: number) =>
      out.push({ k: 2, p: parent, key: `repo/${p.id}`, title: p.data.tagline, meta: String(p.data.year), href: `/projects/${p.id}/` });
    cases.forEach((w, ci) => {
      if (caseRole[ci] !== ri) return;
      const co = out.length;
      out.push({ k: 1, p: ro, key: `case/${w.id}`, title: w.data.title, meta: w.data.client, href: `/work/${w.id}/` });
      repos.forEach((p, pi) => repoParent[pi].c === ci && addRepo(p, co));
    });
    repos.forEach((p, pi) => repoParent[pi].r === ri && addRepo(p, ro));
  });
  return out;
}
