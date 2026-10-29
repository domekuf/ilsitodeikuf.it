# Decisioni di progetto (ADR leggeri)

Fase 0, 27 ottobre 2026. Ogni voce dice cosa cambia rispetto al prompt e perché.
Stato: **Proposta** = aspetta il tuo ok · **Presa** = segue la documentazione corrente o una decisione già confermata · **Da chiedere** = serve una tua risposta.

---

## A. Stack e versioni

### ADR-001 · Astro 7, non Astro 6 — Presa (ok del 27/10)
- Il prompt dice "Astro 6 (ultima stabile)", ma oggi l'ultima stabile è **Astro 7.4.2** (7.0 uscito il 22 giugno 2026). Astro 6 è ormai la major precedente.
- `@astrojs/cloudflare` **14.4.2** richiede `astro ^7.4.0` (peer dependency): il nuovo adapter non supporta più Astro 6.
- Cosa cambia per noi con Astro 7:
  - compilatore in Rust: l'HTML non viene più "corretto" (tag non chiusi = errore di build, `<div>` dentro `<p>` non viene sistemato);
  - `compressHTML` di default `'jsx'`: tra elementi inline gli a capo non diventano spazi (serve `{" "}`);
  - Markdown con Sätteri di default: va bene, non usiamo plugin remark/rehype;
  - Vite 8 (Rolldown), Zod 4 (`import { z } from 'astro/zod'`);
  - Node **≥ 22.23** (dagli `engines` di astro 7.4.2). In CI useremo Node 24 LTS.
- Versioni verificate su npm oggi: astro 7.4.2, @astrojs/cloudflare 14.4.2, wrangler 4.153, tailwindcss e @tailwindcss/vite 4.3.3 (supportano Vite 8), vitest 5.0.5, @playwright/test 1.64.1, @axe-core/playwright 4.14.0.
- Regola: astro e adapter si aggiornano sempre insieme (`npx @astrojs/upgrade`), perché con versioni disallineate la build si rompe.

### ADR-002 · Rendering: statico di default, SSR per singola pagina — Presa
- La modalità "hybrid" non esiste più come nome: si usa `output: 'static'` (default) con l'adapter Cloudflare, e le pagine dinamiche dichiarano `export const prerender = false`.
- SSR: `/concerti`, `/concerti/[slug]`, `/api/*`, `/disiscriviti/[token]`, le Actions e la server island "prossimo concerto". Tutto il resto è prerenderizzato.

### ADR-003 · Binding e variabili d'ambiente — Presa
- Dall'adapter 13 in poi `Astro.locals.runtime` non esiste più. I binding si leggono con `import { env } from 'cloudflare:workers'`, il contesto d'esecuzione (`waitUntil`) con `Astro.locals.cfContext`.
- Le variabili tipizzate passano da `astro:env` (schema in `astro.config`), così un secret mancante fa fallire subito.
- `astro dev` gira già su `workerd` con D1, KV e R2 locali: niente `platformProxy` da configurare.

### ADR-004 · Entrypoint custom per il Cron della retention — Presa
- Aggiornamento 27/10: sull'account non c'è nessun Cron Trigger, quindi usiamo un Cron Trigger giornaliero vero.
- L'adapter permette un entrypoint `src/worker.ts` che importa `handle` da `@astrojs/cloudflare/handler` ed esporta un Worker con `fetch` + altri handler. Lì aggiungiamo `scheduled` per la pulizia giornaliera su D1 (§8.5).
- Attenzione: il piano Free ha **5 Cron Trigger per account**, non per Worker. Usi già Cloudflare per altri progetti (bot spese, ecc.): controlla quanti ne usi. Se sono finiti, la retention può girare "a richiesta" (al massimo una volta al giorno, dentro una richiesta normale con `waitUntil`).

### ADR-005 · Niente sessioni Astro — Presa
- L'adapter configura in automatico un namespace KV `SESSION`. Non ci servono sessioni: impostiamo `session: false` (disponibile da Astro 7.2) per non creare risorse inutili.

### ADR-006 · Servizio immagini: ottimizzazione solo in build — Proposta
- Il default dell'adapter ora è `cloudflare-binding` (Cloudflare Images a runtime). Non ci serve e può avere costi/limiti propri.
- Proposta: `imageService: { build: 'compile', runtime: 'passthrough' }`. Le immagini locali vengono ottimizzate in build (AVIF/WebP, `srcset`) sulle pagine prerenderizzate; le pagine SSR usano solo asset già generati o URL remoti (foto di Places).

### ADR-007 · Limiti del piano Workers Free — Nota
- 100.000 richieste al giorno, **10 ms di CPU per richiesta**, 50 subrequest, asset statici fino a 25 MiB l'uno (confermato: gli zip da ~120 MB vanno su R2).
- I 10 ms di CPU sono il vincolo vero: le pagine SSR restano leggere, il calendario normalizzato sta in cache (KV/Cache API) e il JWT per Google si firma solo una volta ogni ~50 minuti. Se in produzione dovessimo sforare, l'opzione è Workers Paid (5 $/mese). Lo misuriamo in Fase 5.

---

## B. UI e motion

