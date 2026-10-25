#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Datenpfad aus plm.config lesen
PLM_DATA_DIR=""
if [ -f "$SCRIPT_DIR/plm.config" ]; then
  while IFS='=' read -r key value; do
    key="${key// /}"
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    if [ "$key" = "data_dir" ] && [ -n "$value" ]; then
      PLM_DATA_DIR="$value"
    fi
  done < "$SCRIPT_DIR/plm.config"
fi

if [ -z "$PLM_DATA_DIR" ]; then
  echo "HINWEIS: Kein Datenpfad in plm.config - bitte data_dir setzen."
fi

cd "$SCRIPT_DIR/backend"
# Pakete nur installieren, wenn sie fehlen oder package.json neuer ist —
# sonst startet PLM ohne Internet (wie START-PLM.bat)
if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then
  npm install --silent --no-audit --no-fund 2>/dev/null
fi
# Den Port waehlt der Server selbst (3000, sonst der naechste freie) und
# oeffnet dann den Browser - nur er weiss, welchen Port er bekommen hat.
# Code 75 = Update installiert: neu starten, ohne neuen Browser-Tab. Die
# Schleife ist ein Befehl — bash liest sie ganz ein, ein Update dieser Datei
# stört sie nicht.
export PLM_DATA_DIR PLM_START_SCRIPT=1
open_browser=1
while :; do
  PLM_OPEN_BROWSER=$open_browser node server.js
  rc=$?
  [ "$rc" -eq 75 ] || exit "$rc"
  echo "Update installiert - PLM startet neu..."
  open_browser=
done
