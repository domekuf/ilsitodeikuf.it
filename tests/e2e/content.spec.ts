import { expect, test } from '@playwright/test';

test.describe('articoli', () => {
  test('la lista mostra i 5 articoli, senza prezzi', async ({ page }) => {
    await page.goto('/articoli');
    await expect(page.getByRole('heading', { level: 1, name: 'Articoli' })).toBeVisible();
    await expect(page.locator('a[data-modal-link="articolo"]')).toHaveCount(5);
    await expect(page.locator('main')).not.toContainText(/€|prezzo/i);
  });

  test('dalla lista: modale con URL, titolo, form con oggetto; indietro e avanti', async ({ page }) => {
    await page.goto('/articoli');
    const card = page.getByRole('link', { name: /Felpa grigia con il gufo/ });
    await card.click();
    const dialog = page.getByRole('dialog', { name: 'Felpa grigia con il gufo' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/articoli\/felpa-gufo-grigia$/);
    await expect(page).toHaveTitle('Felpa grigia con il gufo · Articoli · Il Sito dei Kuf');
    await expect(dialog.locator('input[name="subject"]')).toHaveValue('Vorrei: Felpa grigia con il gufo');
    await expect(dialog.getByLabel('Messaggio')).toHaveAttribute(
      'placeholder',
      'Scrivici taglia, quantità e come preferisci ritirarla',
    );

    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/articoli$/);
    await expect(card).toBeFocused();

    await page.goForward();
    await expect(page.getByRole('dialog', { name: 'Felpa grigia con il gufo' })).toBeVisible();
  });

  test('accesso diretto: modale aperta, canonical sul dettaglio, chiusura verso la lista', async ({
    page,
  }) => {
    await page.goto('/articoli/maglietta-gufo-rossa');
    const dialog = page.getByRole('dialog', { name: 'Maglietta rossa con il gufo' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://ilsitodeikuf.it/articoli/maglietta-gufo-rossa',
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /^https:\/\/ilsitodeikuf\.it\//,
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/articoli$/);
    await expect(page).toHaveTitle('Articoli · Il Sito dei Kuf');
  });
});

for (const disco of [
  { path: '/pigna', titolo: 'Pigna', brani: 10, video: 4, primo: 'Agosto' },
  { path: '/via-trieste', titolo: 'Via Trieste', brani: 12, video: 3, primo: 'Chissà chi verrà' },
]) {
  test.describe(disco.titolo, () => {
    test('tracklist, download e video', async ({ page }) => {
      await page.goto(disco.path);
      await expect(page.getByRole('heading', { level: 1, name: disco.titolo })).toBeVisible();
      const tracks = page.locator('ol li');
      await expect(tracks).toHaveCount(disco.brani);
      await expect(tracks.first()).toContainText(disco.primo);
      await expect(page.getByRole('heading', { name: `Scarica ${disco.titolo}` })).toBeVisible();
      await expect(page.locator('[data-video]')).toHaveCount(disco.video);
      expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain(
        '"MusicAlbum"',
      );
    });

    test('il video si carica solo al clic, da youtube-nocookie', async ({ page }) => {
      const requests: string[] = [];
      page.on('request', (r) => requests.push(r.url()));
      await page.goto(disco.path);
      await page.waitForLoadState('networkidle');
      expect(requests.some((u) => /youtube|ytimg|google/.test(u))).toBe(false);

      await page.locator('.video__play').first().click();
      const iframe = page.locator('[data-video] iframe').first();
      await expect(iframe).toHaveAttribute(
        'src',
        /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}\?autoplay=1/,
      );
    });
  });
}

test('i video partono dall’inizio e l’iframe riempie il riquadro', async ({ page }) => {
  await page.goto('/pigna');
  await page.locator('.video__play').nth(1).click();
  const iframe = page.locator('[data-video] iframe');
  await expect(iframe).not.toHaveAttribute('src', /start=/);
  const box = await page.locator('[data-video]').nth(1).boundingBox();
  const frame = await iframe.boundingBox();
  expect(
    frame && box && Math.abs(frame.width - box.width) < 1 && Math.abs(frame.height - box.height) < 1,
  ).toBe(true);
});

test.describe('press', () => {
  test('download, formazione e solo link verificati', async ({ page, request }) => {
    await page.goto('/press');
    for (const name of ['Scheda tecnica', 'Stage plan', 'Loghi']) {
      await expect(page.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
    }
    await expect(page.getByText('Ciro Pepe')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/booking|Ocarina|Bervisti|SoundCloud/i);
    await expect(page.locator('a[href*="rockgarage"]')).toHaveCount(0);

    const pdf = await request.get('/press/scheda-tecnica.pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-disposition']).toContain('Kuf - Scheda tecnica.pdf');
    expect((await request.get('/press/kuf-loghi.zip')).status()).toBe(200);
  });
});

test.describe('redirect dai vecchi URL', () => {
  const cases: [string, string][] = [
    ['/index.php', '/'],
    ['/via-trieste.php', '/via-trieste'],
    ['/concerti.php', '/concerti'],
    ['/magliette.php', '/articoli'],
    ['/contatti.php', '/contattaci'],
    ['/press.php', '/press'],
    ['/download.php?dl=Pigna.zip', '/pigna'],
    ['/download.php?dl=ViaTrieste.zip', '/via-trieste'],
    ['/download.php', '/pigna'],
    ['/public/Pigna.zip', '/pigna'],
    ['/public/ViaTrieste.zip', '/via-trieste'],
    ['/public/scheda-tecnica.pdf', '/press/scheda-tecnica.pdf'],
    ['/public/lista-canali.pdf', '/press'],
  ];
  for (const [from, to] of cases) {
    test(`${from} → ${to}`, async ({ request }) => {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status()).toBe(301);
      expect(new URL(res.headers()['location'] ?? '', 'http://x').pathname).toBe(to);
    });
  }
});
