import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page) {
  // aspetta la fine delle animazioni d'ingresso (FAB, modali)
  await page.waitForTimeout(900);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary).toEqual([]);
}

for (const path of ['/', '/contattaci', '/styleguide', '/styleguide/esempio/esempio']) {
  test(`axe senza errori: ${path}`, async ({ page }) => {
    await page.goto(path);
    await audit(page);
  });
}

test('axe senza errori: menu aperto (mobile)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'solo mobile');
  await page.goto('/');
  await page.getByRole('button', { name: 'Apri il menu' }).click();
  await audit(page);
});

test('axe senza errori: speed dial aperto (mobile)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'solo mobile');
  await page.goto('/');
  await page.getByRole('button', { name: 'Social dei Kuf' }).click();
  await audit(page);
});
