// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

/**
 * /styleguide esiste solo in sviluppo, oppure quando KUF_STYLEGUIDE=1 (build dei test e2e).
 * @returns {import('astro').AstroIntegration}
 */
function styleguide() {
  return {
    name: 'kuf-styleguide',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command !== 'dev' && process.env.KUF_STYLEGUIDE !== '1') return;
        injectRoute({ pattern: '/styleguide', entrypoint: './src/dev/routes/styleguide.astro' });
        injectRoute({
          pattern: '/styleguide/esempio/[slug]',
          entrypoint: './src/dev/routes/styleguide-example.astro',
        });
      },
    },
  };
}

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: 'https://ilsitodeikuf.it',
  // Statico di default: le pagine dinamiche dichiarano `export const prerender = false`.
  output: 'static',
  trailingSlash: 'never',
  // /contattaci.html invece di /contattaci/index.html: niente redirect con lo slash finale
  build: { format: 'file' },

  adapter: cloudflare({
    // ADR-006: immagini ottimizzate in build, nessuna trasformazione a runtime.
    imageService: { build: 'compile', runtime: 'passthrough' },
  }),

  integrations: [styleguide()],

  // ADR-009: font self-hosted con la Fonts API (preload e fallback con metriche corrette).
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Walkway',
      cssVariable: '--font-walkway',
      fallbacks: ['sans-serif'],
      options: {
        variants: [{ src: ['./src/assets/fonts/walkway-bold.woff2'], weight: 700, style: 'normal' }],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Inter',
      cssVariable: '--font-inter',
      fallbacks: ['sans-serif'],
      options: {
        variants: [{ src: ['./src/assets/fonts/inter-latin-var.woff2'], weight: '100 900', style: 'normal' }],
      },
    },
  ],

  // ADR-005: non usiamo le sessioni di Astro (evita il namespace KV "SESSION").
  session: false,

  // Variabili tipizzate (ADR-003). In dev tutto ha un default sicuro, senza chiavi reali.
  env: {
    schema: {
      GOOGLE_CALENDAR_ID: envField.string({ context: 'server', access: 'public', optional: true }),
      CALENDAR_QUERY: envField.string({ context: 'server', access: 'public', default: 'Kuf @' }),
      CALENDAR_SOURCE: envField.enum({
        context: 'server',
        access: 'public',
        values: ['google', 'fixture'],
        default: 'fixture',
      }),
      MAIL_PROVIDER: envField.enum({
        context: 'server',
        access: 'public',
        values: ['resend', 'cloudflare', 'log'],
        default: 'log',
      }),
      MAIL_FROM: envField.string({
        context: 'server',
        access: 'public',
        default: 'Il Sito dei Kuf <sito@ilsitodeikuf.it>',
      }),
      MAIL_TO: envField.string({ context: 'server', access: 'public', default: 'kuf.ravenna@gmail.com' }),
      CONSENT_TEXT_VERSION: envField.string({ context: 'server', access: 'public', default: '2026-11-v1' }),
      RETENTION_MONTHS: envField.number({ context: 'server', access: 'public', default: 24 }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({
        context: 'client',
        access: 'public',
        // Chiave di test ufficiale: passa sempre.
        default: '1x00000000000000000000AA',
      }),
      PUBLIC_GOOGLE_MAPS_EMBED_KEY: envField.string({ context: 'client', access: 'public', optional: true }),

      GOOGLE_SA_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_SA_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_PLACES_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        // Chiave di test ufficiale: passa sempre. In produzione va impostato il secret vero.
        default: '1x0000000000000000000000000000000AA',
      }),
      DOWNLOAD_TOKEN_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      UNSUBSCRIBE_TOKEN_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
