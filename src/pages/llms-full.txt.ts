import type { APIRoute } from 'astro';
import { buildCorpus } from '../lib/corpus';

export const GET: APIRoute = async ({ site }) => {
  const { version, docs } = await buildCorpus();
  const out: string[] = [`# rakshithponnappa.dev: full text (corpus ${version})`, ''];
  let last = '';
  for (const d of docs) {
    const page = d.url.split('#')[0];
    if (page + d.title !== last) {
      out.push(`## ${d.title}`, `Source: ${new URL(page, site)}`, '');
      last = page + d.title;
    }
    if (d.section) out.push(`### ${d.section}`);
    out.push(d.text, '');
  }
  return new Response(out.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
