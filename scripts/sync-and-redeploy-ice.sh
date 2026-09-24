#!/bin/bash
set -euo pipefail
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="$HOME/ScaleSpace"

# Sync rebranded sources
rsync -a --exclude node_modules --exclude .dfx --exclude frontend/node_modules \
  "$WIN/" "$PROJ/" 2>/dev/null || {
  cp "$WIN/dfx.json" "$PROJ/dfx.json"
  cp "$WIN/backend/main.mo" "$PROJ/backend/main.mo"
  cp "$WIN/messaging/main.mo" "$PROJ/messaging/main.mo"
  cp "$WIN/frontend/src/App.jsx" "$PROJ/frontend/src/App.jsx"
  cp "$WIN/frontend/src/actors.js" "$PROJ/frontend/src/actors.js"
  cp "$WIN/frontend/vite.config.js" "$PROJ/frontend/vite.config.js"
  cp "$WIN/frontend/index.html" "$PROJ/frontend/index.html"
  cp "$WIN/frontend/package.json" "$PROJ/frontend/package.json"
  cp "$WIN/frontend/src/Messaging.jsx" "$PROJ/frontend/src/Messaging.jsx"
  cp "$WIN/frontend/src/Subscribe.jsx" "$PROJ/frontend/src/Subscribe.jsx"
  cp "$WIN/README.md" "$PROJ/README.md"
}

cd "$PROJ"
dfxvm default 0.29.2 2>/dev/null || true

if ! dfx ping >/dev/null 2>&1; then
  dfx start --background
  sleep 3
fi

# Drop old scalespace declarations if present
rm -rf frontend/src/declarations/scalespace

echo "=== deploy ice ==="
dfx deploy ice
echo "=== deploy messaging ==="
dfx deploy messaging
dfx generate ice
dfx generate messaging

ICE=$(dfx canister id ice)
MSG=$(dfx canister id messaging)
II=$(dfx canister id internet_identity 2>/dev/null || true)
cat > frontend/.env.local <<EOF
# DFX CANISTER ENVIRONMENT VARIABLES
DFX_NETWORK=local
CANISTER_ID_ICE=${ICE}
CANISTER_ID_MESSAGING=${MSG}
CANISTER_ID_INTERNET_IDENTITY=${II}
# END DFX CANISTER ENVIRONMENT VARIABLES
EOF

echo "=== done ==="
cat frontend/.env.local
ls frontend/src/declarations/
echo "Restart: cd ~/ScaleSpace/frontend && npm run dev"
