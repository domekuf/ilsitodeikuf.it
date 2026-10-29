import { expect, test, type Page } from '@playwright/test';

// Raccoglie le violazioni della CSP (evento del browser + messaggi in console).
async function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return violations;
}

const HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

test('header di sicurezza: pagine statiche, SSR, API e redirect', async ({ request }) => {
  for (const path of ['/', '/press', '/concerti', '/api/venue-photos?slug=2026-11-01-cisim']) {
    const res = await request.get(path);
    expect(res.ok(), path).toBe(true);
    expect(res.headers(), path).toMatchObject(HEADERS);
    expect(res.headers()['content-security-policy'], path).toContain("frame-ancestors 'none'");
  }
  const redirect = await request.get('/press.php', { maxRedirects: 0 });
  expect(redirect.status()).toBe(301);
});

test('CSP nel <meta> con gli hash, niente stili inline negli attributi', async ({ page }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="content-security-policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self' .*'sha256-/);
  expect(csp).not.toContain('unsafe-inline');
  await expect(page.locator('[style]')).toHaveCount(0);
});

test('nessuna violazione della CSP navigando il sito', async ({ page }, info) => {
  const violations = await watchCsp(page);
  for (const path of ['/', '/concerti', '/articoli', '/pigna', '/press', '/privacy', '/contattaci']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  // modali, embed e form: le cose che caricano script o iframe
  await page.goto('/concerti');
  await page.getByRole('link', { name: /Almagià.*ven 14 giu 2030/ }).click();
  await expect(page.getByRole('dialog', { name: 'Almagià' })).toBeVisible();
  await page.goto('/pigna');
  await page.locator('.video__play').first().click();
  await expect(page.locator('[data-video] iframe').first()).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Carica il player' }).click();
  await expect(page.locator('[data-spotify] iframe')).toBeAttached();
  if (info.project.name === 'desktop') {
    await page
      .getByRole('navigation', { name: 'Principale' })
      .getByRole('link', { name: 'Contattaci' })
      .click();
    await page.getByRole('dialog', { name: 'Scrivici' }).getByLabel('Nome').focus();
  }
  // gli iframe esterni possono avere CSP loro: contano solo le violazioni della nostra pagina
  expect(violations.filter((v) => !/youtube|spotify|google/.test(v))).toEqual([]);
});

test('404 gentile', async ({ page }) => {
  const res = await page.goto('/questa-pagina-non-esiste');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('Qui non c’è niente. Come la parola Kuf.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vai ai concerti' })).toHaveAttribute('href', '/concerti');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('sitemap.xml e robots.txt', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.headers()['content-type']).toContain('application/xml');
  const xml = await sitemap.text();
  for (const loc of [
    'https://ilsitodeikuf.it/',
    'https://ilsitodeikuf.it/pigna',
    'https://ilsitodeikuf.it/articoli/felpa-gufo-grigia',
    'https://ilsitodeikuf.it/concerti/2030-06-14-almagia',
    'https://ilsitodeikuf.it/concerti/2014-03-14-artificierie-almagia',
  ]) {
    expect(xml).toContain(`<loc>${loc}</loc>`);
  }
  expect(xml).not.toContain('styleguide');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://ilsitodeikuf.it/sitemap.xml');
  expect(robots).toContain('Disallow: /api/');
});
