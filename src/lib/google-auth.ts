// Access token Google per un service account (§8.1), senza librerie: JWT RS256 firmato con WebCrypto
// e scambiato con https://oauth2.googleapis.com/token (grant jwt-bearer).
// Il token dura un'ora: lo teniamo in KV per 50 minuti, così le richieste non rifirmano ogni volta.

export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

const TOKEN_TTL_SECONDS = 50 * 60;

export type ServiceAccount = { email: string; privateKey: string };

type Deps = {
  kv?: KVNamespace | undefined;
  fetch?: typeof fetch;
  now?: () => number;
};

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const b64urlJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

/**
 * Chiave PKCS8 dal secret. Accetta il PEM com'è nel JSON di Google, anche con i "\n" letterali
 * (succede incollandolo in `wrangler secret put` o in .dev.vars) e con le virgolette intorno.
 */
export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/^["']|["']$/g, '')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('GOOGLE_SA_PRIVATE_KEY vuota');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

/** JWT firmato per lo scambio con il token endpoint. */
export async function signJwt(account: ServiceAccount, scope: string, nowSeconds: number): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: account.email,
    scope,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const input = `${b64urlJson(header)}.${b64urlJson(claims)}`;
  const key = await importPrivateKey(account.privateKey);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(signature))}`;
}

async function cacheKey(account: ServiceAccount, scope: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${account.email} ${scope}`));
  return `google:token:v1:${b64url(new Uint8Array(digest)).slice(0, 22)}`;
}

/** Access token valido per lo scope, preso da KV se c'è, altrimenti chiesto a Google. */
export async function getAccessToken(
  account: ServiceAccount,
  scope: string = CALENDAR_SCOPE,
  deps: Deps = {},
): Promise<string> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const key = deps.kv ? await cacheKey(account, scope) : '';

  const cached = deps.kv ? await deps.kv.get(key).catch(() => null) : null;
  if (cached) return cached;

  const assertion = await signJwt(account, scope, Math.floor(now() / 1000));
  const res = await doFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`token Google: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('token Google: risposta senza access_token');

  if (deps.kv) {
    const ttl = Math.max(60, Math.min(TOKEN_TTL_SECONDS, (data.expires_in ?? 3600) - 600));
    await deps.kv.put(key, data.access_token, { expirationTtl: ttl }).catch(() => undefined);
  }
  return data.access_token;
}
