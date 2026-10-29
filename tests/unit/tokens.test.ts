import { describe, expect, it } from 'vitest';
import {
  createDownloadToken,
  createUnsubscribeToken,
  readDownloadToken,
  readUnsubscribeToken,
  signToken,
  verifyToken,
} from '~/lib/tokens';

const SECRET = 'segreto-di-test-lungo-almeno-32-byte!!';
const NOW = Date.UTC(2026, 10, 1);

describe('token di download', () => {
  it('valido entro 7 giorni', async () => {
    const t = await createDownloadToken('pigna', 42, SECRET, NOW);
    const r = await readDownloadToken(t, SECRET, NOW + 6 * 86400_000);
    expect(r).toMatchObject({ ok: true, payload: { a: 'pigna', s: 42 } });
  });

  it('scaduto dopo 7 giorni', async () => {
    const t = await createDownloadToken('pigna', 42, SECRET, NOW);
    expect(await readDownloadToken(t, SECRET, NOW + 7 * 86400_000 + 1000)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('manomesso: payload cambiato', async () => {
    const t = await createDownloadToken('pigna', 42, SECRET, NOW);
    const [, sig] = t.split('.');
    const forged = btoa(JSON.stringify({ a: 'via-trieste', s: 42, exp: 9999999999 })).replace(/=+$/, '');
    expect(await readDownloadToken(`${forged}.${sig}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('manomesso: firma con un altro segreto', async () => {
    const t = await createDownloadToken('pigna', 42, 'un-altro-segreto-lungo-abbastanza', NOW);
    expect(await readDownloadToken(t, SECRET, NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('formati strani non rompono niente', async () => {
    for (const bad of ['', 'abc', 'a.b.c', '.', '%%%.%%%', 'x'.repeat(5000)]) {
      expect((await verifyToken(bad, SECRET)).ok).toBe(false);
    }
  });

  it('album non previsto: rifiutato anche se firmato', async () => {
    const t = await signToken({ a: 'altro', s: 1, exp: 9999999999 }, SECRET);
    expect(await readDownloadToken(t, SECRET)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rifiuta segreti troppo corti', async () => {
    await expect(signToken({}, 'corto')).rejects.toThrow();
  });
});

describe('token di disiscrizione', () => {
  it('lega contatto e salt', async () => {
    const t = await createUnsubscribeToken(7, 'abc123', SECRET);
    expect(await readUnsubscribeToken(t, SECRET)).toMatchObject({ ok: true, payload: { c: 7, n: 'abc123' } });
  });
});
