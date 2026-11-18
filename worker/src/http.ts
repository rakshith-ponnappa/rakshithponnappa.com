export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

const API_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...API_HEADERS, ...extra },
  });
}

// The canonical site, plus the former .dev origin so pages loaded before the move can still call the API.
const ALLOWED_ORIGINS = new Set(['https://rakshithponnappa.com', 'https://www.rakshithponnappa.com', 'https://rakshithponnappa.dev', 'https://www.rakshithponnappa.dev']);
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

/**
 * Same-origin, the production domains, or http://localhost:* — the latter only while the Worker itself is
 * served from localhost (wrangler dev), so production never trusts a localhost origin. A missing Origin is rejected.
 */
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  const self = new URL(request.url);
  if (origin === self.origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return LOCAL_HOSTNAMES.has(self.hostname) && LOCALHOST.test(origin);
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** Expands an IPv6 address to its eight 16-bit groups; null if it is not plain IPv6. */
function ipv6Groups(ip: string): string[] | null {
  const addr = ip.split('%')[0].toLowerCase();
  if (!addr.includes(':') || addr.includes('.')) return null;
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0) return null;
  const groups = [...left, ...Array<string>(fill).fill('0'), ...right];
  return groups.length === 8 && groups.every((g) => /^[0-9a-f]{1,4}$/.test(g)) ? groups : null;
}

/**
 * Rate-limit bucket for a client IP. IPv6 clients usually control a whole /64, so per-address keys would
 * let one client rotate through addresses; bucket IPv6 on its /64 prefix instead. IPv4 is keyed as-is.
 */
export function rateLimitKey(ip: string): string {
  const g = ipv6Groups(ip);
  return g ? `${g.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':')}::/64` : ip;
}

/** true when the request may proceed. Fails open if the binding is absent or errors (logged). */
export async function rateLimitOk(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch (err) {
    console.warn('rate limiter error', String(err));
    return true;
  }
}

export const RETRY_AFTER_SECONDS = 60;

export function tooManyRequests(body: Record<string, unknown>): Response {
  return json(body, 429, { 'Retry-After': String(RETRY_AFTER_SECONDS) });
}

const MAX_BODY_BYTES = 8 * 1024;

export type JsonResult = { ok: true; value: Record<string, unknown> } | { ok: false; status: number; error: string };

/** Reads at most `max` bytes of the body; null when it is larger (stops reading, so chunked bodies can't exhaust memory). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

export async function readJson(request: Request): Promise<JsonResult> {
  const ct = request.headers.get('Content-Type') ?? '';
  if (!ct.toLowerCase().includes('application/json')) return { ok: false, status: 415, error: 'expected application/json' };
  const len = Number(request.headers.get('Content-Length') ?? 0);
  if (len > MAX_BODY_BYTES) return { ok: false, status: 413, error: 'request too large' };
  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === null) return { ok: false, status: 413, error: 'request too large' };
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, status: 400, error: 'invalid JSON body' };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON body' };
  }
}
