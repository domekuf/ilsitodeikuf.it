# Il Sito dei Kuf

Il sito di una band di Ravenna che, a volte, fa la musica forte. Il nuovo sito è fatto con **Astro 7** e gira su **Cloudflare Workers**: niente server da mantenere e costi praticamente nulli.

Le decisioni di progetto stanno in [`docs/decisions.md`](docs/decisions.md).

> Stato: **Fase 4 (form, email, D1)**. I concerti arrivano in Fase 5.

## Requisiti

- **Node 24** (vedi `.nvmrc`; il minimo è 22.23.4). Con nvm basta `nvm use`.
- **npm 11**, che arriva insieme a Node 24. Con npm 10 l'installazione si blocca per un bug di npm (`Cannot read properties of null (reading 'edgesOut')`).

## Primo avvio

```sh
nvm use                     # Node 24
npm install
npm run setup:local         # .dev.vars, D1 locale migrato, zip finti su R2 locale
npm run dev                 # http://localhost:4321
```

In sviluppo funziona tutto **senza chiavi reali**: email stampate in console, concerti da fixture, Turnstile con le chiavi di test, D1, KV e R2 simulati in locale.

## Comandi

| Comando                     | Cosa fa                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`               | Server di sviluppo (runtime `workerd`, binding locali)                   |
| `npm run build`             | Build di produzione in `dist/`                                           |
| `npm run preview`           | Serve la build con `workerd`                                             |
| `npm run cf:dev`            | Build + `wrangler dev` (come in produzione, incluso il Cron)             |
| `npm run check`             | `astro check` + typecheck dei file Node (config e test e2e)              |
| `npm run lint`              | ESLint                                                                   |
| `npm run format`            | Prettier (scrive); `format:check` controlla soltanto                     |
| `npm test`                  | Test unitari (Vitest)                                                    |
| `npm run test:e2e`          | Test end-to-end (Playwright, desktop e mobile)                           |
| `npm run cf:types`          | Rigenera `worker-configuration.d.ts` dopo aver cambiato `wrangler.jsonc` |
| `npm run ci`                | Tutto quello che fa la CI, tranne gli e2e                                |
| `npm run deploy:check`      | Controlla che la configurazione sia pronta per la produzione             |
| `npm run deploy`            | Controllo + build + `wrangler deploy`. **Solo dopo l'ok della band**     |
| `npm run db:migrate:remote` | Migrazioni D1 sul database di produzione                                 |
| `npm run og`                | Rigenera le immagini Open Graph di home e concerti                       |

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
- (nessuna dipendenza per i video: la facade di YouTube è un componente nostro di poche righe, `src/components/album/VideoList.astro`)
- (nessuna dipendenza per Google: il JWT del service account si firma con WebCrypto in `src/lib/google-auth.ts`, Calendar e Places si chiamano con `fetch`)
- `@axe-core/playwright`: controllo automatico dell'accessibilità (WCAG 2.2 AA) negli e2e.
- `wrangler`: CLI di Cloudflare (dev, tipi, migrazioni D1, deploy).

## Come aggiornare i contenuti

### Un articolo (maglietta, felpa, …)

1. Metti la foto in `src/content/articoli/images/` (JPG, lato lungo almeno 1200 px).
2. Crea `src/content/articoli/<slug>.md`, per esempio `maglietta-nera.md`. Lo slug diventa l'URL: `/articoli/maglietta-nera`.

```md
---
nome: Maglietta nera con la pigna
immagine: ./images/maglietta-nera.jpg
alt: Maglietta nera indossata, con la pigna stampata in bianco
disponibile: true # false = badge "Finito" e form "avvisatemi se torna"
ordine: 6 # posizione nella griglia
# galleria:         # foto in più, facoltative
#   - src: ./images/maglietta-nera-retro.jpg
#     alt: Il retro della maglietta
---

Descrizione facoltativa, in Markdown.
```

Niente prezzi: lo schema non li prevede, di proposito.

### Un concerto

I concerti si gestiscono **solo** dal Google Calendar "Kuf che fanno i concerti". Il sito li rilegge al massimo ogni 15 minuti.

- **Titolo**: `Kuf @ Città - Locale`, con gli ospiti in coda: `Kuf @ Ravenna - Almagià w/ Nemesi`. Il sito mostra il locale come titolo, poi città e "con Nemesi". Senza `-` (es. `Kuf @ Longiano`) va bene lo stesso: la città si prova a ricavare dall'indirizzo.
- **Solo gli eventi che cominciano con `Kuf @`** finiscono sul sito (si cambia con `CALENDAR_QUERY`). Prove, date rosse e simili restano private. Per togliere un concerto annullato: cancellalo, oppure rinominalo (es. `annullato @ …`).
- **Orario**: evento "tutto il giorno" → sul sito "Orario da definire" finché non c'è il concerto; evento con orario → "ore 21:30" (solo l'inizio: la fine dell'evento non si mostra, serve solo al file .ics).
- **Luogo**: il campo "Luogo" dell'evento (meglio se con l'indirizzo, così Google Maps e le foto lo trovano). Si può andare a capo: `Artificerie Almagià` ↵ `Via dell'Almagià 2, 48122 Ravenna RA`.
- **Descrizione**: il sito legge **solo** queste righe, tutto il resto non esce mai (ci potete scrivere note private):

  ```
  link: https://esempio.it/evento
  link: Biglietti | https://esempio.it/biglietti
  foto: https://esempio.it/foto-del-posto.jpg
  ```

  `link:` aggiunge un link nel dettaglio (etichetta facoltativa prima della `|`, altrimenti "Evento / biglietti"). `foto:` (solo https, fino a 3) sostituisce le foto prese da Google Maps.

