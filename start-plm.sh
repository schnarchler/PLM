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
# Den Port waehlt der Server selbst (3000, sonst der naechste freie) und
# oeffnet dann den Browser - nur er weiss, welchen Port er bekommen hat.
PLM_DATA_DIR="$PLM_DATA_DIR" PLM_OPEN_BROWSER=1 node server.js
