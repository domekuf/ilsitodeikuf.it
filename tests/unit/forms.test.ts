import { describe, expect, it, vi } from 'vitest';
import { FormError, handleContact, handleDownload, type Deps } from '~/lib/forms/handlers';
import { contactSchema, downloadSchema } from '~/lib/forms/schema';
import type { MailMessage } from '~/lib/mail';
import { readDownloadToken } from '~/lib/tokens';
import { createD1 } from './helpers/d1';

const SECRET = 'segreto-di-test-lungo-almeno-32-byte!!';

function deps(over: Partial<Deps> = {}) {
  const sent: MailMessage[] = [];
  const d: Deps & { downloadSecret: string; unsubscribeSecret: string } = {
    db: createD1(),
    mail: { name: 'test', send: async (m) => void sent.push(m) },
    mailFrom: 'Il Sito dei Kuf <sito@ilsitodeikuf.it>',
    mailTo: 'kuf.ravenna@gmail.com',
    consentTextVersion: 'v1',
    origin: 'https://ilsitodeikuf.it',
    ip: '1.2.3.4',
    rateLimit: async () => true,
    verifyHuman: async (t) => t === 'ok',
    downloadSecret: SECRET,
    unsubscribeSecret: SECRET,
    ...over,
  };
  return { d, sent };
}

const contact = (extra: Record<string, unknown> = {}) =>
  contactSchema.parse({
    name: 'Anna',
    email: 'anna@example.com',
    message: 'Ciao!',
    'cf-turnstile-response': 'ok',
    updates: null,
    website: null,
    page: '/',
    subject: null,
    context: null,
    ...extra,
  });

describe('validazione', () => {
  it('messaggi in italiano', () => {
    const r = contactSchema.safeParse({ name: '', email: 'no', message: '' });
    expect(r.success).toBe(false);
    const msgs = r.error!.issues.map((i) => i.message);
    expect(msgs).toContain('Questo campo è obbligatorio.');
    expect(msgs).toContain('Quest’email non ci piace: controlla che ci sia la @.');
  });
  it('nome su una riga sola, messaggio max 5000', () => {
    expect(contactSchema.safeParse({ name: 'a\nb', email: 'a@b.it', message: 'x' }).success).toBe(false);
    expect(contactSchema.safeParse({ name: 'a', email: 'a@b.it', message: 'x'.repeat(5001) }).success).toBe(
      false,
    );
  });
  it('download: album solo tra quelli previsti, messaggio facoltativo', () => {
    expect(downloadSchema.safeParse({ name: 'a', email: 'a@b.it', album: 'altro' }).success).toBe(false);
    expect(downloadSchema.parse({ name: 'a', email: 'a@b.it', album: 'pigna', message: null }).message).toBe(
      '',
    );
  });
  it('contesto articolo valido o niente', () => {
    expect(
      contact({ context: JSON.stringify({ type: 'articolo', slug: 'felpa', nome: 'Felpa' }) }).context,
    ).toEqual({
      type: 'articolo',
      slug: 'felpa',
      nome: 'Felpa',
    });
    expect(
      contactSchema.safeParse({ name: 'a', email: 'a@b.it', message: 'x', context: '{rotto' }).success,
    ).toBe(false);
  });
});

describe('form contatti', () => {
  it('manda la mail alla band con Reply-To del mittente e nessuna copia al mittente', async () => {
    const { d, sent } = deps();
    await handleContact(contact({ subject: 'Concerto' }), d);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'kuf.ravenna@gmail.com',
      replyTo: 'anna@example.com',
      subject: '[sito] Concerto',
    });
  });

  it('Turnstile mancante o sbagliato: rifiutato, niente mail', async () => {
    const { d, sent } = deps();
    await expect(handleContact(contact({ 'cf-turnstile-response': '' }), d)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(handleContact(contact({ 'cf-turnstile-response': 'falso' }), d)).rejects.toBeInstanceOf(
      FormError,
    );
    expect(sent).toHaveLength(0);
  });

  it('rate limit: rifiutato', async () => {
    const { d } = deps({ rateLimit: async () => false });
    await expect(handleContact(contact(), d)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('honeypot compilato: risposta normale ma niente salvataggio e niente mail', async () => {
    const { d, sent } = deps();
    const verify = vi.fn(d.verifyHuman);
    await expect(
      handleContact(contact({ website: 'http://spam' }), { ...d, verifyHuman: verify }),
    ).resolves.toEqual({ name: 'Anna' });
    expect(sent).toHaveLength(0);
    expect(verify).not.toHaveBeenCalled();
  });

  it('se D1 fallisce la mail parte comunque, e il log non contiene dati personali', async () => {
    const log = vi.fn();
    const broken = {
      prepare: () => {
        throw new Error('anna@example.com boom');
      },
    } as unknown as D1Database;
    const { d, sent } = deps({ db: broken, log });
    await handleContact(contact(), d);
    expect(sent).toHaveLength(1);
    expect(log.mock.calls.flat().join(' ')).not.toContain('anna@example.com');
  });

  it('se la mail fallisce: errore umano con l’indirizzo di riserva', async () => {
    const { d } = deps({ mail: { name: 'x', send: async () => Promise.reject(new Error('down')) } });
    await expect(handleContact(contact(), d)).rejects.toThrow(/kuf\.ravenna@gmail\.com/);
  });
});

describe('form download', () => {
  const album = { slug: 'pigna' as const, title: 'Pigna', filename: 'Kuf - Pigna (2017).zip' };
  const input = (extra: Record<string, unknown> = {}) =>
    downloadSchema.parse({
      name: 'Anna',
      email: 'anna@example.com',
      album: 'pigna',
      'cf-turnstile-response': 'ok',
      ...extra,
    });

  it('due mail, link firmato valido 7 giorni, niente disiscrizione senza consenso', async () => {
    const { d, sent } = deps();
    const r = await handleDownload(input(), album, d);
    expect(r.url).toMatch(/^\/api\/download\//);
    const check = await readDownloadToken(r.url.split('/').pop()!, SECRET);
    expect(check).toMatchObject({ ok: true, payload: { a: 'pigna' } });
    expect(sent.map((m) => m.to).sort()).toEqual(['anna@example.com', 'kuf.ravenna@gmail.com']);
    const thanks = sent.find((m) => m.to === 'anna@example.com')!;
    expect(thanks.html).toContain(`https://ilsitodeikuf.it${r.url}`);
    expect(thanks.html).not.toContain('/disiscriviti/');
  });

  it('con il consenso: link di disiscrizione nella mail', async () => {
    const { d, sent } = deps();
    await handleDownload(input({ updates: 'on' }), album, d);
    expect(sent.find((m) => m.to === 'anna@example.com')!.html).toContain(
      'https://ilsitodeikuf.it/disiscriviti/',
    );
  });

  it('se le mail falliscono il download parte comunque', async () => {
    const { d } = deps({ mail: { name: 'x', send: async () => Promise.reject(new Error('down')) } });
    await expect(handleDownload(input(), album, d)).resolves.toHaveProperty('url');
  });
});
