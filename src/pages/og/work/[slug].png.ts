import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { pngResponse, workCard } from '../../../lib/og';

export const prerender = true;

export const getStaticPaths = (async () => {
  const items = await getCollection('work');
  return items.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<'work'> }> = async ({ props }) =>
  pngResponse(await workCard(props.entry.data));