### ADR-008 · View Transitions native al posto di `<ClientRouter />` — Presa (ok del 27/10)
- Il prompt chiede `<ClientRouter />`. Propongo invece le **View Transitions cross-document native del browser** (`@view-transition { navigation: auto; }` in CSS).
- Motivi:
  - zero JavaScript (aiuta il limite di 30 KB a pagina);
  - nessun conflitto con `modal-router.ts`: `ClientRouter` intercetta i link e gestisce la history per conto suo, e il nostro router delle modali fa `pushState`/`popstate`. Due router sulla stessa history sono una fonte sicura di bug;
  - Chrome, Edge e Safari le supportano; dove non ci sono, la navigazione è semplicemente normale (progressive enhancement).
- Se preferisci comunque `ClientRouter`, si può fare, ma i link delle modali vanno esclusi con `data-astro-reload` e servono test e2e in più.

### ADR-009 · Font con la Fonts API di Astro — Proposta
- La Fonts API è stabile da Astro 6: con il provider locale gestisce `woff2`, preload e font di fallback con metriche corrette (meno CLS). La usiamo per Walkway Bold (convertito e ridotto a latin con fonttools) e Inter variable.
- Da verificare: la **licenza di Walkway** per l'uso web. Il vecchio sito lo serviva già, ma prima di ripubblicarlo voglio vedere la licenza.

### ADR-010 · Icone come SVG inline, senza `astro-icon` — Proposta
- Servono circa 5 icone social e una decina di icone UI. Propongo di copiarle come componenti SVG da Simple Icons (CC0) e Lucide (ISC), con le licenze citate nel README.
- Una dipendenza in meno (regola 6) e nessun lavoro in build per Iconify. Se in futuro le icone diventano tante, si aggiunge `astro-icon` (1.2.0, aggiornato ad agosto 2026).

### ADR-011 · Video YouTube — Presa
- `@astro-community/astro-embed-youtube` 0.5.10 (usa `lite-youtube-embed` 0.3.4 e non dichiara peer dependency su Astro). Lo verifichiamo con Astro 7 in Fase 3; se dà problemi, si usa direttamente `lite-youtube-embed`.

---

## C. Backend

### ADR-012 · Rate limiting: la finestra "5 ogni 10 minuti" non si può esprimere — Proposta
- Il binding `ratelimits` accetta solo periodi di **10 o 60 secondi**, solo il tipo `simple`, e richiede un `namespace_id` numerico. I conteggi sono approssimati e separati per ogni data center Cloudflare.
- Proposta: `limit: 3, period: 60` con chiave `hash(IP) + nome action`. Più Turnstile e honeypot, basta e avanza per un sito di band.
- Se serve un limite rigido su 10 minuti, si può fare un contatore su KV, ma KV è "eventually consistent" (fino a 60 s): non lo consiglio.

### ADR-013 · Foto delle venue: i costi reali di Places — Proposta
- **Text Search (IDs Only)**: gratuita senza limiti. Confermato.
- **Place Details con `photos`**: è nello SKU **Enterprise "Place Details Photos"**, con **1.000 eventi gratis al mese**, poi 7 $ ogni 1.000. Google fattura sempre lo SKU più alto tra i campi chiesti.
- Anche le richieste `…/media` per le singole foto rientrano nella fatturazione delle foto. Ogni apertura di una modale senza cache costa circa 1 + 3 eventi: con la quota gratuita restano **circa 250 aperture al mese**.
- Proposta:
  1. cache edge della risposta di `/api/venue-photos` per slug (qualche ora, nei termini di Google);
  2. le foto si chiedono solo all'apertura della modale (già previsto);
  3. **quota giornaliera rigida** sulla Places API nella Cloud Console (es. 40 richieste al giorno). Il budget alert da 1 € avvisa ma non ferma la spesa: la quota sì. Superata la quota → placeholder;
  4. in alternativa, foto Google solo per i concerti futuri e placeholder per i passati (che sono la maggioranza).

### ADR-014 · Email: Resend confermato — Presa
- Resend Free: 3.000 email al mese, **100 al giorno** (giorno UTC), 3 domini, 10 richieste al secondo. Ogni destinatario conta come un'email.
- Un download manda 2 email (notifica + ringraziamento): il tetto è circa 50 download al giorno. Sopra quella soglia l'invio fallisce, il download parte comunque e l'errore va nei log.
- Cloudflare Email Service è ancora in **beta** e per scrivere a indirizzi qualsiasi serve Workers Paid (5 $/mese con 3.000 email incluse). Resta come provider alternativo dietro `MailProvider`, come previsto.

### ADR-015 · Google Calendar — Presa
- ID trovato: `rr1kivo3ieptrkn48l29gav2mc@group.calendar.google.com`, timezone del calendario `Europe/Rome`. Va in `GOOGLE_CALENDAR_ID`.
- Dal vecchio `calendarInsert.php`: gli eventi storici sono stati creati **tutto il giorno** (solo `date`) con titolo `Kuf @ {Città} - {Locale}` (es. `Kuf @ Forlì - L'Urlo`, `Kuf @ Ravenna - Artificierie Almagià w/ Nemesi`). Di conseguenza:
  - la **città** si ricava prima dal titolo (`Città - Locale`) e solo in mancanza dal campo `location`;
  - per i concerti passati tutto il giorno si mostra solo la data. "Orario da definire" compare solo per quelli futuri;
  - lo slug usa data + titolo pulito (es. `2015-11-13-forli-l-urlo`).
