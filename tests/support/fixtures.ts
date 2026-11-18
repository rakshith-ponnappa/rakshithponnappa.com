// Shared Playwright fixtures for the QA suite.
import { test as base, expect, type Page } from '@playwright/test';

export type Target = 'static' | 'stack';
export const TARGET: Target = process.env.QA_TARGET === 'stack' ? 'stack' : 'static';

let seq = 0;

export const test = base.extend<{ target: Target }>({
  target: [TARGET, { option: true }],
  page: async ({ page }, use, info) => {
    // Each test gets its own client IP so the Worker's rate limiter (10 / 60 s per IP) never couples tests.
    // Cloudflare overwrites CF-Connecting-IP in production; wrangler dev honours it locally.
    const n = (info.workerIndex * 1000 + ++seq) % 65_000;
    await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': `198.18.${Math.floor(n / 250)}.${(n % 250) + 1}` });
    await use(page);
  },
});
export { expect };

/** Force a theme before any page script runs (the inline head script reads localStorage). */
export async function useTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t);
    } catch {}
  }, theme);
}

/**
 * Record mailto: navigations instead of handing them to the OS. Uses the Navigation API where the engine
 * supports it, and falls back to wrapping location.assign / href assignment through a navigate listener.
 */
export async function captureMailto(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __mailto?: string; navigation?: EventTarget };
    w.navigation?.addEventListener('navigate', (e: Event) => {
      const ev = e as Event & { destination: { url: string } };
      if (ev.destination.url.startsWith('mailto:')) {
        w.__mailto = ev.destination.url;
        ev.preventDefault();
      }
    });
  });
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 900;

/** Wait for load, web fonts and every finite animation (entrance reveals) so scans see the settled page. */
export async function settle(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const finite = document.getAnimations().filter((a) => {
      const t = a.effect?.getComputedTiming();
      return t && t.iterations !== Infinity && a.playState === 'running';
    });
    await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, 4_000))]);
  });
}

/**
 * Scroll-driven reveals (`.reveal`, animation-timeline: view()) sit at partial opacity until scrolled into view, so
 * scanners would measure blended colours a visitor never sees. Scroll to the end so every reveal reaches its end state.
 */
export async function revealAll(page: Page) {
  await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/** Install a securitypolicyviolation recorder before any page script runs. Read it with cspViolations(). */
export async function recordCsp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: { directive: string; blocked: string; source: string; line: number; sample: string }[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push({ directive: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber, sample: e.sample }),
    );
  });
}
export const cspViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp?: unknown[] }).__csp ?? []) as Promise<
    { directive: string; blocked: string; source: string; line: number; sample: string }[]
  >;
