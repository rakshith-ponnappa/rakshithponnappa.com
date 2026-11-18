import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const metric = z.object({ value: z.string(), label: z.string() });

// Client engagements, written as postmortem/RFC-style case studies.
const work = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    client: z.string(),
    industry: z.string(),
    employer: z.string(),
    period: z.string(),
    role: z.string(),
    summary: z.string(),
    clouds: z.array(z.string()).default([]),
    stack: z.array(z.string()),
    metrics: z.array(metric).default([]),
    diagram: z.string().optional(),
    diagramAlt: z.string().optional(),
    repo: z.url().optional(),
    order: z.number(),
    featured: z.boolean().default(false),
  }),
});

// Open-source repositories, written as engineering deep-dives.
const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    repo: z.url(),
    tagline: z.string(),
    category: z.enum(['ai', 'platform', 'tools']),
    year: z.number(),
    status: z.enum(['active', 'archived']).default('active'),
    stack: z.array(z.string()),
    highlights: z.array(z.string()),
    metrics: z.array(metric).default([]),
    diagram: z.string().optional(),
    diagramAlt: z.string().optional(),
    order: z.number(),
  }),
});

export const collections = { work, projects };
