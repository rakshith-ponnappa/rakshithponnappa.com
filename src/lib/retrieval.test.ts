import { describe, expect, it } from 'vitest';
import corpus from '../../worker/test/fixtures/corpus.json';
import { buildIndex, REFUSAL_THRESHOLD, search, stem, tokenize } from './retrieval';

const index = buildIndex(corpus.docs);

describe('tokenize', () => {
  it('lowercases, strips accents/punctuation and stop words', () => {
    expect(tokenize('What is Résumé, and the CV?')).toEqual(['resume', 'resume']);
    expect(tokenize('the of and')).toEqual([]);
  });

  it('expands synonyms', () => {
    expect(tokenize('k8s')).toEqual(['kubernete']);
    expect(tokenize('IaC')).toEqual(['infrastructure', 'code', 'terraform']);
  });

  it('stems plurals and -ing but leaves short words and numbers', () => {
    expect(stem('pipelines')).toBe('pipeline');
    expect(stem('building')).toBe('build');
    expect(stem('k8s')).toBe('k8s');
    expect(stem('aks')).toBe('aks');
  });
});

describe('search', () => {
  it('returns nothing for empty or stop-word-only queries', () => {
    expect(search(index, '')).toEqual([]);
    expect(search(index, 'what is the')).toEqual([]);
  });

  it('ranks the obviously relevant chunk first, with title boost', () => {
    const hits = search(index, 'How does TalentLens screen resumes?', 3);
    expect(hits[0].doc.id).toBe('talentlens-0');
    expect(hits[0].score).toBeGreaterThanOrEqual(REFUSAL_THRESHOLD);
  });

  it('uses synonyms so k8s finds Kubernetes content', () => {
    const ids = search(index, 'k8s jenkins agents', 6).map((h) => h.doc.id);
    expect(ids[0]).toBe('jenkins-0');
  });

  it('respects k and sorts by descending score', () => {
    const hits = search(index, 'kubernetes terraform azure pipelines', 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
  });

  it('scores off-topic questions below the refusal threshold', () => {
    const hits = search(index, 'favourite pizza topping', 6);
    expect(hits.length === 0 || hits[0].score < REFUSAL_THRESHOLD).toBe(true);
  });
});
