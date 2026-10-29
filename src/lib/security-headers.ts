// Header di sicurezza (§8.4). Valgono per tutto il sito:
// - pagine statiche e asset: public/_headers (li applica Cloudflare, il Worker non li vede);
// - risposte del Worker (SSR, Actions, API, redirect): src/worker.ts con withSecurityHeaders().
// Un test controlla che le due liste coincidano.
//
// La CSP vera (script e stili con gli hash) è nel <meta> che genera Astro (astro.config.mjs → security.csp):
// qui solo le direttive che un <meta> non può dare.
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // senza includeSubDomains: eventuali sottodomini di Aruba (webmail, …) potrebbero essere solo http
  'Strict-Transport-Security': 'max-age=31536000',
};

/** Aggiunge gli header di sicurezza a una risposta (senza toccare quelli già impostati). */
export function withSecurityHeaders(response: Response): Response {
  // le risposte di fetch() o i redirect possono avere header immutabili: si ricrea la risposta
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    const current = out.headers.get(name);
    if (!current) out.headers.set(name, value);
    // le pagine SSR hanno già la CSP di Astro (con gli hash, object-src e base-uri compresi) come header:
    // manca solo frame-ancestors, che non si può mettere nel <meta>
    else if (name === 'Content-Security-Policy' && !current.includes('frame-ancestors')) {
      out.headers.set(name, `${current.replace(/;?\s*$/, ';')} frame-ancestors 'none'`);
    }
  }
  return out;
}
