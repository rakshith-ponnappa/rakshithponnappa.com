// The alias-host Worker: every alias must land on the canonical origin with the same path and query.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import redirect from '../www-redirect/index';

const ALIASES = ['rakshithponnappa.dev', 'www.rakshithponnappa.dev', 'www.rakshithponnappa.com'];

describe('alias redirect Worker', () => {
  it.each(ALIASES)('%s → https://rakshithponnappa.com with path and query kept (301)', (host) => {
    const res = redirect.fetch(new Request(`http://${host}/work/state-street-azure-landing-zone-dr/?utm_source=card`));
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://rakshithponnappa.com/work/state-street-azure-landing-zone-dr/?utm_source=card');
  });

  it('is routed on every alias host as a custom domain', () => {
    const cfg = readFileSync(new URL('../www-redirect/wrangler.jsonc', import.meta.url), 'utf8');
    for (const host of ALIASES) expect(cfg).toContain(`{ "pattern": "${host}", "custom_domain": true }`);
  });
});
