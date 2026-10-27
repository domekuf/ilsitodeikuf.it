## Ruolo e modo di lavorare

Sei un senior full-stack developer. Il tuo compito è ricostruire da zero **Il Sito dei Kuf** (band indie-rock di Ravenna) con uno stack moderno, a costo zero o quasi e senza server da mantenere. Il vecchio sito è in `./old-ilsitodeikuf.it` (PHP 7, Bootstrap 4 alpha, MDB, jQuery, PHPMailer via SMTP Aruba, Google Calendar API con token OAuth salvato su file). **Non portare nulla del vecchio codice**: prendi solo contenuti, testi e asset.

Regole:

1. Lavora **per fasi** (vedi "Piano di lavoro"). Alla fine di ogni fase fermati, riassumi cosa hai fatto, cosa resta e cosa devo fare io a mano. Aspetta il mio ok prima di passare alla fase successiva.
2. Prima di scrivere codice, controlla la documentazione aggiornata di Astro e di Cloudflare: le API cambiano spesso. Se qualcosa in questo prompt contraddice la documentazione corrente, segui la documentazione e dimmelo.
3. **Non fare mai deploy in produzione, cambi DNS o caricamenti su R2** senza chiedermelo esplicitamente.
4. Non leggere, non copiare e non committare mai `credential.json`, `kws-backend/client_secret.json` o altri segreti del vecchio sito.
5. Tutta la UI e i testi sono in **italiano**. Il codice, i nomi di file e le variabili sono in inglese; i commenti possono essere in italiano.
6. Le dipendenze si aggiungono solo se servono davvero. Ogni dipendenza nuova va motivata in una riga del README.

---

## 1. Cosa c'è oggi (audit del vecchio sito)

| Vecchio path | Cosa fa | Note |
|---|---|---|
| `index.php` | Home dedicata a *Pigna*: cover cliccabile per il download, claim "Ci vediamo a natale.", un video YouTube | Da reinventare da zero |
| `via-trieste.php` | Cover di *Via Trieste* per il download, 2 video | |
| `download.php` | Form nome/email/messaggio + scelta del disco → `controller.php?controller=download` | Manda una mail di ringraziamento all'utente (`mail/index.html`) e una notifica a kuf.ravenna@gmail.com, poi avvia il download dello zip da `public/` |
| `concerti.php` | Tabella dei concerti dal Google Calendar "Kuf che fanno i concerti" (query `Kuf @`), divisi tra "in programma" e "passati"; modale con luogo e link a Google Maps | Orario mai mostrato ("A che ora? Questo non si chiede mai!"). Timezone forzata a UTC (bug) |
| `magliette.php` + `articoli.php` | 5 articoli (array PHP) con taglie e disponibilità; modale con scelta della taglia → contatti | Le taglie non servono più |
| `contatti.php` | Tab Mail / Booking (Ocarina Live) / Press (Dischi Bervisti); form → mail a kuf.ravenna@gmail.com con reply-to del mittente | |
| `press.php` | Press kit: PDF tecnici, loghi, bio "fatti", formazione, discografia, video, recensioni, articoli, SoundCloud | Si tiene come `/press` (vedi §7.9) |
| `footer.php` + `buttons.json` | FAB social in basso a destra con animazione `fadeInUp` sfalsata (Facebook, YouTube, Instagram, Spotify, SoundCloud) | Su mobile usa deep link `fb://` e `instagram://` (da eliminare) |
| `header.php` | Bottone menu in alto a destra che apre una modale con i link | |

Cose da **non** portarsi dietro: tracking verso `muvat.cloud/bot/api/tracker.php` (mandava nome ed email in chiaro in GET), Google Analytics UA (morto dal 2023), email costruite concatenando input utente in HTML (XSS nelle mail), form in GET, token OAuth in un file nella webroot.

---

## 2. Obiettivi

- Sito veloce (Lighthouse ≥ 95 in tutte le categorie, su mobile), accessibile (WCAG 2.2 AA), responsive mobile-first.
- **Zero server da gestire** e costi praticamente nulli (free tier).
- Contenuti facili da aggiornare: i concerti si gestiscono **solo** dal Google Calendar, gli articoli e i dischi con file Markdown/JSON nel repo.
- URL puliti e condivisibili, anche per le modali (deep link).
- Funziona anche senza JavaScript, nei limiti del possibile (progressive enhancement).
- Mantiene l'identità visiva attuale: carta bianca maculata, font Walkway, nero, grigio caldo.

---

## 3. Stack

