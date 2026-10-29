import { describe, expect, it, vi } from 'vitest';
import { CALENDAR_SCOPE, TOKEN_URL, getAccessToken, importPrivateKey, signJwt } from '~/lib/google-auth';
import { memoryKV } from './helpers/kv';

// Coppia RSA generata al volo: la privata in PEM PKCS8, come nel JSON di Google.
async function keyPair() {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n');
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`,
    publicKey: pair.publicKey,
  };
}

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

describe('JWT del service account', async () => {
  const { pem, publicKey } = await keyPair();
  const account = { email: 'sito@kuf.iam.gserviceaccount.com', privateKey: pem };

  it('header e claim giusti, firma RS256 verificabile', async () => {
    const jwt = await signJwt(account, CALENDAR_SCOPE, 1_800_000_000);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h!)))).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(new TextDecoder().decode(fromB64url(c!)))).toEqual({
      iss: account.email,
      scope: CALENDAR_SCOPE,
      aud: TOKEN_URL,
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      fromB64url(s!),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });

  it('accetta la chiave con i "\\n" letterali (com’è nei secret) e le virgolette', async () => {
    const escaped = `"${pem.replace(/\n/g, '\\n')}"`;
    await expect(importPrivateKey(escaped)).resolves.toBeDefined();
  });

  it('scambia il JWT e tiene il token in KV per 50 minuti', async () => {
    const kv = memoryKV();
    const fake = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
      expect(body.get('assertion')?.split('.')).toHaveLength(3);
      return Response.json({ access_token: 'ya29.token', expires_in: 3599 });
    });
    const deps = { kv, fetch: fake as typeof fetch };
    expect(await getAccessToken(account, CALENDAR_SCOPE, deps)).toBe('ya29.token');
    expect(await getAccessToken(account, CALENDAR_SCOPE, deps)).toBe('ya29.token');
    expect(fake).toHaveBeenCalledTimes(1);
    expect(kv.puts[0]?.ttl).toBe(2999);
    expect(kv.puts[0]?.key).not.toContain(account.email);
  });

  it('errore del token endpoint → eccezione', async () => {
    const fake = async () => new Response('{"error":"invalid_grant"}', { status: 400 });
    await expect(getAccessToken(account, CALENDAR_SCOPE, { fetch: fake as typeof fetch })).rejects.toThrow(
      '400',
    );
  });
});
