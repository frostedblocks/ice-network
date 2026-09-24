#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh" 2>/dev/null || true
nvm use 20 2>/dev/null || true
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN_ICE="/mnt/c/Users/walt_/ice-network"
WIN_SS="/mnt/c/Users/walt_/ScaleSpace"
PROJ_ICE="/home/walt_wood1/ice-network"
PROJ_SS="/home/walt_wood1/ScaleSpace"

dfx identity use mynewdeploy

echo "=== Upload user_site WASM (WebP-only) ==="
cd "$PROJ_ICE"
mkdir -p src/user_site
cp -f "$WIN_ICE/src/user_site/main.mo" src/user_site/main.mo
bash /mnt/c/Users/walt_/ScaleSpace/scripts/upload-user-site-wasm.sh

echo "=== Push WASM to sites ==="
dfx canister call factory adminPushLatestWasmToAll '(20 : nat)' --network ic

echo "=== Deploy frontend assets ==="
cd "$PROJ_SS"
mkdir -p frontend/src
cp -f "$WIN_SS/frontend/src/SitePhotos.jsx" frontend/src/SitePhotos.jsx
# full frontend tree if needed for build
if [ -f "$WIN_SS/package.json" ]; then
  # sync key frontend files for vite build
  rsync -a --exclude node_modules --exclude dist "$WIN_SS/frontend/" frontend/ 2>/dev/null || \
    cp -rf "$WIN_SS/frontend/src/." frontend/src/ 2>/dev/null || true
fi
cp -f "$WIN_SS/package.json" package.json 2>/dev/null || true
cp -f "$WIN_SS/frontend/package.json" frontend/package.json 2>/dev/null || true

# Prefer ScaleSpace root deploy scripts pattern
if [ -f frontend/package.json ]; then
  cd frontend
  npm ci 2>/dev/null || npm install
  npm run build
  cd ..
fi

# Deploy assets canister
if [ -d frontend/dist ] || [ -d dist ]; then
  DIST=""
  [ -d frontend/dist ] && DIST=frontend/dist
  [ -d dist ] && DIST=dist
  if [ -n "$DIST" ] && [ -f dfx.json ]; then
    dfx deploy assets --network ic --yes || true
  fi
fi

# Fallback: common ScaleSpace asset deploy
if [ -f scripts/deploy-assets-photos.sh ]; then
  sed -i 's/\r$//' scripts/deploy-assets-photos.sh || true
  bash scripts/deploy-assets-photos.sh || true
elif [ -f /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-photos.sh ]; then
  sed -i 's/\r$//' /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-photos.sh
  bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-photos.sh || true
fi

echo DONE
