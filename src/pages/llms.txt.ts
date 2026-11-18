import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { profile, experience, education, courses, certifications, fmtMonth } from '../data/profile';

export const GET: APIRoute = async ({ site }) => {
  const abs = (p: string) => new URL(p, site).toString();
  const work = (await getCollection('work')).sort((a, b) => a.data.order - b.data.order);
  const projects = (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
  const lines = [
    `# ${profile.name} (${profile.fullName})`,
    '',
    `> ${profile.headline}: ${profile.tagline}. ${profile.pitch}`,
    '',
    `Based in ${profile.location}. Contact: ${profile.email}, ${profile.phone}. Open to: ${profile.openTo}.`,
    '',
    // Key facts as intro paragraphs (llms.txt keeps H2 sections for link lists only).
    ...(() => {
      const now = experience.find((r) => r.end === null)!;
      return [
        `Current role: ${now.title} at ${now.company}, since ${fmtMonth(now.start)}. "${profile.headline}" is how he describes the level of the work.`,
        `Career: ${experience.length} roles since ${fmtMonth(profile.careerStart.slice(0, 7))}: ${[...experience].sort((a, b) => b.start.localeCompare(a.start)).map((r) => `${r.company} (${fmtMonth(r.start)}–${fmtMonth(r.end)})`).join(', ')}.`,
        `Education: ${education.map((e) => `${e.degree}, ${e.school} (${e.year})`).join('; ')}. Additional course (not a degree): ${courses.map((c) => `${c.name}, ${c.provider} (${c.year})`).join('; ')}.`,
        `Certifications (${certifications.length}): ${certifications.filter((c) => c.featured).map((c) => `${c.issuer} ${c.name}${c.code ? ` (${c.code})` : ''}`).join('; ')}, and more on /credentials/.`,
      ].flatMap((l) => [l, '']);
    })(),
    '',
    '## Case studies (start with the first one)',
    ...work.map((w) => `- [${w.data.title}](${abs(`/work/${w.id}/`)}): ${w.data.client}. ${w.data.summary}`),
    '',
    '## Open-source projects',
    ...projects.map((p) => `- [${p.data.title}](${abs(`/projects/${p.id}/`)}): ${p.data.tagline} Code: ${p.data.repo}`),
    '',
    '## Profile',
    `- [Experience](${abs('/experience/')}): roles since August 2014, rendered as a trace`,
    `- [Credentials](${abs('/credentials/')}): certifications and education`,
    `- [Résumé (HTML)](${abs('/resume/')}) · [PDF](${abs(profile.resumePdf)}) · [JSON Resume](${abs('/resume.json')})`,
    `- [Contact](${abs('/contact/')})`,
    '',
    '## Optional',
    `- [Full text of this site](${abs('/llms-full.txt')})`,
    `- [Retrieval corpus](${abs('/corpus.json')})`,
    `- [Assistant evals](${abs('/evals/')})`,
    `- [GitHub](${profile.github}) · [LinkedIn](${profile.linkedin})`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
