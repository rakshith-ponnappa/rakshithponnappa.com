// Ops perspective: the delivery pipeline itself. These guard the properties docs/PIPELINE.md promises, so a
// workflow edit can't quietly ship untested code, skip the smoke test or lose the automatic rollback.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { ROOT } from '../support/site';

type Step = { name?: string; id?: string; if?: string; run?: string; uses?: string; with?: Record<string, unknown> };
type Job = { needs?: string | string[]; if?: string; environment?: { name: string }; concurrency?: { group: string; 'cancel-in-progress'?: boolean }; steps: Step[] };
const load = (f: string) => YAML.parse(readFileSync(join(ROOT, '.github/workflows', f), 'utf8')) as { on: Record<string, unknown>; permissions?: Record<string, string>; jobs: Record<string, Job> };

const ci = load('ci.yml');
const deploy = ci.jobs.deploy;
const runs = (job: Job) => job.steps.map((s) => s.run ?? '').join('\n');

describe('CI/CD workflow', () => {
  it('runs on every push and pull request with read-only default permissions', () => {
    expect(Object.keys(ci.on)).toEqual(expect.arrayContaining(['push', 'pull_request']));
    expect(ci.permissions).toEqual({ contents: 'read' });
  });

  it('builds once and runs every suite against that build', () => {
    const r = runs(ci.jobs.test);
    for (const cmd of ['npm run build', 'npm run pdf', 'npm run test:ai', 'npm run test:content', 'npm run test:design', 'npm run test:ops', 'npm run test:e2e']) expect(r).toContain(cmd);
  });

  it('deploys only from main, only after tests and the secret scan pass, one deploy at a time', () => {
    expect([deploy.needs].flat().sort()).toEqual(['gitleaks', 'test']);
    expect(deploy.if).toContain("github.ref == 'refs/heads/main'");
    expect(deploy.if).toContain("github.event_name == 'push'");
    expect(deploy.environment?.name).toBe('production');
    expect(deploy.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it('deploys the tested artifact instead of rebuilding', () => {
    expect(deploy.steps.some((s) => s.uses?.startsWith('actions/download-artifact') && s.with?.name === 'site-dist')).toBe(true);
    expect(runs(deploy)).not.toMatch(/npm run build|astro build/);
  });

  it('smoke-tests the live site for the deployed commit and rolls back on failure', () => {
    const smoke = deploy.steps.find((s) => s.id === 'smoke')!;
    expect(smoke.run).toMatch(/scripts\/smoke\.mjs .*--sha/);
    const rollback = deploy.steps.find((s) => /wrangler rollback/.test(s.run ?? ''))!;
    expect(rollback.if).toContain("steps.smoke.outcome == 'failure'");
    expect(rollback.run).toContain('steps.prev.outputs.version');
    expect(deploy.steps.findIndex((s) => s.id === 'prev')).toBeLessThan(deploy.steps.findIndex((s) => /wrangler deploy --message/.test(s.run ?? '')));
  });
});

describe('live monitor workflow', () => {
  const mon = load('monitor.yml');
  it('smoke-tests production on a schedule and manages an incident issue', () => {
    expect(mon.on).toHaveProperty('schedule');
    expect(mon.permissions).toEqual({ contents: 'read', issues: 'write' });
    const r = runs(mon.jobs.smoke);
    expect(r).toContain('scripts/smoke.mjs https://rakshithponnappa.com');
    expect(r).toContain('gh issue create');
    expect(r).toContain('gh issue close');
  });
});
