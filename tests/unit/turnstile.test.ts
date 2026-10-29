import { describe, expect, it, vi } from 'vitest';
import { DUMMY_TOKEN, isTestSecret, isTestSiteKey, verifyTurnstile } from '~/lib/turnstile';

const PASS = '1x0000000000000000000000000000000AA';
const FAIL = '2x0000000000000000000000000000000AA';

describe('verifyTurnstile', () => {
  it('token mancante: rifiutato senza chiamare la rete', async () => {
    const fetcher = vi.fn();
    expect(await verifyTurnstile('', 'segreto-vero', null, fetcher)).toBe(false);
    expect(await verifyTurnstile(undefined, 'segreto-vero', null, fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('chiavi di test: 1x passa solo col token finto, 2x fallisce sempre', async () => {
    expect(await verifyTurnstile(DUMMY_TOKEN, PASS)).toBe(true);
    expect(await verifyTurnstile('altro', PASS)).toBe(false);
    expect(await verifyTurnstile(DUMMY_TOKEN, FAIL)).toBe(false);
  });

  it('secret vero: chiede a siteverify e rispetta la risposta', async () => {
    const ok = vi.fn(async () => Response.json({ success: true }));
    const ko = vi.fn(async () =>
      Response.json({ success: false, 'error-codes': ['invalid-input-response'] }),
    );
    expect(await verifyTurnstile('tok', 'segreto-vero', '1.2.3.4', ok as unknown as typeof fetch)).toBe(true);
    expect(await verifyTurnstile('tok', 'segreto-vero', null, ko as unknown as typeof fetch)).toBe(false);
    const body = (ok.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('rete in errore: rifiutato', async () => {
    const boom = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await verifyTurnstile('tok', 'segreto-vero', null, boom as unknown as typeof fetch)).toBe(false);
  });

  it('riconosce le chiavi di test', () => {
    expect(isTestSecret(PASS)).toBe(true);
    expect(isTestSecret('0x4AAAAAAA-vera')).toBe(false);
    expect(isTestSiteKey('1x00000000000000000000AA')).toBe(true);
    expect(isTestSiteKey('0x4AAAAAAAvera')).toBe(false);
  });
});
