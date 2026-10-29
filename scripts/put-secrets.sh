#!/usr/bin/env bash
# Carica i secret del Worker su Cloudflare senza mai stamparli (docs/go-live.md, punto 5).
# - Google (service account, Places): presi da .dev.vars;
# - token di download e disiscrizione: generati qui a caso (32 byte), non servono altrove;
# - Turnstile: lo chiede wrangler, da incollare a mano; Resend solo con --resend (quando c'è l'account).
# Uso: scripts/put-secrets.sh [--resend]   (dopo npx wrangler login e il primo deploy)
set -euo pipefail
cd "$(dirname "$0")/.."

# valore di una variabile in .dev.vars (toglie le virgolette esterne; i "\n" restano: li gestisce il Worker)
devvar() {
  node -e '
    const [file, key] = process.argv.slice(1);
    const line = require("fs").readFileSync(file, "utf8").split("\n").find((l) => l.startsWith(key + "="));
    if (!line) process.exit(1);
    process.stdout.write(line.slice(key.length + 1).trim().replace(/^"(.*)"$/s, "$1"));
  ' .dev.vars "$1"
}

put_from_devvars() {
  if value="$(devvar "$1")" && [[ -n "$value" ]]; then
    printf '%s' "$value" | npx wrangler secret put "$1" >/dev/null && echo "✔ $1 (da .dev.vars)"
  else
    echo "– $1 non c'è in .dev.vars: saltato"
  fi
}

put_from_devvars GOOGLE_SA_EMAIL
put_from_devvars GOOGLE_SA_PRIVATE_KEY
put_from_devvars GOOGLE_PLACES_API_KEY

for name in DOWNLOAD_TOKEN_SECRET UNSUBSCRIBE_TOKEN_SECRET; do
  openssl rand -base64 32 | tr -d '\n' | npx wrangler secret put "$name" >/dev/null && echo "✔ $name (casuale)"
done

echo
echo "Ora incolla la SECRET key di Turnstile (quella segreta, non la site key):"
npx wrangler secret put TURNSTILE_SECRET_KEY

if [[ "${1:-}" == "--resend" ]]; then
  echo "Ora incolla la API key di Resend:"
  npx wrangler secret put RESEND_API_KEY
fi

echo
npx wrangler secret list