- **URL**: `/concerti/AAAA-MM-GG-locale` (es. `/concerti/2026-11-01-cisim`). Due concerti nello stesso posto lo stesso giorno: il secondo prende `-2`. Cambiando data o locale cambia anche l'URL.

### Un disco

1. Cover quadrata in `src/assets/covers/` (almeno 1200 px).
2. `src/content/albums/<slug>.md` con titolo, anno, sottotitolo, tracklist, video (ID YouTube, `start` facoltativo in secondi), link d'ascolto e la chiave dello zip su R2. Vedi `pigna.md` come esempio.
3. La pagina: copia `src/pages/pigna.astro` in `src/pages/<slug>.astro` e cambia lo slug. Poi aggiungi la voce in `src/content/site.json` → `nav`.
4. Video: dopo averli aggiunti, `node scripts/build-video-thumbs.mjs`.
5. Lo zip: aggiungi il disco in `scripts/build-album-zips.py` e `scripts/upload-downloads.sh`.

### Il press kit

Tutto in `src/content/press.json`. I link di recensioni e articoli si mostrano solo con `"verified": true`: si mette dopo aver aperto il link e controllato che funzioni.

## Form, email e dati

- **Form**: `ContactForm` (modale Contattaci e articoli) e `DownloadForm` (pagine dei dischi) inviano con le Astro Actions `contatto` e `richiestaDownload` (`src/actions/index.ts`). La logica è in `src/lib/forms/` (testata a parte): honeypot → rate limit → Turnstile → D1 → mail.
- **Turnstile**: lo script di Cloudflare si carica solo quando qualcuno inizia a compilare un form. Con le chiavi di test (default in locale) non si carica niente e il server accetta un token finto: si lavora offline. In produzione servono le chiavi vere.
- **Email**: `MAIL_PROVIDER=resend` (produzione), `cloudflare` (alternativa, binding `EMAIL`), `log` (sviluppo: le mail si stampano in console e si leggono su `/api/dev/outbox`, che in produzione risponde 404). I template sono in `src/emails/`: tutto l'input dell'utente è escapato.
- **Download**: il link `/api/download/<token>` è firmato (HMAC) e vale 7 giorni. Lo zip arriva da R2 (`DOWNLOADS`). In locale `npm run setup:local` ci mette uno zip finto.
- **D1**: schema in `migrations/`. Per i dati della band:
  - `scripts/export-contacts.sh > iscritti.csv`: chi ha dato il consenso agli aggiornamenti (nome, email, data);
  - `scripts/delete-contact.sh persona@example.com`: cancella una persona e tutto ciò che la riguarda (diritto alla cancellazione);
  - entrambi lavorano sul database remoto; con `--local` su quello locale.
- **Retention**: il Cron giornaliero cancella richieste e messaggi più vecchi di `RETENTION_MONTHS` (24) e i contatti rimasti senza richieste e senza consenso attivo.

## Home

`src/pages/index.astro` è statica (prerenderizzata). L'unico pezzo dinamico è il **prossimo concerto**, una server island (`src/components/home/NextConcert.astro`, `server:defer`) che usa gli stessi dati e la stessa cache di `/concerti`; mentre arriva si vede uno scheletro della stessa misura. Le "cose vere" sono in `src/content/site.json` → `facts`. Il player di Spotify si carica solo quando qualcuno preme "Carica il player".

## Concerti e foto delle venue

