// Solo con MAIL_PROVIDER=log (sviluppo e test e2e): le ultime mail "inviate".
// In produzione (resend/cloudflare) risponde 404.
import type { APIRoute } from 'astro';
import { MAIL_PROVIDER } from 'astro:env/server';
import { readOutbox } from '~/lib/mail/log';

export const prerender = false;

export const GET: APIRoute = () => {
  if (MAIL_PROVIDER !== 'log') return new Response('Not found', { status: 404 });
  return Response.json(readOutbox(), { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
};
