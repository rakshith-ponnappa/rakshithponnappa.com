// Pro QA: prefers-reduced-motion. No 3D hero chunk is fetched and no .enter reveal animation runs.
import { sitemapRoutes } from '../support/site';
import { expect, test } from '../support/fixtures';

/** The lazily imported 3D scene chunk(s): hero3d.*.js, three*.js, webgpu*.js (not the tiny Hero3D gate). */
export const HERO3D_CHUNK = /\/_astro\/(hero3d|three|webgpu)[^/]*\.js(\?|$)/;

test.use({ reducedMotion: 'reduce' });

test('no hero3d chunk is requested on / with reduced motion', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => r.resourceType() === 'script' && scripts.push(r.url()));
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(3_500); // longer than the 2.5 s requestIdleCallback timeout that gates the import
  expect(scripts.filter((u) => HERO3D_CHUNK.test(u))).toEqual([]);
  await expect(page.locator('[data-hero3d] canvas')).toHaveCount(0);
});

test('no .enter animation is running on any route with reduced motion', async ({ page }) => {
  const offenders: { route: string; anims: string[] }[] = [];
  for (const route of sitemapRoutes()) {
    await page.goto(route);
    await page.waitForLoadState('load');
    // An animation collapsed to ≤1 ms by the reduced-motion reset is not perceptible; anything longer is.
    const anims = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => {
          const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
          const active = a.effect?.getComputedTiming().activeDuration ?? 0;
          return t?.closest?.('.enter') && a.playState === 'running' && Number(active) > 1;
        })
        .map((a) => {
          const el = (a.effect as KeyframeEffect).target as Element;
          const tm = a.effect!.getComputedTiming();
          return `${(a as CSSAnimation).animationName ?? a.constructor.name} on ${el.tagName.toLowerCase()}.${el.className} (${tm.duration}ms × ${tm.iterations}${(a.effect as KeyframeEffect).pseudoElement ?? ''})`;
        }),
    );
    if (anims.length) offenders.push({ route, anims: anims.slice(0, 5) });
  }
  expect(offenders).toEqual([]);
});
