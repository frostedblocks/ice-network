#!/bin/bash
# Deploy ICE LiteAdmin Motoko only (no frontend UI yet).
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy >/dev/null

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"
cp -f "$WIN/backend/main.mo" backend/main.mo

echo "=== deploy ice ==="
dfx deploy ice --network ic --yes

mkdir -p frontend/src/declarations/ice
cp -f .dfx/ic/canisters/ice/service.did.js frontend/src/declarations/ice/ice.did.js
cp -f .dfx/ic/canisters/ice/service.did frontend/src/declarations/ice/ice.did
cp -f .dfx/ic/canisters/ice/service.did.d.ts frontend/src/declarations/ice/ice.did.d.ts 2>/dev/null || true
mkdir -p "$WIN/frontend/src/declarations/ice"
cp -f frontend/src/declarations/ice/* "$WIN/frontend/src/declarations/ice/"

echo DONE
