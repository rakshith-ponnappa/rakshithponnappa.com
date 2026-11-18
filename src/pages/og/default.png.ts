import type { APIRoute } from 'astro';
import { defaultCard, pngResponse } from '../../lib/og';

export const prerender = true;

export const GET: APIRoute = async () => pngResponse(await defaultCard());
