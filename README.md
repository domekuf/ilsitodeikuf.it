# Il Sito dei Kuf

Il sito di una band di Ravenna che, a volte, fa la musica forte. Il nuovo sito è fatto con **Astro 7** e gira su **Cloudflare Workers**: niente server da mantenere e costi praticamente nulli.

Le decisioni di progetto stanno in [`docs/decisions.md`](docs/decisions.md).

> Stato: **Fase 2 (design system e layout)**. Le pagine con i contenuti arrivano dalla Fase 3.

## Requisiti

- **Node 24** (vedi `.nvmrc`; il minimo è 22.23.4). Con nvm basta `nvm use`.
- **npm 11**, che arriva insieme a Node 24. Con npm 10 l'installazione si blocca per un bug di npm (`Cannot read properties of null (reading 'edgesOut')`).

## Primo avvio

```sh
nvm use                     # Node 24
npm install
cp .dev.vars.example .dev.vars
npm run dev                 # http://localhost:4321
```

In sviluppo funziona tutto **senza chiavi reali**: email stampate in console, concerti da fixture, Turnstile con le chiavi di test, D1, KV e R2 simulati in locale.

## Comandi

| Comando            | Cosa fa                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `npm run dev`      | Server di sviluppo (runtime `workerd`, binding locali)                   |
| `npm run build`    | Build di produzione in `dist/`                                           |
| `npm run preview`  | Serve la build con `workerd`                                             |
| `npm run cf:dev`   | Build + `wrangler dev` (come in produzione, incluso il Cron)             |
| `npm run check`    | `astro check` + typecheck dei file Node (config e test e2e)              |
| `npm run lint`     | ESLint                                                                   |
| `npm run format`   | Prettier (scrive); `format:check` controlla soltanto                     |
| `npm test`         | Test unitari (Vitest)                                                    |
| `npm run test:e2e` | Test end-to-end (Playwright, desktop e mobile)                           |
| `npm run cf:types` | Rigenera `worker-configuration.d.ts` dopo aver cambiato `wrangler.jsonc` |
| `npm run ci`       | Tutto quello che fa la CI, tranne gli e2e                                |

La prima volta, per gli e2e, servono i browser: `npx playwright install chromium`.

Per provare il Cron della retention in locale:

```sh
npm run cf:dev -- --test-scheduled
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=17+3+*+*+*"
```

## Struttura

```
src/
  worker.ts          entrypoint del Worker: fetch (Astro) + scheduled (retention)
  assets/            logo SVG, font, texture della carta, foto
  components/
    layout/          Header, MenuOverlay, Footer, ContactModal
    social/          SocialDock (il FAB dei social)
    ui/              Modal, Button, Card, SectionTitle, Icon (+ icons.ts)
  content/site.json  menu, social, contatti, "cose vere sui Kuf"
  dev/               /styleguide (solo sviluppo)
  layouts/           BaseLayout
  pages/             route; le pagine SSR hanno `export const prerender = false`
  lib/               logica testabile (escaping, path, token, calendario, …)
  scripts/           JS lato client: modal-router.ts, social-dock.ts
  styles/global.css  Tailwind 4 + design token
scripts/             generatori degli asset (logo, texture)
migrations/          migrazioni SQL di D1 (dalla Fase 4)
tests/unit/          Vitest
tests/e2e/           Playwright
docs/                decisioni di progetto e materiali
```

## Dipendenze (e perché ci sono)

Runtime:

- `astro`: il framework del sito.
- `@astrojs/cloudflare`: adapter per Cloudflare Workers (SSR, binding, dev su `workerd`).

Sviluppo:

- `tailwindcss` e `@tailwindcss/vite`: stili con design token (§5 del brief).
- `typescript`: TypeScript `strict`. È fermo alla 6.0 perché `@astrojs/check` e `typescript-eslint` non supportano ancora TS 7.
- `@astrojs/check`: typecheck dei file `.astro`.
- `@types/node`: tipi per i file che girano in Node (config, Playwright), tenuti separati da quelli del Worker.
- `eslint`, `typescript-eslint`, `eslint-plugin-astro`, `globals`: lint. Niente `eslint-plugin-jsx-a11y`, che non supporta ESLint 10: l'accessibilità la controlla axe negli e2e.
- `prettier` e `prettier-plugin-astro`: formattazione.
- `vitest`: test unitari. È fermo alla 4.1 per restare compatibile con `@cloudflare/vitest-pool-workers` (test su D1 in Fase 4).
- `@playwright/test`: test end-to-end.
- `@axe-core/playwright`: controllo automatico dell'accessibilità (WCAG 2.2 AA) negli e2e.
- `wrangler`: CLI di Cloudflare (dev, tipi, migrazioni D1, deploy).

## Styleguide

`npm run dev` e poi http://localhost:4321/styleguide: logo, tipografia, colori (con i contrasti), bottoni, card, form, modale con URL, icone e movimento. Esiste solo in sviluppo; i test e2e la includono con `KUF_STYLEGUIDE=1`. In produzione non c'è.

## Modali con URL

Un solo meccanismo (`src/scripts/modal-router.ts`) per concerti, articoli e Contattaci:

- link: `<a href="/concerti/2017-11-17-almagia" data-modal-link="concerto">`;
- modale: `<Modal id="concerto" listUrl="/concerti" listTitle="…">`, con il titolo che ha id `concerto-title`;
- il contenuto arriva da un `<template data-modal-template="/url">` già nella pagina, oppure dal fetch della pagina di dettaglio (si prende il `[data-modal-content]` della stessa modale);
- la pagina di dettaglio renderizza la lista con `<Modal open>`: funziona anche senza JS ed è indicizzabile.

## Asset generati

- `python3 scripts/build-logo.py`: rigenera i tre SVG del logo in `src/assets/logo/` (geometria ricavata da `logo-02.png` del vecchio sito).
- `python3 scripts/build-paper.py <bground.jpg>`: rigenera la texture `src/assets/textures/paper.webp` (circa 10 KB, ripetibile).
- Font: Walkway Bold ridotto al set latin con `pyftsubset` (9 KB); Inter variable latin da Fontsource (48 KB).

Licenze: Inter (OFL 1.1, `src/assets/fonts/Inter-OFL.txt`), Simple Icons (CC0), Lucide (ISC). **Walkway: licenza da verificare** (il file dice solo "© G.M.").

## Variabili e secret

Le variabili non segrete sono in `wrangler.jsonc` → `vars`; per lo sviluppo si usano quelle di `.dev.vars.example`. Lo schema tipizzato è in `astro.config.mjs` → `env.schema`.

I secret di produzione si impostano **solo** con `wrangler secret put NOME`:
`GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_PLACES_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `DOWNLOAD_TOKEN_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`.

## Note

- **Vecchio sito:** `old-ilsitodeikuf.it/` è escluso da git perché contiene credenziali. Non va mai committato.
- **Astro e agenti AI:** se Astro 7 rileva un agente AI, `astro dev` e `astro preview` partono in background (si fermano con `astro dev stop` o `astro preview stop`). La config di Playwright usa `--ignore-lock` per tenerli in primo piano.
- **Deploy:** non è configurato. Si aggiunge in Fase 7, dopo l'ok.
- **Passi manuali** (Google Cloud, Cloudflare, Resend, DNS): la checklist completa arriva in Fase 7.

Da completare nelle prossime fasi: come aggiungere un concerto (convenzioni della descrizione dell'evento), un articolo e un disco.