| Livello | Scelta | Perché |
|---|---|---|
| Framework | **Astro 6** (ultima stabile), output ibrido: pagine statiche dove si può, SSR solo dove serve | Sito di contenuti con poche isole interattive. Astro è ora di Cloudflare: il dev server gira su `workerd`, e i binding (KV/R2) funzionano anche in locale |
| Hosting | **Cloudflare Workers** (static assets + SSR) tramite `@astrojs/cloudflare`, dominio custom `ilsitodeikuf.it` (+ redirect da `www`) | Free tier più che sufficiente. Niente Pages: Cloudflare oggi consiglia Workers per i progetti nuovi |
| Linguaggio | TypeScript `strict` | |
| UI | Componenti `.astro` + piccoli `<script>` in TypeScript vanilla. **Niente React** | Le isole sono poche (modali, form, FAB): non serve un framework client |
| Stili | **Tailwind CSS v4** (`@tailwindcss/vite`) con design token in `@theme` + un CSS globale piccolo | |
| Modali | Elemento nativo `<dialog>` + History API | Focus trap, Esc e `::backdrop` nativi |
| Form e backend | **Astro Actions** (`accept: 'form'`) con validazione Zod | Type-safe, funzionano anche senza JS come POST classico |
| Anti-spam | **Cloudflare Turnstile** + campo honeypot + binding **Rate Limiting** di Workers | |
| Email | **Resend** (free: 3.000 mail al mese, 100 al giorno) dietro un'interfaccia `MailProvider`. Provider alternativo: Cloudflare Email Service (`env.EMAIL.send`), che però richiede il piano Workers Paid ed è ancora in beta | Il dominio si verifica con SPF/DKIM su un sottodominio (es. `send.ilsitodeikuf.it`) |
| Concerti | **Google Calendar API v3** con **service account** in sola lettura (il calendario va condiviso con l'email del service account). JWT RS256 firmato con WebCrypto (o `jose`), access token in cache | Basta refresh token OAuth che scadono o file nella webroot |
| Foto delle venue | **Google Places API (New)**: Text Search (IDs Only, gratis senza limiti) per trovare il `place_id`, poi Place Photos (1.000 richieste al mese gratis) | Fallback su placeholder locali |
| Mappa | Link Google Maps URLs (`https://www.google.com/maps/search/?api=1&query=…`) + iframe opzionale con **Maps Embed API** (gratuita) | |
| File grandi | **Cloudflare R2** per gli zip dei dischi (≈120 MB l'uno: troppo grandi per gli static assets di Workers, che hanno un limite di 25 MiB a file) | Egress gratis |
| Database | **Cloudflare D1** (SQLite) per i contatti e le richieste, con registro dei consensi. Migrazioni SQL versionate con `wrangler d1 migrations` | Free tier più che sufficiente, nessun server |
| Cache | **Workers KV** (place_id delle venue, token Google) + Cache API (risposte del calendario) | |
| Video | Facade leggera per YouTube (`lite-youtube-embed` o `@astro-community/astro-embed-youtube`) su `youtube-nocookie.com`. Titoli e thumbnail presi in build via oEmbed (`https://www.youtube.com/oembed?url=…&format=json`, non serve una chiave) | Niente iframe pesanti al caricamento |
| Icone | `astro-icon` + set Iconify `simple-icons` (social) e `lucide` (UI) | |
| Analytics | **Cloudflare Web Analytics** (senza cookie, nessun banner) | |
| Notifiche | Solo email a kuf.ravenna@gmail.com. **Nessuna integrazione Telegram o tracker esterni** | |
| Qualità | ESLint + Prettier, `astro check`, **Vitest** (logica in `src/lib`), **Playwright** (e2e su modali e form) | |
| CI/CD | GitHub Actions: lint, check, test, build su ogni PR; deploy con `wrangler deploy` su `main` (manuale finché non ti do l'ok) | |

---

## 4. Architettura e struttura

```
Browser ──► Cloudflare Worker (Astro)
             ├─ static assets (pagine prerenderizzate, immagini ottimizzate, font)
             ├─ SSR: /concerti, /concerti/[slug], server island "prossimo concerto"
             ├─ Actions: contatto, richiestaDownload
             ├─ GET /api/venue-photos?slug=…   (Places API + cache)
             ├─ GET /api/download/[token]      (stream da R2)
             └─ /disiscriviti/[token]          (revoca del consenso)
                      │            │           │          │          │
              Google Calendar   Places API   Resend    R2 / KV       D1
```

```
src/
  components/
    layout/      BaseLayout.astro, Header.astro, MenuOverlay.astro, Footer.astro
    ui/          Modal.astro (wrapper <dialog>), Button.astro, Card.astro
    social/      SocialDock.astro (FAB)
    forms/       ContactForm.astro (condiviso), DownloadForm.astro, Turnstile.astro
    concerti/    ConcertList.astro, ConcertItem.astro, ConcertDetail.astro, VenueGallery.astro
    articoli/    ArticleGrid.astro, ArticleDetail.astro
    album/       AlbumHero.astro, Tracklist.astro, VideoList.astro
    forms/       … + ConsentCheckbox.astro
    press/       PressDownloads.astro, Bio.astro, Discography.astro
    home/        Hero.astro, NextConcert.astro (server island), AlbumShelf.astro, KufFacts.astro, MerchTeaser.astro, Listen.astro
  content/
    articoli/*.md       (content collection)
    albums/*.md         (pigna.md, via-trieste.md)
    site.json           (social, contatti, fatti sui Kuf)
    press.md            (bio, formazione, recensioni, articoli)
  lib/
    calendar.ts   google-auth.ts   places.ts   mail/ (index.ts, resend.ts, cloudflare.ts, log.ts)
    download-token.ts   slug.ts   dates.ts   turnstile.ts
    db/ (contacts.ts, submissions.ts, consents.ts)
  actions/index.ts
  pages/
    index.astro
    concerti/index.astro   concerti/[slug].astro
    articoli/index.astro   articoli/[slug].astro
    contattaci.astro
    via-trieste.astro   pigna.astro   press.astro
    privacy.astro   disiscriviti/[token].astro   404.astro
    api/venue-photos.ts   api/download/[token].ts
migrations/       0001_init.sql, …   (D1)
scripts/          export-contacts.sh, upload-downloads.sh
  scripts/        modal-router.ts, social-dock.ts, reveal.ts
  styles/global.css
public/           fonts/, favicon/, robots.txt
emails/           templates per le mail (TS che restituisce html + text)
tests/            unit/, e2e/, fixtures/calendar-events.json
wrangler.jsonc
```

---

## 5. Identità visiva e motion

**Direzione:** partire dalla semplicità del sito attuale (bianco, nero, la scritta KUF, la carta maculata) e darle una **rinfrescata sobria**. Stessa identità, più pulita e più ariosa. Niente effetti vistosi, gradienti, glassmorphism o colori nuovi. Il risultato deve sembrare "il sito dei Kuf, ma fatto oggi", non un altro sito.

- **Sfondo:** la carta maculata del vecchio sito (`img/bground.jpg`) diventa più discreta. Ricava una **texture tileable leggera** (pochi KB, AVIF/WebP) con le macchie d'inchiostro più rade e a bassa opacità su un bianco caldo. Applicala al `body` e lascia le aree di lettura (card, modali, form) su bianco pieno, così il testo resta pulito. Nessuno sfondo fisso pesante su mobile.
- **Logo:** ridisegna la scritta `KUF` (`img/logo-01.png`/`logo-02.png`) come **SVG vettoriale** con lo stesso tratto sottile e geometrico. Pulisci le curve, sistema la spaziatura ottica tra le lettere e definisci un'area di rispetto. Prepara tre varianti: wordmark completo, wordmark compatto per l'header, monogramma `K` per la favicon. Niente restyling del carattere: è lo stesso logo, solo più preciso. Mostrami le varianti prima di usarle ovunque.
- **Font titoli:** Walkway Bold (`font/walkway/`), convertito in `woff2` con `fonttools`, subset latin, `font-display: swap` e preload. Usalo solo per titoli e numeri grandi, con un po' più di interlinea e di spaziatura rispetto al vecchio sito.
- **Font testo:** un sans neutro e leggibile (Inter variable self-hosted o font di sistema), corpo 17–18px, righe di 60–70 caratteri.
- **Palette:** bianco caldo `#FBFAF7` (fondo), bianco `#FFFFFF` (superfici), inchiostro `#141414` (testo), grigio caldo `#797264` (accento, ripreso dai bottoni originali) e una sua variante più scura per hover e contrasto. Un solo colore di segnalazione, sobrio, per il badge "prossimo concerto". Contrasti AA verificati.
- **Linguaggio visivo:**
  - titoli in maiuscolo Walkway con il **separatore sottile** sotto, omaggio al vecchio `pigna-separator`, e sottotitoli piccoli e spaziati;
  - griglia generosa, tanto spazio bianco, filetti sottili (1px inchiostro al 15%) al posto delle ombre pesanti di Material Design;
  - angoli appena arrotondati (4–6px), bottoni pieni inchiostro o outline, niente effetti "ripple";
  - foto della band in bianco e nero, che tornano a colori solo all'hover (desktop).
- **Motion:** discreta e breve (150–300 ms, easing morbido). Sostituisci WOW.js e animate.css con CSS nativo:
  - reveal allo scroll con `animation-timeline: view()` dove supportato, altrimenti nessuna animazione;
  - transizioni di pagina con le View Transitions di Astro (`<ClientRouter />`);
  - apertura e chiusura delle modali con `@starting-style` e `transition-behavior: allow-discrete`;
  - tutto disattivato con `prefers-reduced-motion: reduce`.
- **Dark mode:** non serve; il sito è "di carta".
- **Fase di design:** prima di applicare il design a tutte le pagine, prepara una `/styleguide` (solo in dev) con logo, tipografia, colori, bottoni, card, form e una modale d'esempio, e fammela vedere.

---

## 6. Componenti condivisi

### 6.1 Modali con URL (pattern unico, in `scripts/modal-router.ts`)

Vale per `/concerti/[slug]`, `/articoli/[slug]` e `/contattaci`.

- **Accesso diretto** (es. apro `/concerti/2017-11-17-almagia` da un link condiviso): il server renderizza la pagina "sotto" (la lista) e il `<dialog>` aperto con il contenuto completo nell'HTML. Così è indicizzabile e funziona senza JS.
- **Navigazione interna:** i link con `data-modal-link` vengono intercettati. Si apre il `<dialog>`, si fa `history.pushState` sull'URL di dettaglio e si aggiorna `document.title`. Il contenuto arriva da dati già presenti nella pagina (articoli) oppure da un fetch del frammento (concerti).
- **Chiusura** (X, Esc, click sul backdrop): se la modale è stata aperta con `pushState`, si fa `history.back()`; se si è arrivati con un link diretto, si fa `history.replaceState` all'URL della lista.
- **Indietro e avanti del browser** (`popstate`) aprono e chiudono le modali in modo coerente.
- **Accessibilità:** `aria-labelledby` sul titolo, il focus torna sull'elemento che ha aperto la modale, lo scroll del body è bloccato. Su mobile la modale è a schermo intero (bottom sheet), su desktop è centrata.
- **SEO:** `<link rel="canonical">` sull'URL di dettaglio, meta OG specifici (titolo, immagine).

### 6.2 `ContactForm.astro` (condiviso tra `/contattaci` e `/articoli/[slug]`)

- Campi: **Nome** (obbligatorio), **Email** (obbligatoria, validata), **Messaggio** (obbligatorio, max 5.000 caratteri), **consensi** (vedi `ConsentCheckbox` in §6.7), honeypot nascosto, widget Turnstile.
- Props: `subject?` (oggetto precompilato), `context?` (es. `{ type: 'articolo', slug, nome }`), `placeholder?`.
- Usa l'Action `contatto`, che dopo le verifiche **salva su D1** il contatto, la richiesta e i consensi (§8.5) e poi manda la mail. Se il salvataggio su D1 fallisce, la mail parte comunque e l'errore va nei log (senza dati personali). Stati: idle → invio (bottone disabilitato con spinner) → successo ("Grazie di averci scritto, {nome}!", nel tono del vecchio sito) → errore (messaggio umano e invito a scrivere a kuf.ravenna@gmail.com).
- Mail a **kuf.ravenna@gmail.com**, `Reply-To` = mittente. Oggetto `[sito] {oggetto o "Nuovo messaggio"}` oppure `[articolo] {nome articolo}`. Corpo in text + HTML con **tutto l'input escapato**, più il contesto (pagina di provenienza, articolo).
- **Non** si manda nessuna copia al mittente: il form non deve poter diventare un relay di spam.
- Messaggi di validazione in italiano, accanto al campo, `aria-live`.

### 6.3 `DownloadForm.astro` (per `/via-trieste` e `/pigna`)

- Campi: **Nome** (obbligatorio), **Email** (obbligatoria), **Messaggio** (opzionale), **consensi** (`ConsentCheckbox`, §6.7), Turnstile, honeypot. Prop `album: 'pigna' | 'via-trieste'`.
- Testo del vecchio sito: "Ci terremo in contatto solo se vorrai." più un link a `/privacy`. La frase ora è vera alla lettera: li ricontattiamo solo se spuntano la casella degli aggiornamenti.
- Action `richiestaDownload`:
  1. valida e controlla Turnstile e rate limit (es. 5 richieste ogni 10 minuti per IP);
  2. **salva su D1** contatto, richiesta (`type: 'download'`, album) e consensi (§8.5);
  3. genera un **token firmato HMAC-SHA256** (`{ album, submissionId, exp }`, con scadenza 7 giorni) con `DOWNLOAD_TOKEN_SECRET`;
  4. manda una **notifica a kuf.ravenna@gmail.com**: oggetto `[download] Pigna`, nome, email, messaggio, consenso aggiornamenti sì/no, `Reply-To` utente;
  5. manda la **mail di ringraziamento all'utente** con un template fisso ispirato a `mail/index.html` ("A presto, {nome}! Sono quelli come te il motivo per cui facciamo tutto.") e il link di download valido 7 giorni. L'unico dato dell'utente nel template è il nome, escapato. Se l'utente ha dato il consenso agli aggiornamenti, in fondo c'è il link "Non voglio più ricevere notizie" (`/disiscriviti/[token]`);
  6. risponde con l'URL `/api/download/{token}`. Il client avvia subito il download e mostra "Grazie davvero, {nome}!".
- `GET /api/download/[token]`: verifica firma e scadenza, poi fa lo stream dell'oggetto R2 (`downloads/kuf-pigna-2017.zip`) con `Content-Disposition: attachment; filename="Kuf - Pigna (2017).zip"` e `Content-Length`, e incrementa `download_count` della richiesta su D1 (senza bloccare lo stream, con `ctx.waitUntil`). Se il token è scaduto, mostra una pagina gentile con il link per richiederne un altro.

### 6.4 `SocialDock.astro` (il FAB, presente in tutte le pagine)

- Posizione fissa in basso a destra, `safe-area-inset` rispettato, non copre i bottoni delle modali (z-index sotto il `<dialog>`).
- **Desktop (≥ md):** colonna verticale di bottoni rotondi (Facebook, YouTube, Instagram, Spotify, SoundCloud) che entrano al caricamento con un'animazione sfalsata dal basso (omaggio al vecchio `fadeInUp` con delay crescente), con tooltip a sinistra all'hover.
- **Mobile:** un solo FAB "speed dial" (icona nota musicale o `+`) che al tap espande i social a ventaglio o in colonna, con animazione sfalsata, e si chiude al tap fuori o su Esc. `aria-expanded`, `aria-controls`, `aria-label` su ogni link.
- Alla prima visita, un piccolo "pulse" dopo 2 secondi; si disattiva con reduced-motion.
- Si nasconde mentre si scrive in un form su mobile (per non coprire la tastiera).
- Link (da `site.json`; solo URL https, i sistemi operativi aprono le app da soli):
  - Facebook: `https://www.facebook.com/kufff`
  - YouTube: `https://www.youtube.com/channel/UCTWu6UbxU95DmHe3LJIHbrw`
  - Instagram: `https://www.instagram.com/kuf.quellichesuonano`
  - Spotify: `https://open.spotify.com/artist/19RHxgdzVkXbRI6IcwMPz3`
  - SoundCloud: `https://soundcloud.com/kuf-4`
- Colori di brand all'hover, monocromatici (inchiostro su carta) a riposo.

### 6.5 Header e menu

- Header minimale: logo KUF (SVG) a sinistra che porta alla home, bottone menu a destra (come nel vecchio sito).
- Il menu è un overlay a schermo intero su carta con link enormi in Walkway: **Home, Concerti, Pigna (2017), Via Trieste (2015), Articoli, Press, Contattaci**. Ingresso sfalsato dei link, voce attiva evidenziata.
- Su desktop largo puoi anche mostrare i link inline: decidi tu, motivando la scelta.

### 6.6 `VideoList.astro`

- Prop: lista di `{ id, start? }`. Titoli e thumbnail da oEmbed in build, con fallback al solo ID se oEmbed fallisce.
- Griglia responsive (1 colonna su mobile, 2–3 su desktop), facade con play, iframe `youtube-nocookie` caricato al click. Il parametro `t=53s` diventa `start=53`.

### 6.7 `ConsentCheckbox.astro` (consensi espliciti, usato da tutti i form)

- **Riga informativa obbligatoria** (non è una checkbox): "Usiamo nome ed email per risponderti / mandarti il disco e li conserviamo come spiegato nell'[informativa privacy](/privacy)." Rispondere o mandare il disco è la base del trattamento, quindi qui non serve un consenso e il form non va bloccato.
- **Checkbox facoltativa, non spuntata di default:** "Voglio ricevere ogni tanto notizie dai Kuf (nuovi dischi, concerti). Posso cancellarmi quando voglio." È l'unico consenso esplicito e non è mai una condizione per scaricare o scrivere.
- Il testo esatto di ogni consenso ha una **versione** (`CONSENT_TEXT_VERSION`, es. `2026-11-v1`) salvata insieme al consenso. Se il testo cambia, la versione si incrementa.
- Accessibile: `<input type="checkbox">` reale, label cliccabile, nessun pre-check via JS.

---

## 7. Pagine

### 7.1 `/` (home, da inventare da zero)

Concept: **"Il foglio dei Kuf"**, una pagina di carta su cui sono appoggiate le cose della band. Sezioni, in ordine:

Tutto nel registro sobrio del §5: le animazioni sono piccoli dettagli, non numeri da circo.

1. **Hero:** logo KUF grande (SVG) che compare con un fade breve, sotto il claim *"Un gruppo di Ravenna che, a volte, fa la musica forte."* (dal vecchio meta description). Accanto o sotto, una foto della band (`img/kuf-foto-mare.jpg`) in bianco e nero, ritagliata pulita, senza parallax.
2. **Prossimo concerto** (server island `server:defer`, con skeleton nel frattempo): data grande (gg MMM), luogo, città, orario, link al dettaglio `/concerti/[slug]` e bottone "Aggiungi al calendario" (.ics). Se non ci sono concerti in programma: *"Nessun concerto in programma. Ci vediamo a natale."* (il claim storico di Pigna) e link ai concerti passati.
3. **Dischi:** le due cover affiancate, dritte, con un'ombra leggera. All'hover si sollevano di pochi pixel. Sotto: "Pigna, 2017" e "Via Trieste, 2015", con il link "Ascolta e scarica gratis" verso `/pigna` e `/via-trieste`.
4. **Cose vere sui Kuf:** i "fatti" della bio del press kit, una frase alla volta in grande (Walkway), con il link "Dimmi un'altra cosa vera" che passa alla successiva con una dissolvenza. Testi (in `site.json`):
   - I Kuf sono di Ravenna e sono nati nel 2014.
   - I Kuf cantano in italiano perché pensano in italiano.
   - I brani dei Kuf non sono registrati alla SIAE e non lo saranno mai.
   - La parola Kuf potrebbe significare tante cose, ma non significa niente.
   - Secondo Rockit i gruppi non devono contenere la 'K' all'interno del nome, quindi se hai un gruppo, ricordati di non chiamarlo Kuf.
   - I Kuf suonano musica dura: a volte no, a volte sì.
   - I Kuf si pronunciano con la U (no Kaf da anglosassone, né Kiuf da mittel-europeo, ma Kuf).
   - I Kuf stanno scrivendo altre canzoni e quando saranno belle usciranno.
5. **Le cose da avere dei Kuf:** teaser con 3 articoli e link a `/articoli`.
6. **Ascolta:** embed Spotify dell'artista caricato solo quando entra in viewport (facade), più link a YouTube e SoundCloud.
7. **Footer:** menu compatto, link Contattaci (apre la modale), Press, privacy, © anno, e la riga *"I brani dei Kuf non sono registrati alla SIAE e non lo saranno mai."*

Pagina prerenderizzata, con il solo "prossimo concerto" dinamico.

### 7.2 `/concerti`

- SSR, con cache (vedi §8.1). Titolo "CONCERTI", sottotitolo "PER SENTIRE I KUF".
- Due sezioni:
  - **In programma**, in ordine crescente. Il primo concerto è evidenziato ("il prossimo").
  - **Passati**, in ordine decrescente e raggruppati per anno (anni collassabili, l'anno corrente aperto).
- Ogni riga o card mostra data (`ven 17 nov 2017`), titolo (summary senza il prefisso `Kuf @ `), città o luogo breve. Tutta la card è un `data-modal-link` verso `/concerti/[slug]`.
- Stato vuoto e stato d'errore (calendario irraggiungibile: mostra l'ultima versione in cache o un messaggio gentile).
- JSON-LD `MusicEvent` per ogni concerto futuro (SEO).

### 7.3 `/concerti/[slug]` (modale di dettaglio)

- **Slug:** `YYYY-MM-DD-{slug del titolo}` (es. `2017-11-17-almagia`), generato in `lib/slug.ts` (minuscolo, senza accenti, trattini). In caso di collisione si aggiunge un suffisso `-2`. Se lo slug non esiste: 404 con link alla lista.
- **Contenuto della modale:**
  - Titolo e badge "Prossimo", "In programma" o "Passato".
  - **Data e orario** in `Europe/Rome`: "venerdì 17 novembre 2017 · ore 21:30". Se c'è anche la fine: "21:30–23:30". Se l'evento è "tutto il giorno": "Orario da definire".
  - **Luogo:** il campo `location` dell'evento, con bottone "Apri in Google Maps" (`https://www.google.com/maps/search/?api=1&query={location}` URL-encoded) e, se è configurata la chiave embed, una mappa iframe lazy.
  - **Foto della venue** (`VenueGallery`): 3 foto caricate in lazy da `/api/venue-photos?slug=…` quando la modale si apre, con skeleton, carosello con swipe su mobile e attribuzioni degli autori visibili ("Foto: {autore} via Google Maps"), come richiesto dai termini di Google. Se non ci sono foto o arriva un errore, **placeholder**: 3 immagini scelte in modo deterministico (hash dello slug) da un pool locale di 8–10 immagini a tema (texture di carta, pigne, gufo, palco, luci, folla sfocata), generate o selezionate da te e ottimizzate.
  - **Link opzionali** dalla descrizione dell'evento (vedi §8.1): "Evento / biglietti".
  - Per i concerti futuri: "Aggiungi al calendario" (.ics generato) e "Condividi" (Web Share API, con fallback "copia link").
- **Mai** mostrare la descrizione grezza dell'evento: può contenere note private.

### 7.4 `/contattaci`

- Apre la modale con `ContactForm` (oggetto libero).
- Accesso diretto: renderizza la **home** con la modale aperta. Da qualsiasi altra pagina, il link "Contattaci" (menu e footer) apre la modale sopra la pagina corrente e fa `pushState('/contattaci')`.
- Dentro la modale, sotto il form: "Oppure scrivici a kuf.ravenna@gmail.com" (link `mailto`, offuscato contro gli scraper).

### 7.5 `/articoli` (ex `magliette.php`)

- Prerenderizzata. Titolo "ARTICOLI", sottotitolo "LE COSE DA AVERE DEI KUF".
- Griglia di card (2 colonne su mobile, 3–4 su desktop) con foto (zoom leggero all'hover come il vecchio `hm-zoom`) e nome. **Nessuna taglia e nessun prezzo.**
- Gli articoli con `disponibile: false` restano visibili con il badge "Finito" e senza form nel dettaglio (o con il form "avvisatemi se torna", a tua scelta).

### 7.6 `/articoli/[slug]` (modale di dettaglio)

- Prerenderizzata (`getStaticPaths`). Layout a due colonne su desktop: foto grande (con galleria se ci sono più immagini) e a destra nome, descrizione e **`ContactForm`** con `subject="Vorrei: {nome}"`, `context={{type:'articolo', slug, nome}}` e placeholder "Scrivici taglia, quantità e come preferisci ritirarla". **Nessun prezzo**: non va mostrato da nessuna parte (né in pagina, né nel JSON-LD, né nei meta).
- **Dati iniziali** (collection `articoli`, migrati da `articoli.php`; lo schema non ha un campo prezzo):

| slug | nome | immagine | disponibile |
|---|---|---|---|
| `maglietta-pigna-grigia` | Maglietta grigia con la pigna | magliette-01.jpg | sì |
| `maglietta-gufo-verde-militare` | Maglietta verde militare con il gufo | magliette-02.jpg | sì |
| `maglietta-gufo-rossa` | Maglietta rossa con il gufo | magliette-03.jpg | sì |
| `maglietta-gufo-verde-acqua` | Maglietta verde acqua con il gufo | magliette-04.jpg | sì |
| `felpa-gufo-grigia` | Felpa grigia con il gufo | magliette-05.jpg | sì |

### 7.7 `/via-trieste`

- Prerenderizzata. Hero con cover grande, "VIA TRIESTE", "IL PRIMO DISCO DEI KUF · 2015".
- **Tracklist** (dalla collection `albums`): 1. Chissà chi verrà · 2. Fuori da qui · 3. Walden · 4. Via Trieste · 5. L'unico centro è il confine · 6. Verranno a prenderci · 7. Atto pubblico · 8. Motosega · 9. La sindrome di Notredame · 10. Contare gli inverni · 11. Lo sappiamo da vent'anni · 12. La fine.
- `DownloadForm album="via-trieste"`.
- Sezione "I VIDEO": `VideoList` con `_dnIV2LMYsk`, `9oSAwVecXAA`, `ES_G9WQaA3s`.
- Link d'ascolto (Spotify, YouTube, recensione Rockit 2015).

### 7.8 `/pigna`

- Uguale a `/via-trieste`: "PIGNA", "IL SECONDO DISCO DEI KUF · 2017".
- **Tracklist:** 1. Agosto · 2. Fin qui tutto bene · 3. Matite · 4. Tenco e Pasolini · 5. Per farti più male · 6. Milano non esiste · 7. Neve · 8. Divani · 9. La tempesta · 10. Nebbia.
- `DownloadForm album="pigna"`.
- `VideoList` con `W5f-Ee0XWP4`, `dgj6n8ed7fg` (start 53s), `FJxuP2goFB4`.

### 7.9 `/press` (press kit)

È l'unica parte del vecchio `press.php` e di `contatti.php` che resta: **niente booking** (Ocarina Live) e niente ufficio stampa (Dischi Bervisti).

- Prerenderizzata. Titolo "KUF", sottotitolo "PRESS KIT".
- **Area download** in evidenza in alto, come lista di card con icona, nome, formato e peso:
  - **Scheda tecnica** (PDF): `public/scheda-tecnica.pdf`;
  - **Stage plan** (PDF): `public/stage-plan.pdf`;
  - **Loghi**: il wordmark e il monogramma nuovi in SVG e PNG (su fondo trasparente, in nero e in bianco), forniti come singoli file e come zip `kuf-loghi.zip` generato in build. Se i loghi nuovi non sono ancora approvati, usa `img/logo-01.png` e `img/logo-02.png`.
  - I file vanno serviti come static assets (sono piccoli) con `Content-Disposition: attachment` e nomi puliti (`Kuf - Scheda tecnica.pdf`). Nessun form: sono liberamente scaricabili.
- **Bio:** il testo breve "Due parole, proprio due" (con link a iyezine) e i "fatti" (da `site.json`, gli stessi della home).
- **Formazione:** da `press.php`. Chiedimi conferma prima di pubblicarla: potrebbe essere cambiata.
- **Discografia:** Pigna (2017) e Via Trieste (2015), con link alle pagine dei dischi.
- **Video:** elenco compatto con link alle pagine dei dischi, oppure `VideoList` riusato.
- **Recensioni e articoli:** le liste di `press.php`, come link esterni (`rel="noopener"`). Controlla quali link sono ancora vivi e segnalami quelli morti invece di pubblicarli.
- Il vecchio `lista-canali.pdf` non si pubblica (è già dentro la scheda tecnica).

### 7.10 `/privacy`, `/disiscriviti/[token]` e `404`

- `/privacy`: informativa breve e chiara (bozza da far rivedere a noi):
  - titolare: i Kuf, con contatto kuf.ravenna@gmail.com;
  - dati raccolti: nome, email, messaggio, album scaricato o articolo richiesto, data, consensi dati e loro versione;
  - finalità e basi giuridiche: rispondere ai messaggi e mandare il disco (richiesta dell'interessato); mandare notizie solo con consenso esplicito e revocabile;
  - conservazione: richieste e messaggi per 24 mesi, poi cancellati in automatico; contatti con consenso agli aggiornamenti finché il consenso non viene revocato;
  - fornitori: Cloudflare (hosting e database) e Resend (invio email);
  - nessun cookie di tracciamento e nessuna profilazione;
  - diritti: accesso, rettifica, cancellazione e revoca, scrivendo a kuf.ravenna@gmail.com o dal link nelle mail.
- `/disiscriviti/[token]`: pagina che conferma la revoca del consenso agli aggiornamenti, con un bottone (POST) per non far scattare la revoca dai prefetch dei client di posta. Il token è firmato HMAC e legato al contatto.
- `404`: "Qui non c'è niente. Come la parola Kuf." con link alla home e ai concerti.

### 7.11 Redirect dai vecchi URL (301)

Nella config `redirects` di Astro o in `_redirects`:

| Da | A |
|---|---|
| `/index.php` | `/` |
| `/via-trieste.php` | `/via-trieste` |
| `/concerti.php` | `/concerti` |
| `/magliette.php` | `/articoli` |
| `/contatti.php` | `/contattaci` |
| `/download.php` (anche `?dl=Pigna.zip`) | `/pigna` (`?dl=ViaTrieste.zip` → `/via-trieste`) |
| `/press.php` | `/press` |
| `/public/Pigna.zip`, `/public/ViaTrieste.zip` | pagina del disco corrispondente |
| `/public/scheda-tecnica.pdf`, `/public/stage-plan.pdf` | i nuovi file in `/press/` |
| `/public/lista-canali.pdf` | `/press` |

---

## 8. Backend in dettaglio

### 8.1 `lib/calendar.ts`

- Autenticazione: service account con scope `https://www.googleapis.com/auth/calendar.readonly`. Il JWT è firmato in `lib/google-auth.ts` con WebCrypto (`RSASSA-PKCS1-v1_5`, chiave PKCS8 dal secret) e scambiato con `https://oauth2.googleapis.com/token`. L'access token sta in KV (TTL 50 min).
- `GOOGLE_CALENDAR_ID` è nella config: **non** si cerca il calendario per nome, perché la `calendarList` del service account è vuota.
- Chiamata: `events.list` con `singleEvents=true`, `orderBy=startTime`, `timeZone=Europe/Rome`, `maxResults=2500`, `q` = `CALENDAR_QUERY` (default `Kuf @`, configurabile; vuoto = nessun filtro), con paginazione.
- Mapping verso un tipo `Concert`:

```ts
type Concert = {
  id: string; slug: string;
  title: string;          // summary senza prefisso /^Kuf\s*@\s*/i
  start: string; end?: string; allDay: boolean;  // ISO, Europe/Rome
  location?: string;       // testo libero dell'evento
  city?: string;           // estratta in modo euristico dalla location
  links: { label: string; url: string }[];
  photoOverride?: string[];
  status: 'upcoming' | 'past';
}
```

- **Convenzione per la descrizione dell'evento** (documentala nel README): si leggono solo le righe `link: https://…` (label opzionale: `link: Biglietti | https://…`) e `foto: https://…` (foto della venue che sostituiscono Places). Tutto il resto viene ignorato.
- Cache: risposta normalizzata nella Cache API / KV per 15 minuti, `stale-while-revalidate`. Se Google fallisce si serve l'ultima copia valida.
- Gli eventi cancellati (`status: cancelled`) si escludono.
- Test con fixture JSON: evento con orario, evento all-day, evento a cavallo della mezzanotte, cambio ora legale, slug con accenti, collisioni di slug.

### 8.2 `lib/places.ts` e `/api/venue-photos`

1. Trova il concerto dallo slug. Se ha `photoOverride`, restituisce quelle foto.
2. Cerca il `place_id` in KV (chiave = hash normalizzato della location). Se non c'è, fa una **Text Search (New)** con field mask `places.id` (SKU IDs Only, gratuito) e salva il `place_id` in KV senza scadenza: è l'unico dato di Places che si può tenere a tempo indeterminato.
3. **Place Details (New)** con field mask `photos`, prende le prime 3 foto, poi chiama `GET …/{photo.name}/media?maxWidthPx=1200&skipHttpRedirect=true` per avere `photoUri` e le `authorAttributions`.
4. Risponde con `{ photos: [{ url, width, height, attributions }], source: 'google' | 'override' | 'placeholder' }` e cache edge breve (qualche ora, nel rispetto dei termini Google; niente salvataggio delle immagini su R2).
5. Su qualsiasi errore o quota esaurita: `source: 'placeholder'`.
6. Chiave API solo lato server, ristretta alla Places API (New).

### 8.3 `lib/mail`

- Interfaccia `MailProvider.send({ to, from, replyTo?, subject, html, text })`.
- Implementazioni: `resend` (default), `cloudflare` (binding `EMAIL`), `log` (dev e test: stampa in console).
- Si sceglie con `MAIL_PROVIDER`.
- Template in `emails/`: `contactNotification`, `downloadNotification`, `downloadThankYou`. HTML semplice e compatibile con i client di posta (tabella, inline style), colori e logo del sito, più la versione testo.
- **Escaping obbligatorio** di ogni input utente, con un test dedicato.

### 8.4 Sicurezza

- Turnstile verificato lato server (`siteverify`) in ogni Action, con un test che dimostra che un token mancante o non valido viene rifiutato.
- Rate limiting con il binding `ratelimits` di Workers (chiave = IP + action).
- Header in `_headers` o middleware: CSP stretta (permettere solo YouTube-nocookie, Spotify, Google Maps embed, Turnstile, immagini da `lh3.googleusercontent.com`/`places.googleapis.com`), `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`.
- I dati personali stanno **solo su D1** (§8.5): niente dati personali nei log, nelle URL o in KV. L'IP non si salva in chiaro (al massimo un hash con salt per il rate limit, che non va su D1).
- Query D1 sempre parametrizzate (`prepare().bind()`), mai stringhe concatenate.

### 8.5 D1: contatti e consensi

Schema iniziale (`migrations/0001_init.sql`, adattalo se serve ma mantieni il modello):

```sql
CREATE TABLE contacts (
  id               INTEGER PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- normalizzata (trim, lowercase)
  name             TEXT NOT NULL,                         -- ultimo nome usato
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribe_salt TEXT NOT NULL                          -- per i token di disiscrizione
);

CREATE TABLE submissions (
  id             INTEGER PRIMARY KEY,
  contact_id     INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('contact','download','articolo')),
  ref            TEXT,              -- slug album o articolo
  subject        TEXT,
  message        TEXT,
  page           TEXT,              -- path di provenienza
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Registro append-only: ogni concessione o revoca è una riga nuova (prova del consenso)
CREATE TABLE consents (
  id           INTEGER PRIMARY KEY,
  contact_id   INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL CHECK (purpose IN ('updates')),
  granted      INTEGER NOT NULL CHECK (granted IN (0,1)),
  text_version TEXT NOT NULL,       -- CONSENT_TEXT_VERSION
  source       TEXT NOT NULL,       -- 'form:download:pigna', 'form:contact', 'unsubscribe', …
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_submissions_contact ON submissions(contact_id);
CREATE INDEX idx_consents_contact ON consents(contact_id, purpose, created_at);

-- Vista comoda: stato attuale del consenso per contatto
CREATE VIEW contacts_updates_optin AS
SELECT c.*, (SELECT granted FROM consents k
             WHERE k.contact_id = c.id AND k.purpose = 'updates'
             ORDER BY k.created_at DESC, k.id DESC LIMIT 1) AS updates_optin
FROM contacts c;
```

Regole:

- **Upsert del contatto** per email (`INSERT … ON CONFLICT(email) DO UPDATE SET name=…, updated_at=…`), poi insert della submission. Tutto in un `batch()` D1.
- Un consenso si registra **solo quando c'è un'azione esplicita**: checkbox spuntata → riga `granted=1`. Checkbox non spuntata → **nessuna riga** (non si revoca un consenso dato in passato solo perché stavolta la casella non è spuntata). Revoca da `/disiscriviti` → riga `granted=0`.
- **Retention:** un Cron Trigger del Worker (una volta al giorno) cancella le `submissions` più vecchie di 24 mesi e i `contacts` senza submission recenti e senza consenso attivo. I parametri sono in config. Testalo.
- **Export per la band:** `scripts/export-contacts.sh` che con `wrangler d1 execute --remote` esporta in CSV gli iscritti con consenso attivo (nome, email, data del consenso). Nessun pannello admin web per ora.
- **Diritto alla cancellazione:** `scripts/delete-contact.sh <email>` che cancella il contatto e tutto ciò che è collegato (cascade).
- Test (Vitest con D1 locale o Miniflare): upsert, consenso concesso, consenso non spuntato che non cancella quello precedente, revoca, retention.

---

## 9. Contenuti e asset da migrare

| Sorgente nel vecchio sito | Destinazione | Lavoro |
|---|---|---|
| `font/walkway/*` | `public/fonts/walkway-bold.woff2` | Conversione con fonttools, subset latin |
| `img/bground.jpg` (1920×2560) | `src/assets/paper.jpg` | Ottimizzazione AVIF/WebP |
| `img/logo-01.png`, `logo-02.png` | `src/assets/logo-kuf.svg` | Vettorializzazione |
| `img/pigna.png` (solo 180px), `img/viaTrieste.png` (250px) | `src/assets/covers/` | **Troppo piccole**: esporta una cover hi-res da `projects/pigna-cover.psd` (servirà `psd-tools` o un export manuale). Per Via Trieste chiedimi un file in alta risoluzione; nel frattempo usa l'upscale migliore possibile, segnalato con un TODO |
| `img/magliette-01..05.jpg` | `src/content/articoli/images/` | Ottimizzazione via `astro:assets` |
| `img/kuf-foto-mare.jpg`, `kuf-divisa.jpg`, `kuf-simo.jpg` | `src/assets/band/` | Per la home (`kuf-foto-bronson.jpg` è vuoto: da ignorare) |
| `favicon-cover/*` | `public/favicon/` | Rigenera un set moderno (SVG, ico 32, apple-touch 180, manifest 192/512) partendo dalla pigna |
| `public/Pigna.zip`, `public/ViaTrieste.zip` | R2 `kuf-downloads/` | **Ricrea gli zip puliti** (senza `__MACOSX/` e senza il file `Icon\r`), aggiungi `cover.jpg` e verifica i tag ID3. Nome: `Kuf - Pigna (2017).zip`. Prepara uno script `scripts/upload-downloads.sh` con `wrangler r2 object put`, **senza eseguirlo** |
| `public/scheda-tecnica.pdf`, `public/stage-plan.pdf` | `public/press/` | Per `/press`. `lista-canali.pdf` non si migra |
| `img/logo-01.png`, `logo-02.png` + nuovi SVG | `public/press/loghi/` + `kuf-loghi.zip` | Download dei loghi in `/press` |
| `press.php` (bio, formazione, recensioni, articoli) | `src/content/site.json` / `press.md` | Testi per `/press` |
| `mail/index.html` | `emails/downloadThankYou.ts` | Riscrittura del template |

Usa `astro:assets` per tutte le immagini locali (responsive, `srcset`, lazy, dimensioni esplicite contro il CLS). Su Cloudflare non c'è `sharp` a runtime: scegli un servizio immagini compatibile (ottimizzazione in build sulle pagine prerenderizzate) e documenta la scelta.

---

## 10. SEO, performance, accessibilità

- `<title>` e description per pagina, Open Graph e Twitter card (immagine OG generata per home, dischi e concerti), `sitemap.xml` (`@astrojs/sitemap`, inclusi i dettagli dei concerti e degli articoli), `robots.txt`, `lang="it"`.
- JSON-LD: `MusicGroup` in home (con `sameAs` dei social), `MusicAlbum` sulle pagine dei dischi, `MusicEvent` sui concerti.
- Performance: JS totale sotto 30 KB gzip per pagina (esclusi gli embed caricati su richiesta), font in preload, LCP sotto 2 s su 4G, CLS ≈ 0.
- Accessibilità: navigazione completa da tastiera, focus visibile, alt descrittivi, contrasti AA, `prefers-reduced-motion`, test automatico con `@axe-core/playwright` su tutte le pagine.

---

## 11. Decisioni confermate

1. **Hosting su Cloudflare.** Il dominio va spostato su DNS Cloudflare (nameserver da Aruba a Cloudflare, piano free). Se usiamo ancora la casella `postmaster@ilsitodeikuf.it` su Aruba, bisogna ricreare i record MX/SPF di Aruba nella nuova zona: preparami la lista dei record da copiare.
2. **I contatti si salvano su D1 con consenso esplicito.** Schema e regole in §8.5, form in §6.7, informativa in §7.10.
3. **Mail di ringraziamento** a chi scarica: sì, con link valido 7 giorni (replica il comportamento attuale).
4. **Solo press kit:** pagina `/press` con download di scheda tecnica, stage plan e loghi (§7.9). Niente booking e niente ufficio stampa.
5. **Video:** confermate le liste così come sono (`ES_G9WQaA3s` resta sotto Via Trieste).
6. **Articoli senza prezzi:** nessun prezzo da nessuna parte.
7. **Niente Telegram:** nessuna integrazione, né codice né variabili.
8. **Grafica:** stessa identità del vecchio sito con una rinfrescata sobria (§5).

---

## 12. Configurazione

`wrangler.jsonc` (indicativo):
- `compatibility_date` recente, `nodejs_compat` solo se serve.
- Binding: R2 `DOWNLOADS` → bucket `kuf-downloads`; D1 `DB` → database `kuf-sito` (`migrations_dir: "migrations"`); KV `CACHE`; rate limiter `FORM_LIMITER`; (opzionale) `EMAIL`.
- Cron Trigger giornaliero per la retention dei dati (§8.5).
- Route: custom domain `ilsitodeikuf.it` e `www.ilsitodeikuf.it` (con redirect www → apex).

Variabili e secret (crea `.dev.vars.example` e documenta tutto nel README):

| Nome | Tipo | Note |
|---|---|---|
| `GOOGLE_SA_EMAIL` | secret | email del service account |
| `GOOGLE_SA_PRIVATE_KEY` | secret | chiave PKCS8 (con `\n` da gestire) |
| `GOOGLE_CALENDAR_ID` | var | ID del calendario "Kuf che fanno i concerti" |
| `CALENDAR_QUERY` | var | default `Kuf @` |
| `GOOGLE_PLACES_API_KEY` | secret | ristretta alla Places API (New) |
| `PUBLIC_GOOGLE_MAPS_EMBED_KEY` | var pubblica | opzionale, ristretta per referrer HTTP e Maps Embed API |
| `MAIL_PROVIDER` | var | `resend` \| `cloudflare` \| `log` |
| `RESEND_API_KEY` | secret | |
| `MAIL_FROM` | var | `Il Sito dei Kuf <sito@ilsitodeikuf.it>` |
| `MAIL_TO` | var | `kuf.ravenna@gmail.com` |
| `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | var / secret | in dev usa le chiavi di test ufficiali di Turnstile |
| `DOWNLOAD_TOKEN_SECRET` | secret | 32+ byte casuali |
| `UNSUBSCRIBE_TOKEN_SECRET` | secret | 32+ byte casuali, diverso dal precedente |
| `CONSENT_TEXT_VERSION` | var | es. `2026-11-v1` |
| `RETENTION_MONTHS` | var | default `24` |

In sviluppo deve funzionare tutto **senza** chiavi reali: `MAIL_PROVIDER=log`, calendario da fixture se mancano le credenziali (`CALENDAR_SOURCE=fixture`), Places → placeholder, D1 locale con le migrazioni applicate (`wrangler d1 migrations apply kuf-sito --local`).

---

## 13. Passi manuali da documentare nel README (li faccio io)

1. Google Cloud: crea il progetto, abilita Calendar API, Places API (New) e (opzionale) Maps Embed API; crea il service account e la chiave JSON; **condividi il calendario** "Kuf che fanno i concerti" con l'email del service account ("Vedere tutti i dettagli degli eventi"); crea e restringi le chiavi API; imposta un budget alert a 1 €.
2. **Revoca le vecchie credenziali OAuth** (il refresh token in `credential.json` e il client in `client_secret.json`) dalla console Google e da myaccount.google.com → Sicurezza → App di terze parti.
3. Cloudflare: aggiungi la zona `ilsitodeikuf.it`, cambia i nameserver su Aruba, ricrea i record MX se servono, crea il bucket R2, il database D1 (e applica le migrazioni in remoto), il namespace KV e il widget Turnstile.
4. Resend: aggiungi il dominio (o il sottodominio `send.`), record DKIM/SPF/DMARC.
5. Carica gli zip su R2 con lo script preparato.
6. Primo deploy, test end-to-end in produzione, poi spegnimento del vecchio hosting (dopo un backup completo).

---

## 14. Piano di lavoro (fermati alla fine di ogni fase)

**Fase 0: analisi.** Leggi il vecchio sito in `../ilsitodeikuf.it` (escludendo `vendor/` e i secret), verifica la documentazione corrente di Astro 6, `@astrojs/cloudflare`, Turnstile, Rate Limiting, Places API (New) e Resend. Proponi eventuali correzioni a questo piano.
*Output:* breve documento `docs/decisions.md` (ADR leggeri).

**Fase 1: scaffold.** Progetto Astro + adapter Cloudflare + Tailwind 4 + TypeScript strict + ESLint/Prettier + Vitest + Playwright + CI GitHub Actions (senza deploy). `wrangler.jsonc`, `.dev.vars.example`, README iniziale.
*Fatto quando:* `npm run dev`, `npm run build`, `npm run check` e `npm test` passano; la pagina vuota si vede su `wrangler dev`.

**Fase 2: design system e layout.** Token, font, texture, logo SVG, BaseLayout, Header e MenuOverlay, Footer, **SocialDock**, Modal + `modal-router.ts`, pagina `/styleguide` (solo in dev).
*Fatto quando:* FAB e menu funzionano con mouse, touch e tastiera; reduced-motion rispettato; axe senza errori.

**Fase 3: contenuti statici.** Migrazione degli asset (§9), collection `articoli` e `albums`, pagine `/articoli`, `/articoli/[slug]`, `/via-trieste`, `/pigna` (form ancora finti), VideoList, redirect.
*Fatto quando:* deep link e navigazione delle modali articoli testati con Playwright (apertura diretta, apertura da lista, chiusura, back/forward).

**Fase 4: form ed email.** Actions `contatto` e `richiestaDownload`, Turnstile, honeypot, rate limit, `lib/mail` con i tre provider, template email, token di download, `/api/download/[token]` (con R2 locale e uno zip finto), `/contattaci`, `/privacy`.
*Fatto quando:* i test unitari coprono validazione, escaping, token (valido, scaduto, manomesso) e i test e2e coprono il flusso completo con `MAIL_PROVIDER=log`.

**Fase 5: concerti.** `google-auth.ts`, `calendar.ts` con fixture, `/concerti`, `/concerti/[slug]`, `.ics`, JSON-LD, `places.ts` e `/api/venue-photos`, placeholder.
*Fatto quando:* i test sulle date in Europe/Rome passano (compreso il cambio d'ora); la modale funziona con fixture e con credenziali reali (le fornisco io).

**Fase 6: home.** Tutte le sezioni del §7.1, server island del prossimo concerto, immagini OG.
*Fatto quando:* Lighthouse mobile ≥ 95 su `/`, `/concerti`, `/articoli`, `/pigna`.

**Fase 7: hardening e go-live.** Header di sicurezza e CSP, sitemap, 404, Web Analytics, script di upload R2, checklist dei passi manuali (§13), test di regressione dei redirect. **Il deploy lo lanci solo dopo il mio ok.**

---

## 15. Criteri di accettazione globali

- [ ] Tutti i path richiesti esistono e funzionano sia con link diretto sia con navigazione interna: `/`, `/concerti`, `/concerti/<slug>`, `/contattaci`, `/articoli`, `/articoli/<slug>`, `/via-trieste`, `/pigna`.
- [ ] I concerti si leggono dal calendario "Kuf che fanno i concerti", divisi in programma / passati, con orario in ora italiana, luogo, link a Google Maps e foto della venue (o placeholder).
- [ ] Il form contatti (condiviso) arriva a kuf.ravenna@gmail.com con nome, email (in Reply-To) e messaggio; dal dettaglio articolo porta il nome dell'articolo nell'oggetto.
- [ ] I download dei due dischi richiedono nome ed email (messaggio opzionale), notificano la band, mandano il ringraziamento con il link e avviano il download da R2.
- [ ] Sotto ogni disco ci sono i 3 video indicati.
- [ ] Il FAB dei social è animato e presente in tutte le pagine, desktop e mobile.
- [ ] I vecchi URL `.php` fanno redirect 301.
- [ ] Nessun secret nel repo; `npm run check`, lint e test sono verdi in CI.
- [ ] Il README spiega come aggiungere un concerto (convenzioni della descrizione), un articolo e un disco, e come fare deploy.
