export interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface Env {
  ASSETS: Fetcher;
  AI: AiBinding;
  RATE_LIMITER?: RateLimit;
  /** Optional stricter limiter for /api/contact; falls back to RATE_LIMITER when not bound. */
  CONTACT_LIMITER?: RateLimit;
  EMAIL?: SendEmail;
  AI_MODEL: string;
  CONTACT_TO: string;
  CONTACT_FROM: string;
  /** Set only with `wrangler secret put TURNSTILE_SECRET`. */
  TURNSTILE_SECRET?: string;
}
