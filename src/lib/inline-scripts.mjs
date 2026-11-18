// Inline <head> scripts, shared by BaseLayout (which renders them) and astro.config.mjs (which allow-lists their
// SHA-256 hashes in the CSP). Astro does not hash `is:inline` scripts, so any change here must stay in this file.
import { createHash } from 'node:crypto';

// Resolve the theme before first paint: stored choice, else the OS preference.
export const THEME_SCRIPT =
  "(function(){var t;try{t=localStorage.getItem('theme')}catch(e){}" +
  "if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';" +
  'document.documentElement.dataset.theme=t})();';

export const SPECULATION_RULES = JSON.stringify({
  prerender: [
    {
      where: { and: [{ href_matches: '/*' }, { not: { href_matches: ['/*.pdf', '/*.json', '/*.txt', '/api/*'] } }] },
      eagerness: 'moderate',
    },
  ],
});

/** @param {string} s */
export const sha256 = (s) => /** @type {`sha256-${string}`} */ (`sha256-${createHash('sha256').update(s).digest('base64')}`);
