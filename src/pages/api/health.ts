// Endpoint SSR di prova (Fase 1): dimostra che il Worker risponde e che i binding sono raggiungibili.
// Non espone dati: solo quali binding esistono.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = () => {
  const bindings = {
    DB: typeof env.DB !== 'undefined',
    CACHE: typeof env.CACHE !== 'undefined',
    DOWNLOADS: typeof env.DOWNLOADS !== 'undefined',
    FORM_LIMITER: typeof env.FORM_LIMITER !== 'undefined',
  };
  return Response.json(
    { ok: true, bindings },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );
};
