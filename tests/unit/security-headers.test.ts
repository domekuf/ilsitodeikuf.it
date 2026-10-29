import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS, withSecurityHeaders } from '~/lib/security-headers';

describe('header di sicurezza', () => {
  it('public/_headers (pagine statiche) e il Worker usano gli stessi valori', () => {
    const file = readFileSync('public/_headers', 'utf8');
    const block = file.split(/^\/\*\s*$/m)[1]!.split(/\n\s*\n/)[0]!;
    const fromFile = Object.fromEntries(
      block
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]),
    );
    expect(fromFile).toEqual(SECURITY_HEADERS);
  });

  it('withSecurityHeaders non sovrascrive quelli già impostati e funziona sui redirect', () => {
    const res = withSecurityHeaders(new Response('x', { headers: { 'X-Frame-Options': 'SAMEORIGIN' } }));
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const redirect = withSecurityHeaders(Response.redirect('https://ilsitodeikuf.it/', 301));
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});

describe('CSP delle pagine SSR', () => {
  it('aggiunge frame-ancestors alla CSP di Astro senza perdere gli hash', () => {
    const res = withSecurityHeaders(
      new Response('x', { headers: { 'Content-Security-Policy': "script-src 'self' 'sha256-abc';" } }),
    );
    const csp = res.headers.get('Content-Security-Policy')!;
    expect(csp).toContain("'sha256-abc'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp.match(/object-src/g)).toBeNull(); // niente direttive doppie
  });
});
