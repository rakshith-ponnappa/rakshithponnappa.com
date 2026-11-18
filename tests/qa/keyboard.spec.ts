// Pro QA: keyboard access. Skip link is the first Tab stop, focus is always visible, the ⌘K dialog traps
// focus and hands it back on close.
import type { Page } from '@playwright/test';
import { expect, settle, test } from '../support/fixtures';

/** Describes document.activeElement and whether it shows a visible focus indicator. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const ring = cs.boxShadow !== 'none';
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
      cls: el.className?.toString() ?? '',
      focusVisible: el.matches(':focus-visible'),
      indicator: outline || ring,
      onScreen: r.width > 0 && r.height > 0,
      inDialog: !!el.closest('dialog[open]'),
    };
  });

test('the skip link is the first Tab stop and moves focus to main', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /skip to content/i });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator('#main')).toBeVisible();
});

test('every Tab stop in the first 25 shows a visible focus indicator', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  const missing: unknown[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const f = await focused(page);
    if (!f) continue;
    expect(f.focusVisible, `Tab ${i + 1}: ${f.tag} "${f.text}" should match :focus-visible`).toBe(true);
    if (!f.indicator || !f.onScreen) missing.push({ stop: i + 1, ...f });
  }
  expect(missing, 'focusable elements without a visible outline/ring').toEqual([]);
});

test('the ⌘K dialog traps focus and returns it to the trigger', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  const trigger = page.getByRole('button', { name: 'Search or ask' }).first();
  test.skip(!(await trigger.isVisible()), 'palette trigger hidden at this width');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  // A native modal <dialog> makes the page inert: Tab cycles through the dialog and the browser chrome
  // (activeElement = body / null here) but must never land on page content behind it.
  let inside = 0;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
    const f = await focused(page);
    if (f) expect(f.inDialog, `Tab ${i + 1} escaped the dialog to ${JSON.stringify(f)}`).toBe(true);
    if (f?.inDialog) inside++;
  }
  expect(inside, 'Tab reached controls inside the dialog').toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('opening ⌘K from the keyboard shortcut returns focus to the previously focused element', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const before = await page.evaluate(() => (document.activeElement as HTMLElement).outerHTML.slice(0, 120));
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).outerHTML.slice(0, 120))).toBe(before);
});
