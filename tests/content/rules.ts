// Content and confidentiality rules (AGENTS.md "Content rules"). Each rule returns the offending matches in a
// text; tests/content/guard.test.ts runs them over src/content/**, src/data/** and the built HTML.
export const OWNER_EMAIL = 'contact@rakshithponnappa.dev';
/** Digits of the one public phone number, +91 90354 00153 (with and without the country code). */
const OWNER_PHONE = ['919035400153', '9035400153'];

export type Rule = { id: string; describe: string; find: (text: string) => string[] };

const all = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m[0]);

const isIPv4 = (s: string) => s.split('.').every((o) => Number(o) <= 255 && !/^0\d/.test(o));
/**
 * Generic technical constants that identify no host: the default route / any-address, loopback and the cloud
 * instance-metadata endpoint (used in security write-ups). Anything else, including RFC 1918 ranges, fails.
 */
export const WELL_KNOWN_IPV4 = new Set(['0.0.0.0', '127.0.0.1', '169.254.169.254']);
// Files that look like user@host.tld but are image/asset names (e.g. portrait@2x.png).
const ASSET_EXT = /\.(png|jpe?g|webp|avif|gif|svg|ico|css|js|mjs|woff2?|ttf|json|xml|pdf|txt|map)$/i;

export const RULES: Rule[] = [
  { id: 'meta-company', describe: '"Meta" named as a company', find: (t) => all(/\bMeta\b(?![-_]?\w*[=:])/g, t) },
  { id: 'osworld', describe: '"OSWorld"', find: (t) => all(/os\s*-?\s*world/gi, t) },
  {
    id: 'ipv4',
    describe: 'IPv4 address',
    find: (t) => all(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.]*\d)/g, t).filter((ip) => isIPv4(ip) && !WELL_KNOWN_IPV4.has(ip)),
  },
  {
    id: 'private-hostname',
    describe: 'private hostname (*.internal, *.local, *.corp)',
    find: (t) => all(/\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:internal|local|corp)\b(?![-.]?\w)/gi, t),
  },
  {
    id: 'email',
    describe: `email address other than ${OWNER_EMAIL}`,
    find: (t) =>
      all(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi, t).filter((e) => e.toLowerCase() !== OWNER_EMAIL && !ASSET_EXT.test(e)),
  },
  {
    id: 'phone',
    describe: 'phone number other than +91 90354 00153',
    find: (t) =>
      all(/(?<![\w./#-])(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]){1,4}\d{3,5}(?![\w/-])|(?<![\w./#-])\+\d{10,13}(?!\w)/g, t).filter((m) => {
        const d = m.replace(/\D/g, '');
        if (d.length < 10 || d.length > 13 || OWNER_PHONE.includes(d)) return false;
        // Year ranges, dates and plain counts ("2019 2023 2024", "30 000 000") are not phone numbers.
        if (!m.startsWith('+') && !/^\d{5}[\s.-]?\d{5}$/.test(m.trim()) && !/\(\d+\)/.test(m)) return false;
        return true;
      }),
  },
  // Positioning (owner's instruction): AI is current work, not a destination, and leadership is not a head-count.
  {
    id: 'transition-framing',
    describe: '"moving into / heading towards / now taking" AI-style transition framing',
    find: (t) => [
      ...all(/\b(?:moving|move|transition(?:ing)?|pivot(?:ing)?|heading|breaking)\s+(?:in)?to(?:wards)?\s+(?:AI|LLM|ML|forward[- ]deployed|AI[- ]platform)\b/gi, t),
      ...all(/\bnow\s+tak(?:e|es|ing)\s+(?:LLM|AI|agent)/gi, t),
    ],
  },
  {
    id: 'team-headcount',
    describe: 'team head-count ("12 engineers led", "team of 12")',
    find: (t) => all(/\b(?:team of|lead(?:s|ing)?|led|manag(?:e|es|ed|ing))\s+(?:a team of\s+)?\d+\s+(?:\w+\s+)?(?:engineers|people|reports)\b|\bteam of \d+\b|\b\d+\s+engineers\s+led\b/gi, t),
  },
  { id: 'sandbox-vendor', describe: 'sandbox vendor named (client confidentiality)', find: (t) => all(/\b(?:gravix\w*|e2b)\b/gi, t) },
  { id: 'todo', describe: '"TODO"', find: (t) => all(/\bTODO\b/g, t) },
  { id: 'lorem', describe: '"lorem"', find: (t) => all(/\blorem\b/gi, t) },
  { id: 'crore', describe: '"crore"', find: (t) => all(/\bcrores?\b/gi, t) },
  { id: 'budget', describe: '"budget"', find: (t) => all(/\bbudget\w*/gi, t) },
  {
    id: 'iitm-degree',
    describe: '"M.S."/"MS"/"master" within 40 characters of "IIT Madras"',
    find: (t) => {
      const deg = String.raw`(?:M\.\s?S\.?|\bMS\b|[Mm]aster)`;
      return all(new RegExp(String.raw`${deg}[^]{0,40}?IIT\s+Madras|IIT\s+Madras[^]{0,40}?${deg}`, 'g'), t);
    },
  },
];

/** Visible text + attribute values + JSON-LD of an HTML page; drops CSS, inline SVG geometry and JS bundles. */
export function htmlToScannable(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/\s(?:d|points|viewBox|transform|integrity|srcset|sizes|style|class|data-astro-cid-[\w-]*)="[^"]*"/gi, ' ')
    .replace(/<meta\b/gi, '<x')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, ' ');
}
