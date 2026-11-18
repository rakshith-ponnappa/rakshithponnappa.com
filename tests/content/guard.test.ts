// Content and confidentiality guard: fails on anything AGENTS.md forbids, in the sources (src/content/**,
// src/data/**) and in the built HTML (<build>/**/*.html), with file:line for every hit.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILD, ROOT, builtHtmlPages, walk } from '../support/site';
import { htmlToScannable, RULES } from './rules';

type Source = { name: string; text: string };

const sources: Source[] = [
  ...walk(join(ROOT, 'src/content')),
  ...walk(join(ROOT, 'src/data')),
].map((f) => ({ name: relative(ROOT, f), text: readFileSync(f, 'utf8') }));
const built: Source[] = builtHtmlPages().map(({ file }) => ({ name: relative(ROOT, file), text: htmlToScannable(readFileSync(file, 'utf8')) }));

function scan(files: Source[], rule: (typeof RULES)[number]) {
  const hits: string[] = [];
  for (const { name, text } of files) {
    for (const m of new Set(rule.find(text))) {
      const line = text.slice(0, text.indexOf(m)).split('\n').length;
      hits.push(`${name}:${line}: ${m.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }
  return hits;
}

describe('content guard: sources (src/content/**, src/data/**)', () => {
  it('found the sources', () => expect(sources.length).toBeGreaterThan(10));
  it.each(RULES.map((r) => [r.describe, r] as const))('no %s', (_d, rule) => {
    expect(scan(sources, rule)).toEqual([]);
  });
});

describe(`content guard: built HTML (${relative(ROOT, BUILD)})`, () => {
  it('found the built pages', () => expect(built.length).toBeGreaterThan(10));
  it.each(RULES.map((r) => [r.describe, r] as const))('no %s', (_d, rule) => {
    expect(scan(built, rule)).toEqual([]);
  });
});
