const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const SITEVERIFY_TIMEOUT_MS = 5_000;

/** Server-side Turnstile check. Any network/parse failure or timeout counts as "not verified". */
export async function verifyTurnstile(secret: string, token: string, ip?: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip && ip !== 'unknown') form.append('remoteip', ip);
  try {
    const res = await fetcher(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success !== true) console.warn('turnstile rejected', (data['error-codes'] ?? []).join(','));
    return data.success === true;
  } catch (err) {
    console.warn('turnstile verify failed', String(err));
    return false;
  }
}
