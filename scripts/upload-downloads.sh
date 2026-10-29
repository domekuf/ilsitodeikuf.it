#!/usr/bin/env bash
# Carica su R2 gli zip dei dischi (creati con scripts/build-album-zips.py).
# NON viene lanciato da nessuna parte in automatico: si esegue a mano, dopo l'ok, quando il bucket esiste.
#
# Uso: scripts/upload-downloads.sh [cartella degli zip]   (default: materiali/downloads)
set -euo pipefail

DIR="${1:-materiali/downloads}"
BUCKET="kuf-downloads"

upload() {
  local file="$1" key="$2"
  if [[ ! -f "$file" ]]; then
    echo "Manca $file: lancia prima scripts/build-album-zips.py" >&2
    exit 1
  fi
  echo "→ $file  ⇒  r2://$BUCKET/$key"
  npx wrangler r2 object put "$BUCKET/$key" \
    --file "$file" \
    --content-type "application/zip" \
    --remote
}

upload "$DIR/Kuf - Pigna (2017).zip" "downloads/kuf-pigna-2017.zip"
upload "$DIR/Kuf - Via Trieste (2015).zip" "downloads/kuf-via-trieste-2015.zip"
echo "Fatto."
