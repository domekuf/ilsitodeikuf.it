// Controlli prima del deploy (npm run deploy li lancia da solo). Non deploya niente e non tocca niente:
// legge la configurazione e si ferma se qualcosa porterebbe in produzione un sito rotto o insicuro.
import { existsSync, readFileSync } from 'node:fs';

const errors = [];
const warnings = [];

// --- wrangler.jsonc (le righe di commento si ignorano) ---
const wrangler = readFileSync('wrangler.jsonc', 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');
const block = (key) => {
  const i = wrangler.indexOf(`"${key}"`);
  return i < 0 ? '' : wrangler.slice(i, wrangler.indexOf(']', i) + 1);
};
if (!/"database_id"\s*:\s*"[0-9a-f-]{36}"/.test(block('d1_databases'))) {
  errors.push('wrangler.jsonc: manca "database_id" di D1 (npx wrangler d1 create kuf-sito).');
}
if (!/"id"\s*:\s*"[0-9a-f]{32}"/.test(block('kv_namespaces'))) {
  errors.push('wrangler.jsonc: manca "id" del namespace KV (npx wrangler kv namespace create CACHE).');
}
if (!/"custom_domain"\s*:\s*true/.test(block('routes'))) {
  warnings.push('wrangler.jsonc: "routes" commentate, il sito andrà solo su *.workers.dev.');
}
if (/"MAIL_PROVIDER"\s*:\s*"log"/.test(wrangler)) errors.push('wrangler.jsonc: MAIL_PROVIDER è "log".');
if (/"CALENDAR_SOURCE"\s*:\s*"fixture"/.test(wrangler)) {
  errors.push('wrangler.jsonc: CALENDAR_SOURCE è "fixture" (concerti finti).');
}

// --- chiave pubblica di Turnstile: entra nell'HTML in build, quindi serve ADESSO ---
const fromFile = (file) =>
  existsSync(file)
    ? /^PUBLIC_TURNSTILE_SITE_KEY=(.*)$/m.exec(readFileSync(file, 'utf8'))?.[1]?.trim()
    : undefined;
// .dev.vars vince su .env* anche in build: se c'è lì, finisce in produzione quella (di solito di test)
if (fromFile('.dev.vars') !== undefined) {
  errors.push(
    '.dev.vars contiene PUBLIC_TURNSTILE_SITE_KEY: in build vince su .env.production. Togli la riga da .dev.vars.',
  );
}
const siteKey =
  process.env.PUBLIC_TURNSTILE_SITE_KEY ?? fromFile('.env.production') ?? fromFile('.env') ?? '';
if (!siteKey) {
  errors.push(
    'PUBLIC_TURNSTILE_SITE_KEY non impostata (in .env.production o nell’ambiente): si userebbe la chiave di test.',
  );
} else if (/^[123]x0+/.test(siteKey)) {
  errors.push(
    'PUBLIC_TURNSTILE_SITE_KEY è una chiave di test di Turnstile: in produzione serve quella vera.',
  );
}

// --- statistiche ---
const site = JSON.parse(readFileSync('src/content/site.json', 'utf8'));
if (!site.analyticsToken) warnings.push('src/content/site.json: analyticsToken vuoto, niente Web Analytics.');

// --- dopo la build (npm run deploy lo chiama con --dist): nell'HTML non deve esserci la chiave di test ---
if (process.argv.includes('--dist')) {
  errors.length = 0;
  warnings.length = 0;
  const html = readFileSync('dist/client/index.html', 'utf8');
  if (/data-sitekey="[123]x0+/.test(html)) {
    errors.push(
      'La build contiene la site key di TEST di Turnstile: i form in produzione non funzionerebbero.',
    );
  } else if (!/data-sitekey="[^"]+"/.test(html)) {
    warnings.push('Non trovo la site key di Turnstile nella home: controlla i form dopo il deploy.');
  }
}

for (const w of warnings) console.warn(`⚠️  ${w}`);
for (const e of errors) console.error(`✖  ${e}`);
if (errors.length) {
  console.error('\nDeploy fermato. La checklist completa è in docs/go-live.md.');
  process.exit(1);
}
console.log(
  process.argv.includes('--dist')
    ? '✔ Build controllata: site key di Turnstile vera.'
    : '✔ Configurazione pronta per il deploy. Ricorda i secret: npx wrangler secret list',
);