- Non sono riuscito a leggere gli eventi reali adesso (quota del connettore Calendar esaurita). Le fixture le preparo in Fase 5 su questo formato e poi le confronto con i dati veri.

### ADR-016 · Redirect — Proposta
- Il vecchio sito aveva come URL canonico **`www.ilsitodeikuf.it`** (sitemap). Il nuovo sarà sull'apex: `www → apex` con 301, tramite una Redirect Rule della zona (gratuita).
- I `.php` vanno nella config `redirects` di Astro: con l'adapter rispondono con un vero 301 dal Worker (attenzione: in output statico puro diventerebbero pagine con meta refresh).
- `download.php?dl=…` dipende dalla query string: lo gestisce un middleware (Pigna di default, `ViaTrieste.zip` → `/via-trieste`).

### ADR-017 · CSP con la funzione nativa di Astro — Proposta
- `security.csp` è stabile (con controllo per direttiva da 7.1) e calcola da sola gli hash di script e stili, anche sulle pagine statiche. Aggiungiamo a mano le origini esterne (youtube-nocookie, Spotify, Maps Embed, Turnstile, immagini Google). Gli altri header (`Referrer-Policy`, ecc.) vanno in `_headers` o nel middleware. Il comportamento si verifica in Fase 7.

---

## D. Repository e sicurezza

### ADR-018 · Il vecchio sito resta fuori da git — Presa
- Il progetto nuovo nasce nella cartella `ilsitodeikuf.it/`, che contiene anche `old-ilsitodeikuf.it/` (320 MB). La cartella va in `.gitignore` per intero: contiene `credential.json`, `kws-backend/client_secret.json` e **`kws-backend.tar.gz`, che include un'altra copia di `client_secret.json`** (e una cartella `.git`).
- Non ho aperto quei file. Per la password SMTP di Aruba ho controllato solo la struttura del codice: si leggeva da una variabile d'ambiente, quindi nel codice non c'è.

### ADR-019 · Altri problemi del vecchio codice (da non ripetere) — Nota
Oltre a quelli già nel prompt:
- `controller.php` mandava il ringraziamento a **qualsiasi indirizzo** inserito nel form, senza verifiche: chiunque poteva usare il sito per spedire mail a terzi. Nel nuovo sito il ringraziamento resta, ma con template fisso, Turnstile e rate limit.
- Il nome del file da scaricare arrivava dal client e veniva concatenato all'URL. Nel nuovo sito l'album è un enum validato e il file è deciso dal server.
- Il messaggio dell'utente finiva nel corpo HTML della mail senza escaping (XSS nelle mail, già noto).

---

## E. Contenuti emersi dall'audit (servono risposte)

