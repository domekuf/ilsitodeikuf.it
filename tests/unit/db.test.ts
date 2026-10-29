import { beforeEach, describe, expect, it } from 'vitest';
import {
  getUnsubscribeSalt,
  incrementDownload,
  revokeUpdates,
  saveSubmission,
  updatesOptIn,
} from '~/lib/db/contacts';
import { runRetention } from '~/lib/db/retention';
import { createD1 } from './helpers/d1';

const base = {
  name: 'Anna',
  email: 'Anna@Example.com ',
  type: 'download' as const,
  ref: 'pigna',
  consentSource: 'form:download:pigna',
  consentTextVersion: '2026-11-v1',
};

let db: ReturnType<typeof createD1>;
beforeEach(() => {
  db = createD1();
});

const count = (sql: string) => (db.raw.prepare(sql).get() as { n: number }).n;

describe('contatti e consensi', () => {
  it('upsert per email normalizzata: un contatto, due richieste, nome aggiornato', async () => {
    const a = await saveSubmission(db, { ...base, updatesConsent: false });
    const b = await saveSubmission(db, {
      ...base,
      name: 'Anna B.',
      email: 'anna@example.com',
      updatesConsent: false,
    });
    expect(a.contactId).toBe(b.contactId);
    expect(a.unsubscribeSalt).toBe(b.unsubscribeSalt);
    expect(count('SELECT count(*) n FROM contacts')).toBe(1);
    expect(count('SELECT count(*) n FROM submissions')).toBe(2);
    expect(db.raw.prepare('SELECT name, email FROM contacts').get()).toEqual({
      name: 'Anna B.',
      email: 'anna@example.com',
    });
  });

  it('consenso registrato solo se la casella è spuntata', async () => {
    const r = await saveSubmission(db, { ...base, updatesConsent: false });
    expect(count('SELECT count(*) n FROM consents')).toBe(0);
    expect(await updatesOptIn(db, r.contactId)).toBe(false);
    await saveSubmission(db, { ...base, updatesConsent: true });
    expect(await updatesOptIn(db, r.contactId)).toBe(true);
  });

  it('casella non spuntata la volta dopo: il consenso precedente resta', async () => {
    const r = await saveSubmission(db, { ...base, updatesConsent: true });
    await saveSubmission(db, { ...base, type: 'contact', ref: null, updatesConsent: false });
    expect(await updatesOptIn(db, r.contactId)).toBe(true);
  });

  it('revoca: nuova riga granted=0, registro append-only', async () => {
    const r = await saveSubmission(db, { ...base, updatesConsent: true });
    await revokeUpdates(db, r.contactId, '2026-11-v1');
    expect(await updatesOptIn(db, r.contactId)).toBe(false);
    expect(count('SELECT count(*) n FROM consents')).toBe(2);
    expect(await getUnsubscribeSalt(db, r.contactId)).toBe(r.unsubscribeSalt);
  });

  it('conta i download', async () => {
    const r = await saveSubmission(db, { ...base, updatesConsent: false });
    await incrementDownload(db, r.submissionId);
    await incrementDownload(db, r.submissionId);
    expect(count('SELECT download_count n FROM submissions')).toBe(2);
  });

  it('input con apici e SQL non fa danni (query parametrizzate)', async () => {
    await saveSubmission(db, { ...base, name: "Robert'); DROP TABLE contacts;--", updatesConsent: false });
    expect(count('SELECT count(*) n FROM contacts')).toBe(1);
  });
});

describe('retention', () => {
  const old = (table: string, id: number) =>
    db.raw.exec(
      `UPDATE ${table} SET ${table === 'contacts' ? 'updated_at' : 'created_at'} = datetime('now','-25 months') WHERE id = ${id}`,
    );

  it('cancella richieste vecchie e contatti senza consenso, tiene gli iscritti', async () => {
    const vecchio = await saveSubmission(db, {
      ...base,
      email: 'vecchio@example.com',
      updatesConsent: false,
    });
    const iscritto = await saveSubmission(db, {
      ...base,
      email: 'iscritto@example.com',
      updatesConsent: true,
    });
    const recente = await saveSubmission(db, {
      ...base,
      email: 'recente@example.com',
      updatesConsent: false,
    });
    for (const r of [vecchio, iscritto]) {
      old('submissions', r.submissionId);
      old('contacts', r.contactId);
    }

    const res = await runRetention(db, 24);
    expect(res).toEqual({ submissions: 2, contacts: 1 });
    const emails = (
      db.raw.prepare('SELECT email FROM contacts ORDER BY email').all() as { email: string }[]
    ).map((r) => r.email);
    expect(emails).toEqual(['iscritto@example.com', 'recente@example.com']);
    expect(count(`SELECT count(*) n FROM submissions WHERE contact_id = ${recente.contactId}`)).toBe(1);
  });

  it('dopo una revoca il contatto vecchio se ne va, con i suoi consensi', async () => {
    const r = await saveSubmission(db, { ...base, updatesConsent: true });
    await revokeUpdates(db, r.contactId, 'v');
    old('submissions', r.submissionId);
    old('contacts', r.contactId);
    await runRetention(db, 24);
    expect(count('SELECT count(*) n FROM contacts')).toBe(0);
    expect(count('SELECT count(*) n FROM consents')).toBe(0);
  });

  it('rifiuta valori assurdi', async () => {
    await expect(runRetention(db, 0)).rejects.toThrow();
  });
});
