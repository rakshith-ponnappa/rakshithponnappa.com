// Input normalisation and validation for /api/ask and /api/contact.

// C0/C1 controls except \t \n \r, plus zero-width and bidi-override characters (used to hide instructions).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** Single line: drop control chars, fold all whitespace (incl. CR/LF/tab) to one space, trim. */
export function cleanLine(input: string): string {
  return input.normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim();
}

/** Multi-line text: drop control chars, normalise line endings to \n, trim. */
export function cleanText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/\t/g, ' ')
    .trim();
}

export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 400;

export function validateQuestion(body: Record<string, unknown>): Valid<string> {
  if (typeof body.question !== 'string') return { ok: false, error: 'question is required' };
  const q = cleanLine(body.question);
  if (q.length < QUESTION_MIN) return { ok: false, error: `question must be at least ${QUESTION_MIN} characters` };
  if (q.length > QUESTION_MAX) return { ok: false, error: `question must be at most ${QUESTION_MAX} characters` };
  return { ok: true, value: q };
}

export const CONTACT_TOPICS = ['Hiring', 'Consulting', 'Collaboration', 'Other'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export type ContactInput = { name: string; email: string; message: string; topic?: ContactTopic; turnstileToken?: string };

export const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export function validateContact(body: Record<string, unknown>): Valid<ContactInput> {
  const { name, email, message, topic, turnstileToken } = body;
  if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string')
    return { ok: false, error: 'name, email and message are required' };
  const n = cleanLine(name);
  const e = cleanLine(email);
  const m = cleanText(message);
  if (!n) return { ok: false, error: 'name is required' };
  if (n.length > 80) return { ok: false, error: 'name must be at most 80 characters' };
  if (e.length > 254 || !EMAIL_RE.test(e)) return { ok: false, error: 'a valid email is required' };
  if (m.length < 10) return { ok: false, error: 'message must be at least 10 characters' };
  if (m.length > 2000) return { ok: false, error: 'message must be at most 2000 characters' };
  if (turnstileToken !== undefined && turnstileToken !== null && typeof turnstileToken !== 'string')
    return { ok: false, error: 'invalid turnstile token' };
  if (topic !== undefined && topic !== null && !(CONTACT_TOPICS as readonly unknown[]).includes(topic))
    return { ok: false, error: `topic must be one of ${CONTACT_TOPICS.join(', ')}` };
  const token = typeof turnstileToken === 'string' && turnstileToken ? turnstileToken.slice(0, 2048) : undefined;
  return { ok: true, value: { name: n, email: e, message: m, topic: (topic ?? undefined) as ContactTopic | undefined, turnstileToken: token } };
}
