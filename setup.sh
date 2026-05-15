#!/bin/bash
# 3D-PLM v2 – Setup für Raspberry Pi
set -e
echo "🖨  3D-PLM v2 Setup..."
if ! command -v node &> /dev/null; then
  echo "➤ Node.js installieren..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "✓ Node $(node -v)"
cd "$(dirname "$0")/backend"
npm install --production
echo ""
echo "✅ Fertig! Starten mit: cd backend && node server.js"
echo "   Browser: http://$(hostname -I | awk '{print $1}'):3000"
