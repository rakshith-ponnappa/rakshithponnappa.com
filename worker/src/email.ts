// Minimal RFC 5322 message builder for the contact form (text/plain, UTF-8, base64 body).

export type ContactEmail = {
  from: string;
  to: string;
  name: string;
  email: string;
  message: string;
  topic?: string;
  date?: Date;
  messageId?: string;
};

/** Header values must never contain CR/LF (header injection) or other control characters. */
export function headerSafe(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// 45 UTF-8 bytes -> 60 base64 chars, + 12 for "=?UTF-8?B?" and "?=" = 72, inside RFC 2047's 75-char limit.
const WORD_BYTES = 45;

/**
 * RFC 2047 encoded-words for non-ASCII header text. Long text is split on code-point boundaries into
 * several space-separated words of at most 75 characters each; decoders join adjacent words.
 */
export function encodeWord(s: string): string {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const enc = new TextEncoder();
  const words: string[] = [];
  let cur = '';
  for (const ch of s) {
    if (cur && enc.encode(cur + ch).length > WORD_BYTES) {
      words.push(cur);
      cur = '';
    }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${toBase64(w)}?=`).join(' ');
}

function displayName(name: string): string {
  const safe = headerSafe(name);
  if (!/^[\x20-\x7E]*$/.test(safe)) return encodeWord(safe);
  return `"${safe.replace(/[\\"]/g, '\\$&')}"`;
}

function addr(email: string): string {
  return headerSafe(email).replace(/[<>\s]/g, '');
}

function domainOf(email: string): string {
  return addr(email).split('@')[1] || 'localhost';
}

export function buildRawEmail(m: ContactEmail): string {
  const date = m.date ?? new Date();
  const id = m.messageId ?? `<${crypto.randomUUID()}@${domainOf(m.from)}>`;
  const name = headerSafe(m.name);
  const topic = m.topic ? headerSafe(m.topic) : '';
  const subject = encodeWord(headerSafe(`${topic ? `[${topic}] ` : ''}Portfolio contact from ${name}`).slice(0, 150));
  const body = [`Name: ${name}`, `Email: ${addr(m.email)}`, ...(topic ? [`Topic: ${topic}`] : []), '', m.message.replace(/\r\n?/g, '\n')].join('\n').replace(/\n/g, '\r\n');
  const b64 = toBase64(body).replace(/.{1,76}/g, '$&\r\n').trimEnd();
  const headers = [
    `From: "Portfolio contact form" <${addr(m.from)}>`,
    `To: <${addr(m.to)}>`,
    `Reply-To: ${displayName(name)} <${addr(m.email)}>`,
    `Subject: ${subject}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${headerSafe(id)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${b64}\r\n`;
}
