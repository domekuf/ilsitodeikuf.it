import { expect, test } from '@playwright/test';

test('hero, JSON-LD MusicGroup e immagine OG', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Kuf');
  await expect(
    page.getByText('Un gruppo di Ravenna che, a volte, fa la musica forte.').first(),
  ).toBeVisible();
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}');
  expect(ld['@type']).toBe('MusicGroup');
  expect(ld.member.map((m: { member: { name: string } }) => m.member.name)).toContain('Ciro Pepe');
  expect(ld.sameAs).toContain('https://www.instagram.com/kuf.quellichesuonano');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://ilsitodeikuf.it/og/home.jpg',
  );
  expect((await page.request.get('/og/home.jpg')).headers()['content-type']).toContain('image/jpeg');
});

test('prossimo concerto: arriva dalla server island, con dettagli e .ics', async ({ page }) => {
  const island = page.waitForResponse((r) => r.url().includes('/_server-islands/NextConcert'));
  await page.goto('/');
  const res = await island;
  expect(res.status()).toBe(200);
  const section = page.locator('section[aria-labelledby="home-concerto"]');
  const details = section.getByRole('link', { name: 'Dettagli' });
  await expect(details).toHaveAttribute('href', /^\/concerti\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
  const href = await details.getAttribute('href');
  await expect(section.getByRole('link', { name: /Aggiungi al calendario/ })).toHaveAttribute(
    'href',
    `${href}.ics`,
  );
  await expect(section.locator('[aria-busy="true"]')).toHaveCount(0);

  await details.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('dischi e articoli portano alle loro pagine', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Pigna, 2017/ })).toHaveAttribute('href', '/pigna');
  await expect(page.getByRole('link', { name: /Via Trieste, 2015/ })).toHaveAttribute('href', '/via-trieste');
  await expect(page.locator('section[aria-labelledby="home-articoli"] a[href^="/articoli/"]')).toHaveCount(3);
});

test('cose vere: una alla volta, "Dimmi un’altra cosa vera" passa alla successiva', async ({ page }) => {
  await page.goto('/');
  const facts = page.locator('[data-fact]:visible');
  await expect(facts).toHaveCount(1);
  await expect(facts).toHaveText('I Kuf sono di Ravenna e sono nati nel 2014.');
  await page.getByRole('button', { name: 'Dimmi un’altra cosa vera' }).click();
  await expect(facts).toHaveText('I Kuf cantano in italiano perché pensano in italiano.');
});

test('Spotify si carica solo su richiesta', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  await page.locator('[data-spotify]').scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  expect(requests.some((u) => /spotify|scdn/.test(u))).toBe(false);
  await page.getByRole('button', { name: 'Carica il player' }).click();
  await expect(page.locator('[data-spotify] iframe')).toHaveAttribute(
    'src',
    /^https:\/\/open\.spotify\.com\/embed\/artist\/19RHxgdzVkXbRI6IcwMPz3/,
  );
});
