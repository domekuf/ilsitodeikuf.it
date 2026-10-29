#!/usr/bin/env bash
# Diritto alla cancellazione: elimina un contatto e tutto ciò che è collegato (richieste e consensi, in cascata).
# Uso: scripts/delete-contact.sh persona@example.com [--local]
set -euo pipefail
EMAIL="${1:?Uso: scripts/delete-contact.sh <email> [--local]}"
WHERE="--remote"; [[ "${2:-}" == "--local" ]] && WHERE="--local"

# l'email va in un parametro SQL: niente concatenazioni con input non fidato
if [[ ! "$EMAIL" =~ ^[^[:space:]\'\"\;]+@[^[:space:]\'\"\;]+$ ]]; then
  echo "Email non valida: $EMAIL" >&2
  exit 1
fi
EMAIL_LC=$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')

read -r -p "Cancello per sempre $EMAIL_LC ($WHERE)? Scrivi 'si' per confermare: " ok
[[ "$ok" == "si" ]] || { echo "Annullato."; exit 0; }

npx wrangler d1 execute kuf-sito "$WHERE" --command "DELETE FROM contacts WHERE email = '$EMAIL_LC'"
echo "Fatto."