### ADR-020 · Video — Presa (27/10)
- **Deciso:** `aqjz-PGMtns` ("Fuori da qui") va sotto Via Trieste. Lista finale di Via Trieste: `_dnIV2LMYsk`, `9oSAwVecXAA`, `ES_G9WQaA3s`, `aqjz-PGMtns`.
- La vecchia home aveva `aqjz-PGMtns` (**"Fuori da qui", 2014**, secondo il press kit). Non compare nelle nuove liste. Lo aggiungo sotto Via Trieste (dove c'è "Fuori da qui") o lo lascio fuori?
- `ES_G9WQaA3s` è confermato sotto Via Trieste. Lo segnalo una volta sola: nel vecchio press kit era indicato come "Tenco e Pasolini, 2017", cioè un brano di Pigna.
- `dgj6n8ed7fg` e `FJxuP2goFB4` non erano nel vecchio sito: i titoli arriveranno da oEmbed in build.

### ADR-021 · Press kit — Presa (27/10)
- **Formazione aggiornata:** Luca Rani (voce), Ciro Pepe (voce, basso), Domenico Di Iorio (chitarra, synth), Andrea Gambi (chitarra, synth), Giacomo Rossi (batteria).
- **SoundCloud fuori dal press kit:** niente sezione Preproduzioni e niente embed SoundCloud in `/press`. Il link a SoundCloud resta nel FAB dei social e nella sezione Ascolta della home.
- Le playlist YouTube dei dischi si usano per il link "Ascolta su YouTube" nelle pagine dei dischi.

Note originali dell'audit:
- La **formazione** in `press.php` è: Luca Rani (voce), Simona Toscano (chitarra), Domenico Di Iorio (chitarra, synth), Andrea Gambi (basso, synth), Giacomo Rossi (batteria). È ancora valida?
- Nel press kit c'erano anche le **Preproduzioni** (playlist SoundCloud "pre", "registrate a casa, così come venivano") e i link alle playlist YouTube dei due dischi. Propongo di tenerli in `/press` (SoundCloud come facade cliccabile) e di usare le playlist per il link "Ascolta su YouTube" delle pagine dei dischi.
- La bio aveva tre "fatti" in più rispetto alla lista del prompt ("Via Trieste è uscito nel 2015…", "Pigna è uscito nel 2017…", "I Kuf sono italiani, e cantano nella stessa lingua in cui pensano…"). Il terzo ripete "cantano in italiano perché pensano in italiano". Propongo di usare la lista del prompt così com'è.
- La verifica dei link morti di recensioni e articoli (13 link, quasi tutti del 2017) la faccio in Fase 3.

### ADR-022 · Cover e zip — Nota
- **Pigna**: il PSD è di soli **900×900 px** (un livello). È sufficiente per una cover da circa 450 px a densità 2x, non di più. Se esiste un originale più grande, servirebbe.
- **Via Trieste**: c'è solo un PNG da 250 px. Serve un file in alta risoluzione (come già previsto nel prompt).
- Gli **zip** contengono mp3 con nomi corretti (`01 Agosto.mp3`, …), ma:
  - i nomi con accenti sono in Unicode decomposto (NFD) e senza il flag UTF-8: su Windows diventano `Chissa╠Ç Chi Verra╠Ç.mp3`. Vanno ricreati in NFC con il flag UTF-8;
  - Pigna usa tag **ID3 v2.2**, un formato vecchio che molti player e Esplora risorse non leggono. Li converto in ID3 v2.4 (o v2.3 per la massima compatibilità) e aggiungo la cover incorporata;
  - Via Trieste contiene anche `Icon\r` e `__MACOSX/`. Pigna contiene `__MACOSX/`.
- Le magliette: nel vecchio array ogni articolo ha almeno una taglia disponibile, quindi `disponibile: true` per tutti e cinque è coerente con i dati del 2017. Va comunque confermato con quello che avete davvero oggi.

---

## F. Piccole correzioni al prompt

- La Fase 0 cita `../ilsitodeikuf.it`, ma il vecchio sito è in `./old-ilsitodeikuf.it`. Uso il secondo.
- Nell'albero di §4, `forms/` compare due volte (va unito) e `scripts/` compare sia alla radice (script shell) sia come cartella dei TS client. Propongo `scripts/` alla radice per gli `.sh` e `src/scripts/` per `modal-router.ts`, `social-dock.ts`, `reveal.ts`.
- §12 contiene un link markdown dentro il nome della route `www` (refuso).

## Fonti verificate
- Astro 7.0: https://astro.build/blog/astro-7/ · guida di upgrade: https://docs.astro.build/en/guides/upgrade-to/v7/
- Adapter Cloudflare: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Astro 6.0 (Fonts API, CSP, dev server workerd): https://astro.build/blog/astro-6/
- Rate limiting Workers: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Limiti Workers: https://developers.cloudflare.com/workers/platform/limits/
- Chiavi di test Turnstile: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
- Prezzi Google Maps Platform: https://developers.google.com/maps/billing-and-pricing/pricing · https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Quote Resend: https://resend.com/docs/knowledge-base/resend-email-quota
- Cloudflare Email Service (beta, Workers Paid): https://whichdevtool.com/tools/cloudflare-email-service/
- Tailwind e Vite 8: https://benjamincrozat.com/tailwind-css-vite-8-support (supporto confermato dalla peer dependency di @tailwindcss/vite 4.3.3)

---

## G. Scelte della Fase 1 (scaffold)

### ADR-023 · Versioni fissate e motivi — Presa
- **TypeScript 6.0**, non 7: `@astrojs/check` e `typescript-eslint` supportano fino alla 6.
- **Vitest 4.1**, non 5: `@cloudflare/vitest-pool-workers` (test su D1 in Fase 4) richiede Vitest 4.1.
- **Niente `eslint-plugin-jsx-a11y`**: non supporta ESLint 10. L'accessibilità la verifica axe negli e2e (Fase 2).
- **Node 24 / npm 11**: con npm 10 `npm install` si blocca su un bug di npm (`edgesOut`). Node 24 include già npm 11.
- **`@types/node`** solo per config e test e2e, in un `tsconfig.node.json` separato, così i tipi Node non si mescolano con quelli del Worker.

### ADR-024 · Binding senza ID nel `wrangler.jsonc` — Presa
- D1, KV e R2 sono dichiarati senza ID: in locale Miniflare li simula, quindi dev e test funzionano già. Gli ID veri si aggiungono quando crei le risorse (Fase 7), oppure si lascia fare a wrangler al primo deploy (provisioning automatico). La scelta la facciamo insieme in Fase 7.

### ADR-025 · Workflow GitHub da spostare a mano — Nota
- Lo strumento con cui scrivo nella tua cartella non può creare file dentro `.github/`. Il workflow CI e la config di Dependabot sono in `docs/github-da-spostare/`: vanno spostati in `.github/`.

---

## H. Scelte della Fase 2 (design system e layout)

### ADR-026 · Header con link inline da `lg` in su — Presa
- Sotto i 1024 px c'è solo il bottone del menu, che apre l'overlay a schermo intero (come nel vecchio sito). Da 1024 px in su i 7 link sono anche inline: ci stanno comodi e su desktop si risparmia un clic. È anche la versione dell'anteprima che hai approvato.

### ADR-027 · Due ritocchi alla palette per il contrasto AA — Presa
- `#797264` (il grigio dei vecchi bottoni) sulla carta fa 4,6:1: va bene per titoli, elementi grafici e testo grande, ma è al limite per il testo piccolo. Per il testo piccolo uso una variante appena più scura, `#6E675A` (5,4:1).
- Colore di segnalazione per il badge "prossimo": `#A84B24`, terracotta sobria (bianco sopra: 5,7:1).

### ADR-028 · Logo SVG — Proposta (da approvare)
- Tre varianti generate da `scripts/build-logo.py`: wordmark completo (tratto sottile come l'originale, spaziatura K–U allargata e U–F ristretta), wordmark compatto per header e footer (tratto più pieno), monogramma K.
- Nel vecchio sito c'è anche `img/logo.png`, un altro logo (KUF con il punto, dell'epoca Via Trieste). Non l'ho usato.
- **Favicon**: il §5 dice monogramma K, il §9 dice "partendo dalla pigna". Per ora c'è il K su fondo inchiostro. Va scelto prima della Fase 3.

### ADR-029 · Modali: il focus va sul titolo — Presa
- All'apertura il focus va sul titolo della modale (non sulla X), così lo screen reader legge subito di cosa si tratta. Alla chiusura torna sul link che l'ha aperta. Esc e clic sul fondo passano dalla history, quindi l'URL resta sempre coerente.

### ADR-030 · JavaScript — Nota
- Tutto il JS della Fase 2 (router delle modali, menu, FAB) pesa circa 2 KB gzip ed è inline nelle pagine. Siamo molto sotto il budget di 30 KB.

---

## I. Scelte della Fase 3 (contenuti statici)

### ADR-031 · Montserrat Light al posto di Walkway — Presa (27/10, ok di Domenico)
- Walkway non ha una licenza utilizzabile. Ho confrontato 12 font OFL sobri; il più vicino (lettere larghe, C e O tonde, tratto leggero) è **Montserrat Light (300)**. È un'istanza statica ridotta al set latin: 18 KB.
- Il logo non cambia: è disegnato a parte e non dipende dal font.

### ADR-032 · Logo v2: lettere bilanciate — Presa
- Prima la K era larga 157, la U 141 e la F 117 (unità del disegno). Ora sono 136, 138 e 114. Il braccio della K è più ripido e la gamba è a 45°, con la stessa giunzione dell'originale.

### ADR-033 · Favicon: monogramma K — Presa
- Set completo generato da `scripts/build-favicons.py`: `favicon.svg`, `favicon.ico` 32, `apple-touch-icon` 180, icone 192/512 (più la versione maskable) e `site.webmanifest`.

### ADR-034 · Cover in alta risoluzione dai tag degli mp3 — Presa
- Le cover vere stavano dentro gli mp3, nei tag ID3: **Pigna 2835 px** (salvata a 1600) e **Via Trieste 1440 px**. Nessun upscale, nessun TODO, e non serve più esportare il PSD.

### ADR-035 · Zip dei dischi — Presa (caricamento su R2 non eseguito)
- `scripts/build-album-zips.py` li ricrea in `materiali/downloads/` (fuori da git):
  - "Kuf - Pigna (2017).zip": 122 MB, 10 mp3 a 320 kbps;
  - "Kuf - Via Trieste (2015).zip": 119 MB, 12 mp3 a 192 kbps.
- Nomi in NFC con flag UTF-8; niente `__MACOSX` e niente `Icon\r`; `cover.jpg` dentro lo zip.
- Tag ID3 riscritti in v2.3 (Pigna era v2.2) con i titoli della tracklist ufficiale. Correggono, per esempio, "L'Unico Centro **é** il Confine" in "L'unico centro **è** il confine". Cover incorporata a 1000 px.
- Chiavi su R2: `downloads/kuf-pigna-2017.zip` e `downloads/kuf-via-trieste-2015.zip`. Lo script `scripts/upload-downloads.sh` è pronto ma **non è stato lanciato**.

### ADR-036 · Video: facade nostra, niente dipendenze — Presa (cambia ADR-011)
- La miniatura viene scaricata e ottimizzata **in build** e servita dal sito. Il browser non contatta Google finché non si clicca play; al clic si carica l'iframe `youtube-nocookie`. Titoli via oEmbed in build, con fallback all'ID.
- Sono circa 15 righe di JS, contro un custom element esterno.

### ADR-037 · Press kit — Presa
- I dati stanno in `src/content/press.json` (non `press.md`): sono quasi tutti liste.
- Link controllati il 28/10/2026:
  - **vivi** (pubblicati): Distopic (recensione), Rockit, il blog dell'Alligatore (aggiornato a `.com`), Distopic (anteprima di Matite), Exhimusic, Onda Musicale;
  - **morto**: Rock Garage (rimanda alla home del sito);
  - **non verificabili da qui** (il sito rifiuta il controllo automatico): Music on Tnt, iyezine (anche il link "Continua su iyezine" della bio), Radiocoop, Ravenna Today, Tuco, Long Live Rock 'n' Roll. Per ora sono nascosti: per pubblicarli basta aprirli dal browser e mettere `"verified": true`.
- I loghi e lo zip si generano con uno script (`scripts/build-press-logos.py`), non durante `astro build`: servirebbe una dipendenza in più per lo zip.

### ADR-038 · Redirect — Presa
- I `.php` e i vecchi `/public/*` stanno nella config `redirects`: l'adapter li scrive in `_redirects` e Cloudflare risponde con un vero 301.
- `/download.php?dl=…` è un piccolo endpoint SSR (`src/pages/download.php.ts`), perché dipende dalla query.
- `/concerti.php` porta a `/concerti`, che arriva in Fase 5: fino ad allora dà 404.

### ADR-039 · Form ancora finti — Nota
- ContactForm (anche nella modale Contattaci) e DownloadForm hanno già campi, consensi, honeypot e validazione in italiano, ma non inviano niente: lo dicono anche all'utente. L'invio vero arriva in Fase 4.

### ADR-040 · Video: miniature senza bande nere, nessuna rete in build — Presa (28/10)
- `scripts/build-video-thumbs.mjs` scarica la miniatura migliore (maxres), trova e toglie le bande nere, ritaglia in 16:9 e salva in `src/assets/video/`. I titoli finiscono in `src/content/video-meta.json`. La build non chiama più YouTube.
- Corretto il riquadro nero attorno al player dopo il clic: lo stile dell'iframe non si applicava (scope CSS di Astro).
- "Tenco e Pasolini" (`dgj6n8ed7fg`) ora parte dall'inizio (tolto `start: 53`).

### ADR-041 · Correzione: quale video è quale — Presa (da confermare)
- Con i titoli veri presi da YouTube risulta che il vecchio press kit aveva due etichette sbagliate:
  - `ES_G9WQaA3s` è **"Kuf - Fuori da Qui (2014)"**, quindi sta giustamente sotto Via Trieste;
  - `aqjz-PGMtns` (il video della vecchia home) è **"Kuf - Pigna (2017)"**, non "Fuori da qui": l'avevo indicato male io in Fase 0.
- Quindi `aqjz-PGMtns` va sotto **Pigna** (4 video) e Via Trieste resta con i suoi 3. Se preferisci un altro ordine, si cambia in un attimo.

---

## J. Scelte della Fase 4 (form, email, D1)

### ADR-042 · I form richiedono JavaScript — Presa
- Turnstile funziona solo con JavaScript, quindi un invio "classico" senza JS non supererebbe comunque l'anti-spam. Senza JS il form resta visibile, ma un `<noscript>` invita a scrivere a kuf.ravenna@gmail.com. Le pagine restano statiche (veloci) e le Actions si chiamano dal client.

### ADR-043 · Turnstile: offline con le chiavi di test — Presa
- Con le chiavi di test ufficiali il client non carica lo script di Cloudflare e mette un token finto. Il server lo accetta **solo** con il secret di test "passa sempre" (`1x…AA`) e lo rifiuta con `2x…`/`3x…`. Dev, CI ed e2e funzionano senza rete; con le chiavi vere tutto passa da `siteverify`.
- In produzione lo script si carica al primo focus su un form (non a ogni pagina), con `appearance: interaction-only`: di solito l'utente non vede niente.

### ADR-044 · Rate limit sull'IP di Cloudflare — Presa
- La chiave è `azione + hash(cf-connecting-ip)`: 3 invii al minuto per form. In produzione l'header lo scrive Cloudflare e non si può falsificare. Negli e2e ogni test ne usa uno diverso.

### ADR-045 · Email via HTTP, senza SDK — Presa
- Resend si chiama con una `fetch` (`POST /emails`, campo `reply_to`): niente dipendenze. Il provider Cloudflare usa il binding `EMAIL` (beta): il Reply-To lo passiamo sia come campo sia come header, perché la documentazione non è ancora chiara.
- I template stanno in `src/emails/` (non in `emails/` alla radice) per usare gli stessi import del resto del codice.
- Errori di D1 o della mail finiscono nei log solo con il tipo di errore, mai con nomi o email (c'è un test apposta).

### ADR-046 · Se qualcosa si rompe — Presa
- D1 non risponde: la mail alla band parte lo stesso (il messaggio non va perso).
- La mail non parte (form contatti): errore umano con l'indirizzo di riserva.
- Le mail del download non partono: il download parte comunque.
- Honeypot compilato: risposta normale, ma niente salvataggio e niente mail.

### ADR-047 · Disiscrizione — Presa
- Il token contiene l'id del contatto e il suo `unsubscribe_salt`, firmati. Cambiando il salt su D1 si invalidano tutti i link vecchi di quella persona. Il link non scade.
- GET mostra solo il bottone, la revoca avviene con il POST (i client di posta che aprono i link in anteprima non la fanno scattare).
- Il link compare solo nelle mail di chi ha dato il consenso. Il form contatti non manda mail a chi scrive, quindi lì il link non c'è: per ora la revoca si chiede via email. Quando ci sarà una newsletter, ogni invio avrà il link.

### ADR-048 · Test di D1 senza Miniflare — Presa
- Le query si testano con un piccolo adattatore D1 sopra `node:sqlite` (`tests/unit/helpers/d1.ts`): stesso SQLite, foreign key attive come su D1, nessuna dipendenza in più. Il flusso completo su D1 locale vero lo coprono gli e2e (`npm run setup:local` applica le migrazioni).

### ADR-049 · Privacy: bozza — Da rivedere (band)
- `/privacy` è una bozza in linguaggio semplice con i punti del §7.10. Va riletta da voi: in particolare chi è il "titolare" (la band non è una società) e se volete un indirizzo postale.

### ADR-050 · Calendario: filtro sul titolo, oltre a `q` — Presa
- Il calendario vero contiene anche prove, "date rosse", impegni e concerti annullati rinominati `annullato @ …`. La ricerca `q` di Google è a testo libero (cerca anche in descrizione e luogo), quindi in più teniamo solo gli eventi il cui **titolo comincia** con `CALENDAR_QUERY`. Con `CALENDAR_QUERY` vuoto non si filtra.
- Il titolo si scompone in città, locale e ospiti (`Città - Locale w/ Ospiti`); se manca la città, la si cerca nell'indirizzo (CAP + città).

### ADR-051 · Slug dei concerti dal locale — Presa
- `AAAA-MM-GG-{locale}`, come l'esempio del brief (`2017-11-17-almagia`): niente città né ospiti nello slug, così è corto. Le collisioni (`-2`) si risolvono sempre nello stesso ordine (data, poi id dell'evento), quindi gli URL non cambiano da una lettura all'altra.

### ADR-052 · Date: in ora italiana, a prescindere dal server — Presa
- Gli eventi "tutto il giorno" restano date (`YYYY-MM-DD`) e si formattano senza fuso; quelli con orario sono ISO con offset (Google li dà già in `Europe/Rome`) e si formattano con `Intl` in `Europe/Rome`. I test girano anche con `TZ=America/Los_Angeles`.
- Un concerto resta "in programma" fino alla fine: per quelli tutto il giorno fino a mezzanotte italiana, per quelli con orario fino all'ora di fine (o 3 ore dopo l'inizio, se manca).
- "Orario da definire" solo per i concerti futuri senza orario: per quelli passati l'orario non si mostra (come diceva il vecchio sito, "a che ora? Questo non si chiede mai!").

