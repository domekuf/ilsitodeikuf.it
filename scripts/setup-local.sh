#!/usr/bin/env bash
# Prepara l'ambiente locale (dev, preview, test e2e): variabili, database D1 e zip finti su R2.
# Tutto in .wrangler/state, niente di remoto.
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .dev.vars ]] || cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply kuf-sito --local >/dev/null
for key in kuf-pigna-2017 kuf-via-trieste-2015; do
  npx wrangler r2 object put "kuf-downloads/downloads/$key.zip" \
    --file tests/fixtures/disco-finto.zip --content-type application/zip --local >/dev/null
done
echo "Ambiente locale pronto (D1 migrato, zip finti su R2)."
