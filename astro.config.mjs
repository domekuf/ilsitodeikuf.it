// @ts-check
import { createHash } from 'node:crypto';
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

import { DOCK_SEEN_SCRIPT } from './src/lib/inline-scripts.mjs';

const sha256 = (text) => `sha256-${createHash('sha256').update(text).digest('base64')}`;

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: 'https://ilsitodeikuf.it',
  // Statico di default: le pagine dinamiche dichiarano `export const prerender = false`.
  output: 'static',
  trailingSlash: 'never',
  // /contattaci.html invece di /contattaci/index.html: niente redirect con lo slash finale
  // CSS inline in ogni pagina: ~10 KB gzip, una richiesta bloccante in meno (ADR-057)
  build: { format: 'file', inlineStylesheets: 'always' },

  adapter: cloudflare({
    // ADR-006: immagini ottimizzate in build, nessuna trasformazione a runtime.
    imageService: { build: 'compile', runtime: 'passthrough' },
  }),

  integrations: [styleguide()],

  // Niente blocchi di codice nei contenuti: Shiki userebbe stili inline, incompatibili con la CSP.
  markdown: { syntaxHighlight: false },

  // CSP (§8.4, ADR-060): Astro mette in ogni pagina un <meta> con gli hash di script e stili suoi.
  // Le direttive che il <meta> non supporta (frame-ancestors) arrivano come header (public/_headers e
  // src/middleware.ts). Nessuno stile inline negli attributi: solo classi.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        // foto delle venue (Google) e quelle indicate a mano con `foto:` (qualsiasi https)
        "img-src 'self' data: https:",
        "font-src 'self'",
        // beacon di Cloudflare Web Analytics
        "connect-src 'self' https://cloudflareinsights.com",
        // embed caricati solo al clic + widget Turnstile
        'frame-src https://www.youtube-nocookie.com https://open.spotify.com https://www.google.com https://challenges.cloudflare.com',
        "media-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'upgrade-insecure-requests',
      ],
      scriptDirective: {
        // gli script is:inline scritti a mano non li hasha Astro: lo facciamo noi
        hashes: [sha256(DOCK_SEEN_SCRIPT)],
        resources: ["'self'", 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com'],
      },
      styleDirective: { resources: ["'self'"] },
    },
  },

  // Redirect 301 dai vecchi URL (§7.11). /download.php dipende dalla query: è in src/pages/download.php.ts.
  redirects: {
    '/index.php': { status: 301, destination: '/' },
    '/via-trieste.php': { status: 301, destination: '/via-trieste' },
    '/concerti.php': { status: 301, destination: '/concerti' },
    '/magliette.php': { status: 301, destination: '/articoli' },
    '/contatti.php': { status: 301, destination: '/contattaci' },
    '/press.php': { status: 301, destination: '/press' },
    '/public/Pigna.zip': { status: 301, destination: '/pigna' },
    '/public/ViaTrieste.zip': { status: 301, destination: '/via-trieste' },
    '/public/scheda-tecnica.pdf': { status: 301, destination: '/press/scheda-tecnica.pdf' },
    '/public/stage-plan.pdf': { status: 301, destination: '/press/stage-plan.pdf' },
    '/public/lista-canali.pdf': { status: 301, destination: '/press' },
  },

  // ADR-009: font self-hosted con la Fonts API (preload e fallback con metriche corrette).
  fonts: [
    {
      provider: fontProviders.local(),
      // Titoli: Montserrat Light (OFL) al posto di Walkway, che non ha una licenza (ADR-031).
      name: 'Montserrat',
      cssVariable: '--font-montserrat',
      fallbacks: ['sans-serif'],
      options: {
        variants: [{ src: ['./src/assets/fonts/montserrat-light.woff2'], weight: 300, style: 'normal' }],
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
      // letta a runtime dal server (il dettaglio concerti è SSR): funziona da .dev.vars e da wrangler.jsonc → vars
      GOOGLE_MAPS_EMBED_KEY: envField.string({ context: 'server', access: 'public', optional: true }),

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