### ADR-053 · Cache del calendario in KV, non nella Cache API — Presa
- Il brief lascia la scelta. KV è globale (la Cache API è per data center) e permette di tenere l'ultima copia buona senza scadenza come riserva. 96 scritture al giorno al massimo, ben dentro il free tier. Una piccola memoria per isolate evita anche le letture KV ravvicinate.
- Con `CALENDAR_SOURCE=google` e credenziali mancanti il sito **non** ripiega sulla fixture (mostrerebbe concerti finti): mostra "il calendario non risponde".

### ADR-054 · Foto delle venue: solo foto vere, nessun ripiego — Presa (rivista)
- Prima versione: 3 immagini "di repertorio" (da un pool di 8 ricavate dagli asset del sito) quando Google non aveva foto. **Tolte su richiesta della band**: o foto vere del posto, o niente. Il brief (§7.3, §8.2) prevedeva i placeholder: è una deviazione voluta.
- Le `foto:` della descrizione sono già nell'HTML (funzionano senza JS). Negli altri casi la galleria parte nascosta; all'apertura della modale lo script chiede `/api/venue-photos` e la mostra solo se arrivano foto, con le attribuzioni ("Foto: … via Google Maps"). Senza foto, o senza JS, non c'è nessuno spazio vuoto.
- Places (New): Text Search con field mask `places.id` (gratis), Place Details con `photos`, Place Photos con `skipHttpRedirect=true`. Si salva in KV solo il `place_id`; le risposte con le foto restano in cache edge 3 ore e non si copiano su R2. "Nessuna foto" si tiene in cache solo un'ora.
- Tetto di 40 ricerche al giorno (contatore in KV, non atomico: è una cintura di sicurezza) oltre al budget alert su Google Cloud.

