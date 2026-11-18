import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { profile, experience, education, courses, certifications, skills } from '../data/profile';

// JSON Resume (https://jsonresume.org/schema) generated from the same source as every other view.
export const GET: APIRoute = async () => {
  const projects = (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
  const resume = {
    $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: {
      name: profile.fullName,
      label: profile.headline,
      email: profile.email,
      phone: profile.phone,
      url: profile.site,
      summary: profile.pitch,
      location: { city: 'Bengaluru', countryCode: 'IN' },
      profiles: [
        { network: 'GitHub', username: 'rakshith-ponnappa', url: profile.github },
        { network: 'LinkedIn', username: 'rakshith-siragaje-ponnappa-60809355', url: profile.linkedin },
      ],
    },
    work: [...experience]
      .sort((a, b) => (b.end ?? '9999').localeCompare(a.end ?? '9999') || Number(a.kind !== 'full-time') - Number(b.kind !== 'full-time') || b.start.localeCompare(a.start))
      .map((r) => ({
        name: r.company,
        position: r.title,
        location: r.location,
        startDate: r.start,
        ...(r.end && { endDate: r.end }),
        summary: r.summary,
        highlights: r.bullets,
      })),
    education: education.map((e) => ({ institution: e.school, studyType: e.degree, endDate: e.year.slice(-4) })),
    certificates: [
      ...certifications.map((c) => ({ name: c.code ? `${c.name} (${c.code})` : c.name, issuer: c.issuer })),
      ...courses.map((c) => ({ name: `${c.name} (course)`, issuer: c.provider, date: c.year })),
    ],
    skills: skills.map((s) => ({ name: s.area, keywords: s.items })),
    projects: projects.map((p) => ({ name: p.data.title, description: p.data.tagline, url: p.data.repo, keywords: p.data.stack })),
    meta: { canonical: `${profile.site}/resume.json`, lastModified: new Date().toISOString() },
  };
  return new Response(JSON.stringify(resume, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