- **Calendario** (`src/lib/calendar.ts`): `events.list` con il service account in sola lettura (`src/lib/google-auth.ts`, token in KV per 50 minuti). I concerti normalizzati stanno in KV (`calendar:v1`): freschi per 15 minuti, poi si serve la copia e la si aggiorna in background. Se Google non risponde si usa l'ultima copia buona; se non c'è nemmeno quella, la pagina lo dice con garbo.
- **In locale** `CALENDAR_SOURCE=fixture` usa `tests/fixtures/calendar-events.json`: i concerti veri del calendario (senza descrizioni) più qualche evento "(esempio)" nel 2030 per vedere il dettaglio completo.
- **Pagine**: `/concerti` e `/concerti/<slug>` (SSR), `/concerti/<slug>.ics` (aggiungi al calendario), JSON-LD `MusicEvent` per i concerti in programma.
- **Foto** (`src/lib/places.ts`, `GET /api/venue-photos?slug=…`): override `foto:` → Google Places (New) → niente. Il `place_id` sta in KV per sempre, la risposta in cache per 3 ore. Tetto di sicurezza: 40 ricerche nuove al giorno. **Nessuna immagine di ripiego**: se non ci sono foto vere (o manca `GOOGLE_PLACES_API_KEY`), la galleria non compare.
- **Mappa**: il bottone "Apri in Google Maps" c'è sempre. Con `GOOGLE_MAPS_EMBED_KEY` compare anche "Mostra la mappa" (iframe caricato solo al clic).

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
- `node scripts/build-video-thumbs.mjs`: per ogni video dei dischi scarica la miniatura, toglie le bande nere, la salva in `src/assets/video/` e scrive i titoli in `src/content/video-meta.json`. Va rilanciato quando si aggiunge un video (la build non usa la rete).
- `python3 scripts/build-press-logos.py`: rigenera i loghi scaricabili in `public/press/loghi/`, lo zip `kuf-loghi.zip` e i pesi dei file mostrati in `/press`.
- `python3 scripts/build-album-zips.py old-ilsitodeikuf.it/public materiali/downloads`: ricrea gli zip dei dischi puliti (nomi UTF-8, tag ID3 v2.3 corretti, cover incorporata, `cover.jpg`). Richiede `mutagen` e `Pillow`.
- `scripts/upload-downloads.sh`: carica gli zip su R2. **Da lanciare a mano, solo dopo l'ok.**
- `node scripts/build-og.mjs`: rigenera le immagini Open Graph di home e concerti in `public/og/` (HTML fotografato con il Chromium di Playwright; `PW_CHROMIUM_PATH` opzionale). Le pagine dei dischi usano la cover, gli articoli la loro foto.
- `python3 scripts/build-favicons.py`: rigenera favicon, icone e `site.webmanifest` dal monogramma K.
- Font: Montserrat Light (titoli, istanza statica del variable di Fontsource, 18 KB); Inter variable latin da Fontsource (48 KB).

Licenze: Montserrat e Inter (OFL 1.1, testi in `src/assets/fonts/`), Simple Icons (CC0), Lucide (ISC). Walkway, il font del vecchio sito, non si usa più perché non ha una licenza.

## Variabili e secret

Le variabili non segrete sono in `wrangler.jsonc` → `vars`; per lo sviluppo si usano quelle di `.dev.vars.example`. Lo schema tipizzato è in `astro.config.mjs` → `env.schema`.

I secret di produzione si impostano **solo** con `wrangler secret put NOME`:
`GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_PLACES_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `DOWNLOAD_TOKEN_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`.

Due tipi di variabili, da non confondere:

- **lette dal server a ogni richiesta** (quasi tutte, compresa `GOOGLE_MAPS_EMBED_KEY`): in locale da `.dev.vars`, in produzione da `wrangler.jsonc` → `vars` o dai secret. Dopo una modifica a `.dev.vars` va riavviato `npm run dev`.
- **scritte nell'HTML in build**: solo `PUBLIC_TURNSTILE_SITE_KEY`. La chiave vera va in **`.env.production`** (lo legge solo la build, così in sviluppo resta quella di test) e **non** in `.dev.vars`, che in build vincerebbe e porterebbe in produzione la chiave di test. `npm run deploy` controlla entrambe le cose, anche nell'HTML generato.

Nei file `.env` e `.dev.vars` il `#` a metà riga **non** è un commento: `MAIL_PROVIDER=log # resend` vale "log # resend" e il sito non parte. I commenti vanno su righe a sé.

## Note

- **Vecchio sito:** `old-ilsitodeikuf.it/` è escluso da git perché contiene credenziali. Non va mai committato.
- **Astro e agenti AI:** se Astro 7 rileva un agente AI, `astro dev` e `astro preview` partono in background (si fermano con `astro dev stop` o `astro preview stop`). La config di Playwright usa `--ignore-lock` per tenerli in primo piano.
- **Messa online:** tutti i passi manuali (Google Cloud, Cloudflare, DNS e posta di Aruba, Resend, secret, primo deploy, prove) sono in **[docs/go-live.md](docs/go-live.md)**. Il deploy da GitHub è pronto in `docs/github/deploy.yml` (da spostare in `.github/workflows/`, parte solo a mano).
- **Sicurezza:** CSP con gli hash nel `<meta>` di ogni pagina (`astro.config.mjs` → `security.csp`, non attiva in `npm run dev`: si prova con build + preview), altri header in `public/_headers` (pagine statiche) e `src/lib/security-headers.ts` (Worker). Niente `style="…"` negli elementi e niente script inline nuovi senza hash: vedi ADR-060.
- **SEO:** `/sitemap.xml` (pagine, articoli e concerti, generata a runtime), `public/robots.txt`, pagina `404`.

Da completare nelle prossime fasi: come aggiungere un concerto (convenzioni della descrizione dell'evento), un articolo e un disco.
