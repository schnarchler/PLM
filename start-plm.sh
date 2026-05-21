#!/bin/bash
cd "$(dirname "$0")/backend"
npm install --silent 2>/dev/null
node server.js
