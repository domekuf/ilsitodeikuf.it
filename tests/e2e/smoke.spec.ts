import { expect, test } from '@playwright/test';

test('la home risponde in italiano', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Il Sito dei Kuf/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Kuf');
});

test("l'endpoint SSR vede i binding", async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({
    ok: true,
    bindings: { DB: true, CACHE: true, DOWNLOADS: true, FORM_LIMITER: true },
  });
});
