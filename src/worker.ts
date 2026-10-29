// Entrypoint del Worker (ADR-004).
// - fetch: tutto il sito, gestito da Astro, con gli header di sicurezza (§8.4).
// - scheduled: Cron Trigger giornaliero per la retention dei dati su D1 (§8.5).
import { handle } from '@astrojs/cloudflare/handler';
import { runRetention } from './lib/db/retention';
import { withSecurityHeaders } from './lib/security-headers';

export default {
  async fetch(request, env, ctx) {
    // www → dominio principale (vale per le richieste che arrivano al Worker; per gli asset statici
    // serve anche la Redirect Rule nel pannello Cloudflare, vedi docs/go-live.md)
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return withSecurityHeaders(Response.redirect(url.href, 301));
    }
    return withSecurityHeaders(await handle(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    const months = Number(env.RETENTION_MONTHS ?? 24);
    ctx.waitUntil(
      runRetention(env.DB, months).then(
        (r) =>
          console.log(
            `[retention] ${controller.cron}: ${r.submissions} richieste e ${r.contacts} contatti cancellati`,
          ),
        (e) => console.error(`[retention] errore: ${e instanceof Error ? e.message : 'sconosciuto'}`),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
