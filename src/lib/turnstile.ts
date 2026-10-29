// Verifica lato server di Cloudflare Turnstile (§8.4).
// Con le chiavi di test ufficiali non si chiama la rete: 1x… passa sempre, 2x… e 3x… falliscono.
// Così dev, CI e test e2e funzionano offline; in produzione si usa il secret vero.

export const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function isTestSecret(secret: string): boolean {
  return /^[123]x0{31}AA$/.test(secret);
}
export function isTestSiteKey(siteKey: string): boolean {
  return /^[123]x0{20}A[AB]$/.test(siteKey) || /^[123]x0{20}(BB|FF)$/.test(siteKey);
}

export async function verifyTurnstile(
  token: string | null | undefined,
  secret: string,
  remoteIp?: string | null,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  if (isTestSecret(secret)) return secret.startsWith('1x') && token === DUMMY_TOKEN;
  try {
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', token);
    if (remoteIp) body.append('remoteip', remoteIp);
    const res = await fetcher(SITEVERIFY, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
