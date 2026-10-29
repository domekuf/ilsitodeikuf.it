// Rate limit con il binding di Workers (ADR-012): 3 invii al minuto per IP e per form.
// L'IP non si salva da nessuna parte: diventa un hash solo per costruire la chiave.

type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function checkRateLimit(
  limiter: Limiter | undefined,
  ip: string | null,
  action: string,
): Promise<boolean> {
  if (!limiter) return true; // binding assente (es. test): non blocchiamo
  const key = `${action}:${await sha256(ip ?? 'sconosciuto')}`;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true; // se il limiter non risponde non perdiamo il messaggio: Turnstile resta a proteggere
  }
}
