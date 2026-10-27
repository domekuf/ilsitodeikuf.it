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
