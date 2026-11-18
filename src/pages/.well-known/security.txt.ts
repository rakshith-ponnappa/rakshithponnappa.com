import type { APIRoute } from 'astro';
import { profile } from '../../data/profile';

export const GET: APIRoute = () => {
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const body = [
    `Contact: mailto:${profile.email}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${profile.site}/.well-known/security.txt`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
