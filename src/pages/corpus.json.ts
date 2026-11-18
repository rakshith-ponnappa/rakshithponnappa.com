import type { APIRoute } from 'astro';
import { buildCorpus } from '../lib/corpus';

export const GET: APIRoute = async () => {
  const corpus = await buildCorpus();
  return new Response(JSON.stringify(corpus), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
