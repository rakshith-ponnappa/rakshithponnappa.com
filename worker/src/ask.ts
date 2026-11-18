import { isAnswerable, search, type Hit, type Index } from '../../src/lib/retrieval';
import { loadCorpus } from './corpus';
import type { Env } from './env';
import { looksLikeInjection } from './guard';
import { clientIp, isAllowedOrigin, json, rateLimitKey, rateLimitOk, readJson, tooManyRequests } from './http';
import { EXTRACTIVE_LEAD, extractive } from '../../src/lib/answer';
import { buildMessages, extractText, postProcess, type Citation } from './prompt';
import { verifyTurnstile } from './turnstile';
import { validateQuestion } from './validate';

export type AskResponse = {
  answer: string;
  citations: Citation[];
  mode: 'llm' | 'retrieval' | 'refused';
  latencyMs: number;
  excerpts?: string[];
};

export const TOP_K = 6;
export const RETRIEVAL_K = 3;
export const AI_TIMEOUT_MS = 15_000;
export const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';

export const NOT_COVERED = "That isn't covered in his public material. Try the résumé, or open a ticket and ask him directly.";
export const OFF_TOPIC = 'I can only answer questions about Rakshith’s public work, using his public material.';
export const RETRIEVAL_ANSWER = EXTRACTIVE_LEAD;

const FALLBACK_CITATIONS: Citation[] = [
  { id: 'resume', title: 'Résumé', url: '/resume/' },
  { id: 'contact', title: 'Open a ticket', url: '/contact/' },
];

function refused(answer: string, started: number): AskResponse {
  return { answer, citations: FALLBACK_CITATIONS, mode: 'refused', latencyMs: Date.now() - started };
}

// No-LLM answer: one passage per page, reduced to the sentences that best match the question.
export function retrievalResponse(hits: Hit[], started: number, question = '', index?: Index): AskResponse {
  const passages = extractive(question, hits, RETRIEVAL_K, index);
  return {
    answer: RETRIEVAL_ANSWER,
    citations: passages.map((p) => ({ id: p.id, title: p.title + (p.section ? ` · ${p.section}` : ''), url: p.url })),
    excerpts: passages.map((p) => p.text),
    mode: 'retrieval',
    latencyMs: Date.now() - started,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`AI timeout after ${ms}ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => timer !== null && clearTimeout(timer));
}

export async function handleAsk(request: Request, env: Env): Promise<Response> {
  const started = Date.now();
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, { Allow: 'POST' });
  if (!isAllowedOrigin(request)) return json({ error: 'origin not allowed' }, 403);

  const ip = clientIp(request);
  if (!(await rateLimitOk(env.RATE_LIMITER, `ask:${rateLimitKey(ip)}`))) return tooManyRequests({ error: 'rate limited' });

  const body = await readJson(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const q = validateQuestion(body.value);
  if (!q.ok) return json({ error: q.error }, 400);
  const question = q.value;

  // The Ask UI sends no token; verify only when the owner configured a secret AND a token was sent.
  const token = typeof body.value.turnstileToken === 'string' ? body.value.turnstileToken : '';
  if (env.TURNSTILE_SECRET && token && !(await verifyTurnstile(env.TURNSTILE_SECRET, token, ip)))
    return json({ error: 'verification failed' }, 403);

  if (looksLikeInjection(question)) return json(refused(OFF_TOPIC, started));

  let corpus;
  try {
    corpus = await loadCorpus(env, request.url);
  } catch (err) {
    console.error('corpus load failed', String(err));
    return json({ error: 'corpus unavailable' }, 503);
  }

  // isAnswerable() must see the hits from this exact search over this index (coverage reads the top 3).
  const hits = search(corpus.index, question, TOP_K);
  if (!isAnswerable(corpus.index, question, hits)) return json(refused(NOT_COVERED, started));

  try {
    const result = await withTimeout(
      env.AI.run(env.AI_MODEL || DEFAULT_MODEL, { messages: buildMessages(question, hits), max_tokens: 400, temperature: 0.2 }),
      AI_TIMEOUT_MS,
    );
    const { answer, citations } = postProcess(extractText(result), hits, corpus.urls);
    if (answer) return json({ answer, citations, mode: 'llm', latencyMs: Date.now() - started } satisfies AskResponse);
    console.warn('LLM output unusable; falling back to retrieval');
  } catch (err) {
    // Includes daily neuron quota exhaustion (error 4006), timeouts and model errors.
    console.warn('Workers AI failed; falling back to retrieval', String(err));
  }
  return json(retrievalResponse(hits, started, question, corpus.index));
}
