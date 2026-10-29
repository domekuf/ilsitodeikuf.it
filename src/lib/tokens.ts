// Token firmati HMAC-SHA256 (WebCrypto): download (scadono) e disiscrizione (legati al contatto).
// Formato: base64url(JSON) + "." + base64url(firma). Niente dati personali dentro.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 16) throw new Error('segreto per i token mancante o troppo corto');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export type VerifyResult<T> = { ok: true; payload: T } | { ok: false; reason: 'invalid' | 'expired' };

/** Verifica firma (a tempo costante, via crypto.subtle.verify) e, se c'è `exp`, la scadenza. */
export async function verifyToken<T extends { exp?: number | undefined }>(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<VerifyResult<T>> {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || token.length > 1024) return { ok: false, reason: 'invalid' };
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig), enc.encode(body));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!valid) return { ok: false, reason: 'invalid' };
  let payload: T;
  try {
    payload = JSON.parse(dec.decode(fromB64url(body))) as T;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (typeof payload.exp === 'number' && payload.exp * 1000 < now) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

// ---- Download -------------------------------------------------------------

export const DOWNLOAD_DAYS = 7;
export type DownloadPayload = { a: 'pigna' | 'via-trieste'; s: number; exp: number };

export function createDownloadToken(
  album: DownloadPayload['a'],
  submissionId: number,
  secret: string,
  now = Date.now(),
) {
  const exp = Math.floor(now / 1000) + DOWNLOAD_DAYS * 24 * 3600;
  return signToken({ a: album, s: submissionId, exp } satisfies DownloadPayload, secret);
}

export async function readDownloadToken(token: string, secret: string, now = Date.now()) {
  const r = await verifyToken<DownloadPayload>(token, secret, now);
  if (!r.ok) return r;
  const p = r.payload;
  if ((p.a !== 'pigna' && p.a !== 'via-trieste') || !Number.isInteger(p.s))
    return { ok: false as const, reason: 'invalid' as const };
  return r;
}

// ---- Disiscrizione ----------------------------------------------------------

/** `n` è il salt del contatto: cambiandolo su D1 tutti i vecchi link smettono di funzionare. */
export type UnsubscribePayload = { c: number; n: string; exp?: undefined };

export function createUnsubscribeToken(contactId: number, salt: string, secret: string) {
  return signToken({ c: contactId, n: salt } satisfies UnsubscribePayload, secret);
}

export async function readUnsubscribeToken(token: string, secret: string) {
  const r = await verifyToken<UnsubscribePayload>(token, secret);
  if (!r.ok) return r;
  if (!Number.isInteger(r.payload.c) || typeof r.payload.n !== 'string')
    return { ok: false as const, reason: 'invalid' as const };
  return r;
}
