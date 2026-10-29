import { expect, test } from '@playwright/test';

// Dati: tests/fixtures/calendar-events.json (CALENDAR_SOURCE=fixture in .dev.vars).
// I concerti "(esempio)" del 2030 restano futuri per un bel po': i test si appoggiano a quelli.
const FUTURE = '/concerti/2030-06-14-almagia';
const PAST = '/concerti/2014-03-14-artificierie-almagia';

test('lista: in programma col prossimo evidenziato, passati per anno, JSON-LD', async ({ page }) => {
  await page.goto('/concerti');
  await expect(page.getByRole('heading', { level: 1, name: 'Concerti' })).toBeVisible();
  const inProgramma = page.locator('section[aria-labelledby="in-programma"]');
  await expect(inProgramma.locator('a[data-modal-link="concerto"]').first()).toContainText('Il prossimo');
  await expect(inProgramma.getByRole('link', { name: /Almagià.*ven 14 giu 2030/ })).toBeVisible();

  const years = page.locator('details.year');
  await expect(years.first().locator('summary')).toContainText('2026');
  await expect(years.last().locator('summary')).toContainText('2014');
  await expect(years.last()).not.toHaveAttribute('open');
  await years.last().locator('summary').click();
  await expect(years.last().getByRole('link', { name: /^Artificierie Almagià/ })).toBeVisible();

  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '[]');
  expect(ld.every((e: { '@type': string }) => e['@type'] === 'MusicEvent')).toBe(true);
  expect(ld.some((e: { url: string }) => e.url.endsWith(FUTURE))).toBe(true);
});

test('la descrizione dell’evento non esce mai (solo link: e foto:)', async ({ page, request }) => {
  for (const path of ['/concerti', FUTURE]) {
    const html = await (await request.get(path)).text();
    expect(html).not.toContain('NON PUBBLICARE');
    expect(html).not.toContain('Evento d’esempio per lo sviluppo');
  }
  await page.goto(FUTURE);
  await expect(page.getByRole('link', { name: 'Biglietti', exact: true })).toHaveAttribute(
    'href',
    'https://example.com/biglietti',
  );
});

test('dalla lista: modale con URL e titolo; indietro e avanti', async ({ page }) => {
  await page.goto('/concerti');
  const link = page.getByRole('link', { name: /Almagià.*ven 14 giu 2030/ });
  await link.click();
  const dialog = page.getByRole('dialog', { name: 'Almagià' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${FUTURE}$`));
  await expect(page).toHaveTitle('Almagià, ven 14 giu 2030 · Concerti · Il Sito dei Kuf');
  await expect(dialog).toContainText('venerdì 14 giugno 2030 · ore 21:30');
  await expect(dialog).not.toContainText('23:30'); // solo l'ora di inizio
  await expect(dialog).toContainText('Ravenna · con Gli Ospiti (esempio)');
  await expect(dialog.getByText('In programma', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Apri in Google Maps/ })).toHaveAttribute(
    'href',
    /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Artificerie%20Almagi%C3%A0/,
  );
  await expect(dialog.getByRole('link', { name: /Aggiungi al calendario/ })).toHaveAttribute(
    'href',
    `${FUTURE}.ics`,
  );

  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/concerti$/);
  await expect(page).toHaveTitle('Concerti · Il Sito dei Kuf');
  await expect(link).toBeFocused();

  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Almagià' })).toBeVisible();
});

test('accesso diretto a un concerto passato: niente orario, niente .ics; chiusura verso la lista', async ({
  page,
}) => {
  await page.goto(PAST);
  const dialog = page.getByRole('dialog', { name: 'Artificierie Almagià' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Passato', { exact: true })).toBeVisible();
  await expect(dialog).toContainText('venerdì 14 marzo 2014');
  await expect(dialog).not.toContainText('Orario');
  await expect(dialog).toContainText('con Nemesi');
  await expect(dialog.getByRole('link', { name: /Aggiungi al calendario/ })).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `https://ilsitodeikuf.it${PAST}`,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/concerti$/);
});

test('foto della venue: senza foto vere la galleria non c’è; le foto: della descrizione sì', async ({
  page,
}) => {
  // in test non c'è la chiave Places: per i concerti senza `foto:` niente galleria, niente immagini di ripiego
  const photos = page.waitForResponse((r) => r.url().includes('/api/venue-photos'));
  await page.goto(FUTURE);
  const dialog = page.getByRole('dialog', { name: 'Almagià' });
  await expect(dialog).toBeVisible();
  await (await photos).finished();
  await expect(dialog.locator('[data-venue-gallery]')).toBeHidden();
  await expect(dialog.locator('img[src]')).toHaveCount(0);

  await page.goto('/concerti/2030-10-26-freak-out-esempio');
  const override = page.locator('#concerto [data-venue-gallery]');
  await expect(override).toBeVisible();
  await expect(override.locator('img')).toHaveCount(2);
  await expect(override.locator('img').first()).toHaveAttribute('src', 'https://example.com/foto-1.jpg');
  await expect(override.locator('img').first()).toHaveAttribute('alt', 'Freak Out (esempio): foto 1');
});

test('/api/venue-photos: niente foto senza chiave, override, 404 e 400', async ({ request }) => {
  expect(await (await request.get('/api/venue-photos?slug=2026-11-01-cisim')).json()).toEqual({
    source: 'none',
    photos: [],
  });
  const override = await (await request.get('/api/venue-photos?slug=2030-10-26-freak-out-esempio')).json();
  expect(override.source).toBe('override');
  expect((await request.get('/api/venue-photos?slug=non-esiste')).status()).toBe(404);
  expect((await request.get('/api/venue-photos?slug=<x>')).status()).toBe(400);
});

test('.ics del concerto', async ({ request }) => {
  const res = await request.get(`${FUTURE}.ics`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/calendar');
  const body = await res.text();
  expect(body).toContain('DTSTART:20300614T193000Z');
  expect(body).toContain('SUMMARY:Kuf @ Ravenna - Almagià w/ Gli Ospiti (esempio)');
  expect((await request.get('/concerti/non-esiste.ics')).status()).toBe(404);
});

test('condividi: senza Web Share copia il link', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'il clipboard headless si prova su desktop');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(FUTURE);
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined }));
  const dialog = page.getByRole('dialog', { name: 'Almagià' });
  await dialog.getByRole('button', { name: 'Condividi' }).click();
  await expect(dialog.getByRole('button', { name: 'Link copiato' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://ilsitodeikuf.it${FUTURE}`);
});

test('slug sconosciuto: 404 gentile con il link ai concerti', async ({ page }) => {
  const res = await page.goto('/concerti/2099-01-01-boh');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Non c’è');
  await expect(page.getByRole('link', { name: 'Vai ai concerti' })).toBeVisible();
});
