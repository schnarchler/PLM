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
npm install --silent 2>/dev/null
PLM_DATA_DIR="$PLM_DATA_DIR" node server.js &
sleep 2
xdg-open http://localhost:3000/launcher 2>/dev/null &
wait
