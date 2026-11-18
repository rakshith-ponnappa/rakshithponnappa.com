// Ops perspective: secret scan of the working tree (not git history) with tests/ops/gitleaks.toml, which
// keeps the default rules and skips node_modules, dist, .build*, test-results and other scratch output.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESULTS, ROOT } from '../support/site';

const bin = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
const available = bin.status === 0;

describe.skipIf(!available)('gitleaks (working tree)', () => {
  it('finds zero leaks', () => {
    const report = join(RESULTS, 'gitleaks.json');
    const r = spawnSync(
      'timeout',
      ['120', 'gitleaks', 'detect', '--no-git', '--source', '.', '--redact', '--config', 'tests/ops/gitleaks.toml', '--report-format', 'json', '--report-path', report, '--exit-code', '1'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const findings = JSON.parse(readFileSync(report, 'utf8')) as { RuleID: string; File: string; StartLine: number }[];
    expect(findings.map((f) => `${f.RuleID} ${f.File}:${f.StartLine}`)).toEqual([]);
    expect(r.status, r.stderr).toBe(0);
  }, 130_000);
});

if (!available) console.warn('[gitleaks] binary not found; install gitleaks (brew install gitleaks) to run the local scan. CI uses gitleaks-action.');
