#!/bin/bash
cd "$(dirname "$0")/backend"
npm install --silent 2>/dev/null
node server.js &
sleep 2
xdg-open http://localhost:3000/launcher 2>/dev/null &
wait
