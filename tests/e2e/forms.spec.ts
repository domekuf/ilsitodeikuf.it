import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Ogni test ha un "IP" suo, così il rate limit (3 invii al minuto) non si somma tra i test.
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    'cf-connecting-ip': `10.0.${info.workerIndex}.${(info.repeatEachIndex + info.retry + Date.now()) % 250}`,
  });
});

type Mail = { to: string; subject: string; replyTo?: string; html: string; text: string };

async function outbox(request: APIRequestContext): Promise<Mail[]> {
  return (await request.get('/api/dev/outbox')).json();
}

async function openContact(page: Page, isMobile: boolean) {
  await page.goto('/');
  if (isMobile) {
    await page.getByRole('button', { name: 'Apri il menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Contattaci' }).click();
  } else {
    await page
      .getByRole('navigation', { name: 'Principale' })
      .getByRole('link', { name: 'Contattaci' })
      .click();
  }
  return page.getByRole('dialog', { name: 'Scrivici' });
}

test('contatti: la band riceve il messaggio, con Reply-To e input escapato', async ({
  page,
  request,
}, info) => {
  const dialog = await openContact(page, info.project.name === 'mobile');
  const unique = `Test ${Date.now()} <b>grassetto</b>`;
  await dialog.getByLabel('Nome').fill('Anna');
  await dialog.getByLabel('Email').fill('anna@example.com');
  await dialog.getByLabel('Messaggio').fill(unique);
  await dialog.getByRole('button', { name: 'Invia' }).click();
  await expect(dialog.getByText('Grazie di averci scritto, Anna!')).toBeVisible();

  const mail = (await outbox(request)).find((m) => m.text.includes(unique));
  expect(mail).toBeDefined();
  expect(mail).toMatchObject({
    to: 'kuf.ravenna@gmail.com',
    replyTo: 'anna@example.com',
    subject: '[sito] Nuovo messaggio',
  });
  expect(mail!.html).not.toContain('<b>grassetto</b>');
  expect(mail!.html).toContain('&lt;b&gt;grassetto&lt;/b&gt;');
  // nessuna copia al mittente
  expect((await outbox(request)).some((m) => m.to === 'anna@example.com' && m.text.includes(unique))).toBe(
    false,
  );
});

test('contatti: errori di validazione accanto ai campi, senza inviare', async ({ page }, info) => {
  const dialog = await openContact(page, info.project.name === 'mobile');
  await dialog.getByLabel('Email').fill('non-una-email');
  await dialog.getByRole('button', { name: 'Invia' }).click();
  await expect(dialog.getByText('Quest’email non ci piace: controlla che ci sia la @.')).toBeVisible();
  await expect(dialog.getByLabel('Nome')).toBeFocused();
  await expect(dialog.getByRole('status').first()).toHaveText('Controlla i campi segnati.');
});

test('articolo: l’oggetto porta il nome dell’articolo', async ({ page, request }) => {
  await page.goto('/articoli/felpa-gufo-grigia');
  const dialog = page.getByRole('dialog', { name: 'Felpa grigia con il gufo' });
  const unique = `Taglia M ${Date.now()}`;
  await dialog.getByLabel('Nome').fill('Bea');
  await dialog.getByLabel('Email').fill('bea@example.com');
  await dialog.getByLabel('Messaggio').fill(unique);
  await dialog.getByRole('button', { name: 'Invia' }).click();
  await expect(dialog.getByText('Grazie di averci scritto, Bea!')).toBeVisible();
  const mail = (await outbox(request)).find((m) => m.text.includes(unique));
  expect(mail?.subject).toBe('[articolo] Felpa grigia con il gufo');
});

test('download: notifica, ringraziamento col link, zip da R2', async ({ page, request }) => {
  await page.goto('/pigna');
  const email = `carla+${Date.now()}@example.com`;
  const form = page.locator('form[data-form="download"]');
  await form.getByLabel('Nome').fill('Carla');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel(/Voglio ricevere/).check();
  const download = page.waitForEvent('download');
  await form.getByRole('button', { name: 'Scarica il disco' }).click();
  expect((await download).suggestedFilename()).toBe('Kuf - Pigna (2017).zip');
  await expect(page.getByText('Grazie davvero, Carla!', { exact: false })).toBeVisible();

  const mails = await outbox(request);
  const notify = mails.find((m) => m.to === 'kuf.ravenna@gmail.com' && m.replyTo === email);
  const thanks = mails.find((m) => m.to === email);
  expect(notify?.subject).toBe('[download] Pigna');
  expect(thanks?.subject).toBe('Grazie dai Kuf: ecco Pigna');
  const link = /https?:\/\/[^\s]+\/api\/download\/[\w.-]+/.exec(thanks!.text)![0];
  const zip = await request.get(new URL(link).pathname);
  expect(zip.status()).toBe(200);
  expect(zip.headers()['content-type']).toBe('application/zip');

  // disiscrizione: GET mostra solo il bottone, il POST revoca
  const unsub = /https?:\/\/[^\s]+\/disiscriviti\/[\w.-]+/.exec(thanks!.text)![0];
  await page.goto(new URL(unsub).pathname);
  await page.getByRole('button', { name: 'Non voglio più ricevere notizie' }).click();
  await expect(page.getByRole('status')).toContainText('da ora non ti scriviamo più');
});

test('download: link non valido o manomesso → pagina gentile', async ({ page }) => {
  const res = await page.goto('/api/download/abc.def');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Link non valido');
  await expect(page.getByRole('link', { name: 'Vai alla pagina del disco' })).toBeVisible();
});

test('disiscrizione con token falso: niente da fare', async ({ page }) => {
  const res = await page.goto('/disiscriviti/finto.token');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('Questo link non funziona più')).toBeVisible();
});

test('rate limit: al quarto invio di fila arriva un messaggio chiaro', async ({ request }) => {
  const headers = { 'cf-connecting-ip': `10.9.${Date.now() % 250}.1` };
  const send = () =>
    request.post('/_actions/contatto', {
      headers,
      multipart: {
        name: 'A',
        email: 'a@example.com',
        message: 'm',
        'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
      },
    });
  for (let i = 0; i < 3; i++) expect((await send()).status()).toBe(200);
  const blocked = await send();
  expect(blocked.status()).toBe(429);
  expect((await blocked.json()).message).toContain('troppi messaggi');
});

test('Turnstile: token mancante → rifiutato', async ({ request }) => {
  const res = await request.post('/_actions/contatto', {
    headers: { 'cf-connecting-ip': `10.8.${Date.now() % 250}.1` },
    multipart: { name: 'A', email: 'a@example.com', message: 'm' },
  });
  expect(res.status()).toBe(403);
});

test('privacy: c’è e dice le cose essenziali', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  for (const t of ['kuf.ravenna@gmail.com', 'Cloudflare', 'Resend', '24 mesi']) {
    await expect(page.locator('main')).toContainText(t);
  }
});
