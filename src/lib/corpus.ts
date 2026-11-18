// Builds the retrieval corpus from the content collections and profile data.
// Feeds /corpus.json (Worker + browser fallback), /llms-full.txt and the build-time evals.
import { createHash } from 'node:crypto';
import { getCollection } from 'astro:content';
import GithubSlugger from 'github-slugger';
import { profile, experience, certifications, education, courses, skills, fieldDeployments, fmtMonth, highlights } from '../data/profile';
import type { Doc } from './retrieval';

const MAX_WORDS = 220;
const MIN_WORDS = 60;

export function stripMarkdown(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^import .*$/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')
    .replace(/\|/g, ' ')
    // Strip emphasis/code/heading markers but keep single underscores (identifiers like jd_analysis.py).
    .replace(/\*\*|__|[*`>#]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// Split long text on sentence boundaries into ~MAX_WORDS chunks; merge a short tail.
function chunk(text: string): string[] {
  // Split only where punctuation is followed by whitespace, so decimals (0.357) and filenames survive.
  const sentences = text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let cur: string[] = [];
  let n = 0;
  for (const s of sentences) {
    const w = s.trim().split(/\s+/).length;
    if (n + w > MAX_WORDS && n > 0) {
      out.push(cur.join(' ').trim());
      cur = [];
      n = 0;
    }
    cur.push(s.trim());
    n += w;
  }
  if (cur.length) {
    const tail = cur.join(' ').trim();
    if (out.length && n < MIN_WORDS) out[out.length - 1] += ' ' + tail;
    else out.push(tail);
  }
  return out.filter(Boolean);
}

function sections(body: string) {
  const parts: { heading: string; text: string }[] = [];
  let heading = 'Overview';
  let buf: string[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      if (buf.join('').trim()) parts.push({ heading, text: buf.join('\n') });
      heading = m[1].trim();
      buf = [];
    } else buf.push(line);
  }
  if (buf.join('').trim()) parts.push({ heading, text: buf.join('\n') });
  return parts;
}

function fromArticle(kind: 'work' | 'projects', id: string, title: string, head: string, body: string): Doc[] {
  const base = `/${kind}/${id}/`;
  const docs: Doc[] = [{ id: `${kind}/${id}`, title, url: base, section: 'Summary', text: head }];
  const slugger = new GithubSlugger();
  for (const s of sections(body)) {
    const anchor = slugger.slug(s.heading);
    chunk(stripMarkdown(s.text)).forEach((text, i) =>
      docs.push({ id: `${kind}/${id}#${anchor}${i ? `-${i + 1}` : ''}`, title, url: `${base}#${anchor}`, section: s.heading, text }),
    );
  }
  return docs;
}

export async function buildCorpus() {
  const docs: Doc[] = [];
  const work = (await getCollection('work')).sort((a, b) => a.data.order - b.data.order);
  const projects = (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);

  docs.push({
    id: 'profile/summary',
    title: `${profile.name}: ${profile.headline}`,
    url: '/',
    section: 'Summary',
    text: `${profile.fullName} (${profile.name}) is a ${profile.headline} based in ${profile.location}, focused on ${profile.tagline}. ${profile.pitch} Career started in August 2014. At a glance: ${highlights.map((h) => `${h.value} ${h.label}`).join('; ')}. Open to: ${profile.openTo}.`,
  });
  docs.push({
    id: 'profile/contact',
    title: 'Contact',
    url: '/contact/',
    section: 'Contact',
    text: `You can contact ${profile.name} by email at ${profile.email} or by phone on ${profile.phone}. LinkedIn: ${profile.linkedin}. GitHub: ${profile.github}. He is based in ${profile.location} (IST), and the Open a ticket form on the contact page reaches him directly. The résumé PDF is at ${profile.site}${profile.resumePdf}.`,
  });
  for (const r of experience) {
    docs.push({
      id: `profile/experience/${r.id}`,
      title: `${r.title} at ${r.company}`,
      url: '/experience/',
      section: 'Experience',
      text: `${r.company}: ${r.title}, ${fmtMonth(r.start)} to ${fmtMonth(r.end)} (${r.kind}), ${r.location}. ${r.summary} ${r.bullets.join(' ')} Clients and workstreams: ${r.clients.map((c) => c.label + (c.detail ? ` (${c.detail})` : '')).join(', ')}.`,
    });
  }
  docs.push({
    id: 'profile/certifications',
    title: 'Certifications',
    url: '/credentials/',
    section: 'Certifications',
    text: `${profile.name} holds ${certifications.length} certifications: ${certifications.map((c) => `${c.issuer} ${c.name}${c.code ? ` (${c.code})` : ''}`).join('; ')}.`,
  });
  docs.push({
    id: 'profile/education',
    title: 'Education',
    url: '/credentials/',
    section: 'Education',
    text: `Education and degrees: ${education.map((e) => `${e.degree}, ${e.school}, ${e.year}`).join('; ')}. He studied at Bharathidasan University (MCA) and CMR Institute of Management Studies (BCA). Additional coursework (a course, not a degree): ${courses.map((c) => `${c.name}, ${c.provider}, ${c.year}`).join('; ')}.`,
  });
  // One chunk per skill area keeps each area retrievable (a single long skills chunk dilutes BM25).
  const areaSlugger = new GithubSlugger();
  for (const s of skills) {
    docs.push({
      id: `profile/skills/${areaSlugger.slug(s.area)}`,
      title: `Skills: ${s.area}`,
      url: '/experience/#skills-title',
      section: s.area,
      text: `${s.area} skills and tools ${profile.name} has worked with and used in production: ${s.items.join(', ')}.${s.area === 'Cloud' ? ` He has worked on four clouds (Azure, AWS, Google Cloud and Huawei Cloud) plus VMware Tanzu and OpenShift platforms.` : ''}`,
    });
  }
  docs.push({
    id: 'profile/field',
    title: 'Field deployments',
    url: '/experience/#field-title',
    section: 'Field deployments',
    text: `On-site field deployments and locations: ${fieldDeployments.map((f) => `${f.city}, ${f.country}: ${f.years}, ${f.clients}`).join('. ')}. Four years on the ground in the Gulf (Dubai, UAE and Muscat, Oman) with Ozone.`,
  });

  for (const w of work) {
    const d = w.data;
    const head = `${d.client}: ${d.summary} ${d.title}. Client: ${d.client} (${d.industry}), ${d.employer === 'Freelance' ? 'as a freelance engagement' : `delivered via ${d.employer}`}, ${d.period}. Role: ${d.role}. ${d.metrics.map((m) => `${m.value} ${m.label}`).join('; ')}. Stack: ${d.stack.join(', ')}.`;
    docs.push(...fromArticle('work', w.id, d.title, head, w.body ?? ''));
  }
  for (const p of projects) {
    const d = p.data;
    const head = `${d.title}: ${d.tagline} ${d.highlights.join(' ')} ${d.metrics.map((m) => `${m.value} ${m.label}`).join('; ')}. Project: open-source ${d.category}, ${d.year}, ${d.status}. Stack: ${d.stack.join(', ')}. Code: ${d.repo}`;
    docs.push(...fromArticle('projects', p.id, d.title, head, p.body ?? ''));
  }

  const version = createHash('sha256').update(JSON.stringify(docs)).digest('hex').slice(0, 12);
  return { version, docs };
}