### ADR-055 · Dettaglio concerto via fetch, `.ics` come endpoint — Presa
- Come chiede il brief, dalla lista il dettaglio arriva con il fetch di `/concerti/<slug>` (stesso router delle altre modali). L'evento `kuf:modal-open` fa partire il caricamento delle foto.
- `/concerti/<slug>.ics` (RFC 5545: CRLF, righe piegate a 75 ottetti, orari in UTC, date "tutto il giorno" con fine esclusa).
- Condividi: Web Share API dove c'è (mobile), altrimenti copia il link.

### ADR-056 · Home: prossimo concerto come server island — Presa
- La home resta prerenderizzata; il riquadro del prossimo concerto arriva da `/_server-islands/NextConcert` (cache 5 minuti, stessi dati di `/concerti`). Lo scheletro ha la stessa sagoma, quindi niente salti (CLS 0).
- Senza concerti in programma: "Nessun concerto in programma. Ci vediamo a natale." e il link ai concerti passati. Se il calendario non risponde lo dice, con lo stesso link.
- Le chiavi delle server island cambiano a ogni build: con un solo Worker va bene. Se un giorno servisse (CDN con pagine vecchie in cache), si fissa `ASTRO_KEY` (`astro create-key`).

### ADR-057 · Prestazioni — Presa
- CSS inline in ogni pagina (`build.inlineStylesheets: 'always'`): ~10 KB gzip, una richiesta bloccante in meno sul 4G. Con un sito così piccolo conviene più della cache del CSS tra pagine.
- Prime immagini delle griglie con `fetchpriority="high"` e senza animazione d'ingresso (l'animazione allo scroll ritardava l'LCP).
- Lighthouse mobile (preview locale, quindi **senza** compressione: in produzione Cloudflare aggiunge brotli): `/` 96–98, `/concerti` 97, `/articoli` 97, `/pigna` 97. Accessibilità, best practice e SEO 100. CLS 0 ovunque.

