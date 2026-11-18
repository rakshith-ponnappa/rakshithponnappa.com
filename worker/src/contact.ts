import { buildRawEmail } from './email';
import { createEmailMessage } from './email-message';
import type { Env } from './env';
import { clientIp, isAllowedOrigin, json, rateLimitKey, rateLimitOk, readJson, tooManyRequests } from './http';
import { verifyTurnstile } from './turnstile';
import { validateContact } from './validate';

export async function handleContact(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405, { Allow: 'POST' });
  if (!isAllowedOrigin(request)) return json({ ok: false, error: 'origin not allowed' }, 403);

  const ip = clientIp(request);
  if (!(await rateLimitOk(env.CONTACT_LIMITER ?? env.RATE_LIMITER, `contact:${rateLimitKey(ip)}`))) return tooManyRequests({ ok: false, error: 'rate limited' });

  const body = await readJson(request);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  const v = validateContact(body.value);
  if (!v.ok) return json({ ok: false, error: v.error }, 400);
  const { name, email, message, topic, turnstileToken } = v.value;

  if (!env.EMAIL) return json({ ok: false, error: 'email not configured', fallback: 'mailto' }, 503);

  if (env.TURNSTILE_SECRET) {
    if (!turnstileToken) return json({ ok: false, error: 'verification required' }, 403);
    if (!(await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, ip))) return json({ ok: false, error: 'verification failed' }, 403);
  }

  const raw = buildRawEmail({ from: env.CONTACT_FROM, to: env.CONTACT_TO, name, email, message, topic });
  try {
    await env.EMAIL.send(createEmailMessage(env.CONTACT_FROM, env.CONTACT_TO, raw));
  } catch (err) {
    console.error('send_email failed', String(err));
    return json({ ok: false, error: 'could not send message', fallback: 'mailto' }, 502);
  }
  return json({ ok: true });
}
