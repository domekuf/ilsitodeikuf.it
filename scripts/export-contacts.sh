#!/usr/bin/env bash
# Esporta in CSV gli iscritti con consenso attivo agli aggiornamenti (§8.5).
# Uso: scripts/export-contacts.sh [--local] > iscritti.csv   (default: database remoto)
set -euo pipefail
WHERE="--remote"; [[ "${1:-}" == "--local" ]] && WHERE="--local"

npx wrangler d1 execute kuf-sito "$WHERE" --json --command "
  SELECT c.name AS nome, c.email AS email,
         (SELECT created_at FROM consents k WHERE k.contact_id = c.id AND k.purpose = 'updates' AND k.granted = 1
          ORDER BY k.created_at DESC, k.id DESC LIMIT 1) AS consenso_dal
  FROM contacts_updates_optin c
  WHERE c.updates_optin = 1
  ORDER BY c.name COLLATE NOCASE" 2>/dev/null |
  python3 -c '
import csv, json, sys
rows = json.load(sys.stdin)[0]["results"]
w = csv.writer(sys.stdout)
w.writerow(["nome", "email", "consenso_dal"])
for r in rows:
    w.writerow([r["nome"], r["email"], r["consenso_dal"]])
'
