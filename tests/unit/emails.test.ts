import { describe, expect, it } from 'vitest';
import { cleanSubject, contactNotification } from '~/emails/contactNotification';
import { downloadNotification } from '~/emails/downloadNotification';
import { downloadThankYou } from '~/emails/downloadThankYou';

const EVIL = '<img src=x onerror=alert(1)>"\'&';

describe('escaping nelle mail', () => {
  it('contatto: nessun input dell’utente entra come HTML', () => {
    const m = contactNotification({
      name: EVIL,
      email: 'x@example.com',
      subject: EVIL,
      message: `${EVIL}\nseconda riga`,
      page: '/articoli',
      updates: true,
    });
    expect(m.html).not.toContain('<img src=x');
    expect(m.html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
    expect(m.html).toContain('<br>seconda riga');
    expect(m.text).toContain('seconda riga');
  });

  it('download: notifica e ringraziamento escapati', () => {
    const n = downloadNotification({
      name: EVIL,
      email: 'x@example.com',
      message: EVIL,
      albumTitle: 'Pigna',
      updates: false,
    });
    const t = downloadThankYou({
      name: EVIL,
      albumTitle: 'Pigna',
      downloadUrl: 'https://ilsitodeikuf.it/api/download/t"x',
      days: 7,
    });
    for (const html of [n.html, t.html]) expect(html).not.toContain('<img src=x');
    expect(t.html).toContain('href="https://ilsitodeikuf.it/api/download/t&quot;x"');
  });

  it('ringraziamento: link di disiscrizione solo se c’è il consenso', () => {
    const base = { name: 'Anna', albumTitle: 'Pigna', downloadUrl: 'https://x/d', days: 7 };
    expect(downloadThankYou(base).html).not.toContain('Non voglio più ricevere notizie');
    expect(downloadThankYou({ ...base, unsubscribeUrl: 'https://x/u' }).html).toContain(
      'Non voglio più ricevere notizie',
    );
    expect(downloadThankYou(base).html).toContain('A presto, Anna!');
  });
});

describe('oggetto', () => {
  it('niente a capo (header injection) e lunghezza contenuta', () => {
    expect(cleanSubject('ciao\r\nBcc: tutti@example.com')).toBe('ciao Bcc: tutti@example.com');
    expect(cleanSubject('x'.repeat(500))).toHaveLength(140);
  });
  it('articolo nell’oggetto', () => {
    const m = contactNotification({
      name: 'Anna',
      email: 'a@example.com',
      message: 'M',
      articolo: { slug: 'felpa', nome: 'Felpa grigia con il gufo' },
      updates: false,
    });
    expect(m.subject).toBe('[articolo] Felpa grigia con il gufo');
  });
});
