// End-user journeys: the contact ("Open a ticket") form.
// static target: /api/contact is 404 → mailto fallback; success is exercised with a routed 200.
// stack target: the Worker sends through the locally simulated send_email binding; mailto is exercised
// with a routed 503 {fallback: "mailto"} (what the Worker returns when EMAIL is not configured).
import { captureMailto, expect, test } from '../../support/fixtures';

const valid = { name: 'QA Robot', email: 'qa.robot@example.com', message: 'Automated QA ticket: please ignore. Testing the contact form.' };

async function fill(page: import('@playwright/test').Page, d = valid) {
  await page.locator('#c-name').fill(d.name);
  await page.locator('#c-email').fill(d.email);
  await page.locator('#c-msg').fill(d.message);
}
const submit = (page: import('@playwright/test').Page) => page.locator('[data-contact] button[type=submit]').click();
const validity = (page: import('@playwright/test').Page, sel: string) => page.locator(sel).evaluate((el) => (el as HTMLInputElement).validity.valid);

test.describe('contact form', () => {
  test('blocks empty and invalid input without calling the API', async ({ page }) => {
    let calls = 0;
    page.on('request', (r) => r.url().includes('/api/contact') && calls++);
    await page.goto('/contact/');
    await submit(page);
    expect(await validity(page, '#c-name')).toBe(false);
    expect(await validity(page, '#c-email')).toBe(false);
    expect(await validity(page, '#c-msg')).toBe(false);

    await fill(page, { ...valid, email: 'not-an-email' });
    await submit(page);
    expect(await validity(page, '#c-email')).toBe(false);
    expect(await validity(page, '#c-name')).toBe(true);

    await fill(page, { ...valid, message: 'too short' });
    await submit(page);
    expect(await validity(page, '#c-msg')).toBe(false);
    await expect(page.locator('[data-done]')).toBeHidden();
    expect(calls).toBe(0);
  });

  test('the character counter tracks the message', async ({ page }) => {
    await page.goto('/contact/');
    await page.locator('#c-msg').fill('hello world');
    await expect(page.locator('[data-count]')).toHaveText('11 / 2000');
  });

  test('a successful submit shows the confirmation', async ({ page, target }) => {
    if (target === 'static') await page.route('**/api/contact', (r) => r.fulfill({ status: 200, json: { ok: true } }));
    await page.goto('/contact/');
    await fill(page);
    const res = page.waitForResponse('**/api/contact');
    await submit(page);
    const r = await res;
    expect(r.status()).toBe(200);
    expect(r.request().postDataJSON()).toMatchObject({ name: valid.name, email: valid.email, topic: 'Hiring', message: valid.message });
    await expect(page.locator('[data-done]')).toBeVisible();
    await expect(page.locator('#c-name')).toBeHidden();
  });

  test('falls back to mailto when the API is unavailable', async ({ page, target }) => {
    await captureMailto(page);
    if (target === 'stack')
      await page.route('**/api/contact', (r) => r.fulfill({ status: 503, json: { ok: false, error: 'email not configured', fallback: 'mailto' } }));
    await page.goto('/contact/');
    const hasNavApi = await page.evaluate(() => 'navigation' in window);
    await page.locator('#c-topic').selectOption('Consulting');
    await fill(page);
    const res = page.waitForResponse('**/api/contact');
    await submit(page);
    expect((await res).status()).toBe(target === 'stack' ? 503 : 404);
    if (hasNavApi) {
      await expect.poll(() => page.evaluate(() => (window as unknown as { __mailto?: string }).__mailto ?? '')).toMatch(/^mailto:/);
      const mailto = await page.evaluate(() => (window as unknown as { __mailto: string }).__mailto);
      const u = new URL(mailto);
      expect(u.pathname).toBe('contact@rakshithponnappa.dev');
      expect(u.searchParams.get('subject')).toBe(`[Consulting] from ${valid.name}`);
      expect(u.searchParams.get('body')).toContain(valid.message);
    }
    await expect(page.locator('[data-err]')).toHaveText('');
    await expect(page.locator('[data-done]')).toBeHidden();
    await expect(page.locator('[data-contact] button[type=submit]')).toBeEnabled();
  });

  test('a 429 shows the rate-limit message', async ({ page }) => {
    await page.route('**/api/contact', (r) => r.fulfill({ status: 429, headers: { 'Retry-After': '60' }, json: { ok: false, error: 'rate limited' } }));
    await page.goto('/contact/');
    await fill(page);
    await submit(page);
    await expect(page.locator('[data-err]')).toContainText(/try again in a minute/i);
  });
});
