import type { APIRoute } from 'astro';
import { pngResponse, portraitJpeg } from '../../lib/og';

export const prerender = true;

// 800×800 square used as JSON-LD Person.image.
export const GET: APIRoute = async () => pngResponse(await portraitJpeg(800), 'image/jpeg');
