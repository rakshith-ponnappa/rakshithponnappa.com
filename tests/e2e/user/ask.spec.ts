// End-user journeys: the "Ask the runbook" panel.
// static target: /api/ask is 404 → in-browser BM25 fallback. stack target: Worker without Workers AI →
// mode "retrieval" (the degradation path) or "refused".
import { expect, test } from '../../support/fixtures';

const KNOWN = { q: 'What is TalentLens?', cite: '/projects/talentlens/' };
// Chip labels from AskPanel.astro render(): llm / retrieval / refused.
const CHIP = { llm: 'AI answer · cited', retrieval: 'From the site · no AI', refused: 'Not covered' };

test.describe('Ask panel', () => {
  test('answers a known question with citations', async ({ page, target }) => {
    await page.goto('/ask/');
    const apiCall = page.waitForResponse((r) => r.url().endsWith('/api/ask'));
    await page.locator('#ask-q').fill(KNOWN.q);
    await page.locator('[data-ask-form] button[type=submit]').click();
    const api = await apiCall;
    expect(api.status()).toBe(target === 'stack' ? 200 : 404);

    const out = page.locator('[data-ask-out]');
    await expect(out.locator('.meta .chip')).toHaveText(target === 'stack' ? /From the site · no AI|AI answer · cited/ : CHIP.retrieval);
    if (target === 'static') await expect(out.locator('.meta .lat')).toContainText('in-browser');
    else await expect(out).not.toContainText('in-browser');
    const cites = out.locator('a.src');
    await expect(cites.first()).toBeVisible();
    const hrefs = await cites.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.some((h) => h?.startsWith(KNOWN.cite))).toBe(true);
    for (const h of hrefs) expect(h).toMatch(/^\//);
    await expect(out.locator('.ptext').first()).toBeVisible();
  });

  test('refuses an off-topic question', async ({ page }) => {
    await page.goto('/ask/');
    await page.locator('#ask-q').fill('What is the capital of France?');
    await page.keyboard.press('Enter');
    const out = page.locator('[data-ask-out]');
    await expect(out.locator('.meta .chip')).toHaveText(CHIP.refused);
    await expect(out).toContainText(/isn.t covered in his public material/);
    await expect(out.locator('.actions a[href="/contact/"]')).toBeVisible();
  });

  test('a suggestion chip asks its question', async ({ page }) => {
    await page.goto('/');
    const chip = page.locator('[data-ask-suggest]').first();
    const q = (await chip.textContent())!.trim();
    await chip.click();
    await expect(page.locator('[data-ask-out] .meta .q')).toHaveText(`“${q}”`);
  });

  test('/ask/?q= autoruns the question', async ({ page }) => {
    await page.goto(`/ask/?q=${encodeURIComponent(KNOWN.q)}`);
    await expect(page.locator('#ask-q')).toHaveValue(KNOWN.q);
    await expect(page.locator('[data-ask-out] a.src').first()).toBeVisible();
  });

  test('in-browser fallback refuses what the Worker refuses (shared REFUSAL_THRESHOLD)', async ({ page, target }) => {
    test.skip(target !== 'static', 'only the static target exercises the in-browser fallback');
    // Scores 3.9 on the built corpus: below the Worker's REFUSAL_THRESHOLD (4), so /api/ask refuses it.
    await page.goto('/ask/');
    await page.locator('#ask-q').fill('Explain quantum entanglement');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-ask-out] .meta .chip')).toHaveText(CHIP.refused);
  });
});
