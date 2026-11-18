// The only module that imports the Workers runtime email API, so tests can mock it with vi.mock().
import { EmailMessage } from 'cloudflare:email';

export function createEmailMessage(from: string, to: string, raw: string): EmailMessage {
  return new EmailMessage(from, to, raw);
}
