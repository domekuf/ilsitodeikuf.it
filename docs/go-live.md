# Messa online: checklist dei passi manuali

Tutto quello che va fatto a mano (account, chiavi, DNS) per mettere online il sito nuovo, nell'ordine giusto.
Niente di questo l'ha fatto Claude: deploy, DNS e caricamenti su R2 partono solo da voi.

Legenda: ☐ da fare · ✅ già fatto (verificato il 28/10/2026)

---

## 0. Prima di tutto

- ☐ **Backup completo del vecchio sito** (via FTP: tutta la cartella, compresi gli zip in `public/`). Il vecchio sito oggi è su `51.75.16.232`.
- ☐ Decidete il giorno del cambio: tra il cambio dei nameserver e la propagazione possono passare alcune ore. La posta di Aruba continua a funzionare se i record del punto 3 sono copiati bene.

## 1. Google Cloud (progetto `ilsitodeikuf`)

- ✅ Calendar API attiva, service account `calendar@ilsitodeikuf.iam.gserviceaccount.com`, calendario "Kuf che fanno i concerti" condiviso con lui (provato: 97 eventi letti).
- ☐ **Places API (New)** attiva. Chiave API con restrizione **API: solo Places API (New)** e **nessuna** restrizione di applicazione (la usa il server, non il browser). Va nel secret `GOOGLE_PLACES_API_KEY`.
- ☐ **Maps Embed API** attiva. Chiave separata, restrizione **Referrer HTTP**: `https://ilsitodeikuf.it/*`, `https://www.ilsitodeikuf.it/*`, `http://localhost:4321/*`; API: solo Maps Embed API. Va in `wrangler.jsonc` → `vars` → `GOOGLE_MAPS_EMBED_KEY` (è pubblica: finisce nell'HTML).
- ☐ **Budget alert** a 1 € (Fatturazione → Budget e avvisi) e, per stare tranquilli, **quote giornaliere** sulla Places API (API e servizi → Places API (New) → Quote: es. 200 richieste/giorno per Place Details e Place Photos). Il sito ha già un suo tetto di 40 ricerche nuove al giorno.
- ☐ **Revoca delle vecchie credenziali OAuth** del vecchio sito (il client di `client_secret.json` e il refresh token di `credential.json`): Console → API e servizi → Credenziali → eliminate il client OAuth; poi https://myaccount.google.com → Sicurezza → Connessioni con app di terze parti → togliete l'accesso alla vecchia app.
- ☐ Togliete la chiave JSON del service account dalla cartella del progetto (è ignorata da git, ma meglio tenerla altrove).

## 2. Cloudflare: account e risorse

Da terminale, nella cartella del progetto:

```sh
npx wrangler login
npx wrangler d1 create kuf-sito                 # → copiate database_id in wrangler.jsonc (d1_databases)
npx wrangler kv namespace create CACHE          # → copiate id in wrangler.jsonc (kv_namespaces)
npx wrangler r2 bucket create kuf-downloads
npm run db:migrate:remote                       # crea le tabelle su D1
```

- ☐ **Turnstile** (dashboard → Turnstile → Add widget): dominio `ilsitodeikuf.it`, modalità *Managed*.
  - la **site key** va in un file `.env.production` nella cartella del progetto (non in `.env`, che la userebbe anche in sviluppo, e mai in `.dev.vars`): `PUBLIC_TURNSTILE_SITE_KEY=0x…` (entra nell'HTML in build; `npm run deploy` si rifiuta di partire con la chiave di test);
  - la **secret key**: `npx wrangler secret put TURNSTILE_SECRET_KEY`.
- ☐ **Web Analytics** (dashboard → Analytics & Logs → Web Analytics → Add a site → `ilsitodeikuf.it`, installazione **manuale**): copiate il token in `src/content/site.json` → `analyticsToken`. Scegliete "manuale" e non "automatica", altrimenti le visite si contano due volte.

## 3. DNS: la zona su Cloudflare

- ☐ Dashboard → **Add a domain** → `ilsitodeikuf.it`, piano Free. Cloudflare importa da solo i record che trova: confrontateli con questa lista (letta dal DNS pubblico il 28/10/2026) e con il pannello DNS di Aruba, che potrebbe averne altri non visibili da fuori (es. chiavi DKIM).

Da **tenere**, tutti con la nuvola **grigia** ("DNS only"), perché la posta non passa da Cloudflare:

| Tipo | Nome | Valore |
|---|---|---|
| MX | `@` | `mx.ilsitodeikuf.it` (priorità 10) |
| A | `mx` | 62.149.128.154, .160, .151, .74, .157, .163, .166 |
| A | `mail` | 62.149.128.157, .154, .166, .151, .163, .160, .74 |
| A | `smtp` | 62.149.128.201, .203, .200, .202 |
| A | `pop3` | 62.149.128.73, .161, .152, .158, .164, .167, .155, .75 |
| CNAME | `imap` | `imaps.aruba.it` |
| A | `webmail` | 62.149.158.92, 62.149.158.91 |
| CNAME | `admin` | `admin.redirect.aruba.it` |
| TXT | `@` | `v=spf1 mx a ip4:62.149.156.88 ip4:62.149.156.0/24 -all` |
| TXT | `_dmarc` | `v=DMARC1; p=none; adkim=r; aspf=r;` |

Da **togliere** (puntano al vecchio hosting): `A @ 51.75.16.232`, `A www 51.75.16.232`, `CNAME ftp → www`. Li sostituiscono i domini custom del Worker (punto 6).

Attenzione all'SPF: contiene `a`, cioè "l'IP del sito può mandare posta". Quando il sito passa a Cloudflare quell'IP cambia; non è un problema (la posta parte dai server Aruba elencati), ma potete toglierlo: `v=spf1 mx ip4:62.149.156.88 ip4:62.149.156.0/24 -all`.

- ☐ **Nameserver**: nel pannello Aruba (Gestione domini → DNS e nameserver) sostituite `dns.technorail.com`, `dns2.technorail.com`, `dns3.arubadns.net`, `dns4.arubadns.cz` con i due che vi dà Cloudflare. Aspettate che Cloudflare dica "Active".
- ☐ Provate subito la posta (mandare e ricevere su `@ilsitodeikuf.it`).

## 4. Resend (email del sito)

- ☐ Account su resend.com → Domains → Add domain `ilsitodeikuf.it`, regione **EU (Ireland)**. Resend mette i suoi record su un sottodominio (`send.ilsitodeikuf.it` per SPF/MX di ritorno, `resend._domainkey` per DKIM): non toccano la posta di Aruba. Aggiungeteli su Cloudflare (nuvola grigia) e premete "Verify".
- ☐ API key con permesso **Sending access** limitata al dominio: `npx wrangler secret put RESEND_API_KEY`.
- ☐ (dopo qualche settimana senza problemi) DMARC da `p=none` a `p=quarantine`.

## 5. Secret del Worker

Il modo più comodo: `scripts/put-secrets.sh` (prende i dati Google da `.dev.vars`, genera i due token, chiede la secret di Turnstile; con `--resend` anche la chiave di Resend). Senza mai stampare un segreto. A mano, invece:

```sh
npx wrangler secret put GOOGLE_SA_EMAIL            # calendar@ilsitodeikuf.iam.gserviceaccount.com
npx wrangler secret put GOOGLE_SA_PRIVATE_KEY      # il "private_key" del JSON, così com'è
npx wrangler secret put GOOGLE_PLACES_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
openssl rand -base64 32 | npx wrangler secret put DOWNLOAD_TOKEN_SECRET
openssl rand -base64 32 | npx wrangler secret put UNSUBSCRIBE_TOKEN_SECRET
npx wrangler secret list                           # controllo: devono esserci tutti e 7
```

## 6. Primo deploy (solo dopo l'ok della band)

1. ☐ Caricate gli zip dei dischi su R2: `scripts/upload-downloads.sh` (≈240 MB).
2. ☐ **Prima prova su workers.dev**, con le `routes` ancora commentate: `npm run deploy`. Il comando controlla la configurazione e si ferma se manca qualcosa (`npm run deploy:check` per vedere solo il controllo). Il sito risponde su `https://ilsitodeikuf.<account>.workers.dev`: provate tutto lì (punto 7).
3. ☐ Scommentate `routes` in `wrangler.jsonc` (apex e www) e rilanciate `npm run deploy`: Cloudflare crea da solo i record DNS e i certificati.
4. ☐ **www → senza www**: dashboard → Rules → Redirect Rules → template "Redirect from WWW to root" (301). Il Worker lo fa già per le pagine dinamiche, la regola copre anche le pagine statiche.
5. ☐ (facoltativo) Deploy da GitHub: spostate `docs/github/deploy.yml` in `.github/workflows/` e aggiungete i secret indicati in cima al file. Parte solo a mano.

## 7. Prove in produzione

- ☐ Home, concerti (date vere, prossimo concerto, dettaglio, foto, mappa, .ics), dischi, articoli, press (download dei PDF e dei loghi), privacy, 404.
- ☐ Form contatti: arriva la mail a kuf.ravenna@gmail.com con Reply-To giusto.
- ☐ Download di un disco: notifica alla band, mail di ringraziamento con il link, zip scaricato, disiscrizione dal link nella mail.
- ☐ Vecchi URL: `/concerti.php`, `/magliette.php`, `/download.php?dl=Pigna.zip`, `/public/Pigna.zip` → 301 alle pagine nuove.
- ☐ Header di sicurezza: https://securityheaders.com/?q=ilsitodeikuf.it (atteso A o A+).
- ☐ Lighthouse mobile su `/`, `/concerti`, `/articoli`, `/pigna`.
- ☐ Google Search Console: aggiungete il dominio e inviate `https://ilsitodeikuf.it/sitemap.xml`.

## 8. Dopo

- ☐ Spegnete il vecchio hosting (dopo il backup del punto 0).
- ☐ Rileggete e approvate la bozza di `/privacy` (ADR-049).
- ☐ I link del press kit segnati come non verificati (`src/content/press.json`, `verified: false`): controllateli a mano e attivate quelli vivi.