### ADR-058 · Spotify al clic, non all'ingresso in viewport — Presa (deviazione dal brief)
- Il brief chiede di caricare l'embed quando entra nella viewport. L'iframe di Spotify però imposta cookie e tracker suoi: caricarlo da solo vorrebbe dire mandare dati a Spotify senza che la persona l'abbia chiesto, contro il "niente tracker, niente banner" del sito. Si carica solo premendo "Carica il player"; accanto c'è il link diretto a Spotify.

### ADR-059 · Immagini Open Graph — Presa
- Home e concerti: due immagini fisse (`public/og/`) generate da `scripts/build-og.mjs` con il Chromium di Playwright, che c'è già. Dischi: la cover; articoli: la foto.
- Niente immagine diversa per ogni concerto: servirebbe una libreria di rendering a runtime (es. satori + resvg) solo per questo. Tutti i concerti usano l'immagine "Concerti"; titolo e descrizione restano specifici.
- Hero della home: la foto di gruppo (`kuf-gruppo.jpg`, quella che avete scelto per l'immagine di lancio) al posto di `kuf-foto-mare.jpg` indicata nel brief. Si cambia in una riga in `src/pages/index.astro`.

### ADR-060 · CSP con gli hash di Astro — Presa
- `security.csp` di Astro: in ogni pagina un `<meta>` con `script-src` e `style-src` fatti di hash degli script e degli stili che Astro genera; per le pagine SSR Astro manda la stessa CSP come header. Niente `'unsafe-inline'`.
- Origini ammesse: script da Turnstile e dal beacon di Web Analytics; iframe da YouTube (nocookie), Spotify, Google Maps, Turnstile; immagini da qualsiasi https (le foto della venue possono arrivare da Google o da un link `foto:` qualsiasi); `connect-src` solo verso il sito e Web Analytics.
- Le direttive che un `<meta>` non può dare (`frame-ancestors`) e gli altri header (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, `HSTS` senza `includeSubDomains` per non toccare i sottodomini di Aruba) arrivano da `public/_headers` per le pagine statiche e da `src/worker.ts` per tutto il resto. Un test controlla che le due liste coincidano.
- Conseguenze sul codice: niente attributi `style="…"` (gli indici delle animazioni sfalsate e i colori dei social ora sono CSS con `:nth-child` e `data-brand`); l'unico script inline scritto a mano sta in `src/lib/inline-scripts.mjs` e `astro.config.mjs` ne calcola l'hash. Markdown senza Shiki (stili inline). In `npm run dev` la CSP non c'è (limite di Astro): la provano build, preview e un test e2e che naviga il sito cercando violazioni.

### ADR-061 · Sitemap nostra, non @astrojs/sitemap — Presa (deviazione dal brief)
- `@astrojs/sitemap` vede solo le pagine generate in build; i dettagli dei concerti arrivano dal calendario a runtime. `/sitemap.xml` è un endpoint di poche righe che elenca pagine, articoli e tutti i concerti, in cache un'ora. Una dipendenza in meno.

### ADR-062 · Web Analytics con lo snippet, attivabile da `site.json` — Presa
- La documentazione di Cloudflare non garantisce l'iniezione automatica del beacon per i siti serviti da un Worker. Lo snippet ufficiale si aggiunge a ogni pagina solo se `analyticsToken` in `src/content/site.json` non è vuoto (il token è pubblico). Senza cookie, nessun banner.

### ADR-063 · Variabili lette a runtime dove possibile — Presa
- Le variabili `context: 'client'` di `astro:env` vengono scritte nel codice in build e non leggono `.dev.vars`: per questo la chiave della mappa (che serve solo al dettaglio concerti, SSR) è diventata `GOOGLE_MAPS_EMBED_KEY`, letta dal server. Resta in build solo `PUBLIC_TURNSTILE_SITE_KEY`, perché i form stanno anche nelle pagine statiche: `npm run deploy` (via `scripts/check-deploy.mjs`) si rifiuta di partire se è la chiave di test, se mancano gli ID di D1/KV o se calendario e mail sono ancora in modalità di prova.

### ADR-064 · Deploy in due passi, mai automatico — Presa
- Primo deploy su `*.workers.dev` con le `routes` commentate, prove complete, poi dominio custom. La redirect www → apex la fa il Worker per le risposte dinamiche e una Redirect Rule di Cloudflare per gli asset statici (che non passano dal Worker).
- Il workflow GitHub di deploy è pronto ma parte solo a mano (`workflow_dispatch`) ed è in `docs/github/` finché non lo spostate voi in `.github/workflows/`.

### ADR-065 · Site key di Turnstile: `.env.production`, controllata anche nella build — Presa
- Al primo deploy di prova la build ha usato la site key di test: con l'adapter Cloudflare, `.dev.vars` vale anche in build e vince su `.env`. Il server, con la secret vera, rifiutava i token finti, quindi i form online non funzionavano.
- La chiave vera sta in `.env.production` (solo build) e non deve comparire in `.dev.vars`. `npm run deploy` lo controlla prima della build e, dopo, cerca la chiave di test nell'HTML generato: se c'è, il deploy non parte.

### ADR-066 · Concerti: solo l'ora di inizio — Presa (band)
- Il brief chiedeva "21:30–23:30" quando c'è la fine. La band preferisce solo l'inizio: in Google Calendar la fine c'è sempre, e spesso è quella di default (mezz'ora o un'ora dopo), non l'orario vero. La fine resta nei dati: serve per capire quando un concerto è finito, per il file `.ics` e per il JSON-LD.
