import { DEFAULT_MODEL, handleAsk } from './ask';
import { handleContact } from './contact';
import { loadCorpus } from './corpus';
import type { Env } from './env';
import { json, withSecurityHeaders } from './http';

async function handleHealth(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method not allowed' }, 405, { Allow: 'GET, HEAD' });
  let corpusVersion: string | null = null;
  try {
    corpusVersion = (await loadCorpus(env, request.url)).version;
  } catch {
    /* reported as null */
  }
  return json({ status: 'ok', model: env.AI_MODEL || DEFAULT_MODEL, corpusVersion });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      switch (pathname) {
        case '/api/health':
          return await handleHealth(request, env);
        case '/api/ask':
          return await handleAsk(request, env);
        case '/api/contact':
          return await handleContact(request, env);
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (err) {
      console.error('unhandled error', String(err));
      return json({ error: 'internal error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
