import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { pngResponse, projectCard } from '../../../lib/og';

export const prerender = true;

export const getStaticPaths = (async () => {
  const items = await getCollection('projects');
  return items.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<'projects'> }> = async ({ props }) =>
  pngResponse(await projectCard(props.entry.data));
