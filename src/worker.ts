// Entrypoint del Worker (ADR-004).
// - fetch: tutto il sito, gestito da Astro.
// - scheduled: Cron Trigger giornaliero per la retention dei dati su D1 (implementata in Fase 4).
import { handle } from '@astrojs/cloudflare/handler';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },

  scheduled(controller, _env, _ctx) {
    // TODO(Fase 4): cancellare submissions più vecchie di RETENTION_MONTHS e contatti senza consenso attivo.
    console.log(`[retention] cron "${controller.cron}": nessuna azione (non ancora implementata)`);
  },
} satisfies ExportedHandler<Env>;
