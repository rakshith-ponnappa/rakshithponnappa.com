// The guard's own detectors: each rule must catch a planted violation and pass the allowed look-alikes.
import { describe, expect, it } from 'vitest';
import { RULES } from './rules';

const rule = (id: string) => RULES.find((r) => r.id === id)!;
const cases: [string, string[], string[]][] = [
  ['meta-company', ['Worked with Meta on evals'], ['<meta name="x">', 'metadata', '@cf/meta/llama']],
  ['osworld', ['the OSWorld benchmark', 'OS-World'], ['agentic computer-use benchmark platform']],
  ['ipv4', ['host 10.0.12.7 was down', 'at 192.168.1.1.', '52.14.3.9'], ['version 1.2.3', '300.1.1.1', 'v4.164.0', 'route 0.0.0.0/0', 'IMDS 169.254.169.254', 'bind 127.0.0.1']],
  ['private-hostname', ['db01.corp', 'api.svc.cluster.local', 'vault.internal'], ['rakshithponnappa.com', 'local-rag-agent-platform', 'corporate']],
  ['email', ['mail jane.doe@example.com'], ['contact@rakshithponnappa.com', 'portrait@2x.png']],
  ['phone', ['+1 415 555 0100', '+44 20 7946 0958', '98450 12345'], ['+91 90354 00153', '+919035400153', '2019 2021 2023', '30,000 sites']],
  ['transition-framing', ['engineer moving into AI deployment', 'Heading towards Forward Deployed roles', 'now taking LLM systems to production'], ['Pipeline variables move into the pipeline', 'AI agent infrastructure', 'moving traffic to the new environment']],
  ['team-headcount', ['Lead 12 DevOps engineers', 'a team of 12', '12 engineers led', 'managed 8 people'], ['with one other engineer', '20 enterprise clients', 'guide the engineers who deliver them']],
  ['sandbox-vendor', ['ported to Gravix', 'migrated from E2B'], ['managed sandbox provider', 'e2e tests']],
  ['todo', ['TODO: fill in'], ['to-do list', 'todos']],
  ['lorem', ['Lorem ipsum'], ['loremaster']],
  ['crore', ['saved 2 crore', 'Crores'], ['core']],
  ['budget', ['under budget', 'Budgeting'], ['burn rate']],
  ['iitm-degree', ['M.S. (by Research), IIT Madras', 'IIT Madras – Master of Science', 'MS at IIT Madras'], ['B.E., IIT Madras', 'IIT Madras. ' + 'x'.repeat(41) + ' MS']],
];

describe('content rules detect violations and allow look-alikes', () => {
  it.each(cases)('%s', (id, bad, good) => {
    for (const b of bad) expect(rule(id).find(b), `should flag: ${b}`).not.toEqual([]);
    for (const g of good) expect(rule(id).find(g), `should allow: ${g}`).toEqual([]);
  });
});
