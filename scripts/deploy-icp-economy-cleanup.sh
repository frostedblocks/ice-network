#!/bin/bash
# Deploy ICE (adminDebit/Clear ICP) + frontend economy cleanup
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"

cp -f "$WIN/backend/main.mo" backend/main.mo
cp -f "$WIN/frontend/src/"*.jsx frontend/src/
cp -f "$WIN/frontend/src/"*.js frontend/src/
cp -rf "$WIN/frontend/src/declarations" frontend/src/

echo "=== deploy ice ==="
dfx deploy ice --network ic --yes

mkdir -p frontend/src/declarations/ice
cp -f .dfx/ic/canisters/ice/service.did.js frontend/src/declarations/ice/ice.did.js
cp -f .dfx/ic/canisters/ice/service.did frontend/src/declarations/ice/ice.did
cp -f .dfx/ic/canisters/ice/service.did.d.ts frontend/src/declarations/ice/ice.did.d.ts 2>/dev/null || true
mkdir -p "$WIN/frontend/src/declarations/ice"
cp -f frontend/src/declarations/ice/* "$WIN/frontend/src/declarations/ice/"

echo "=== build + deploy assets ==="
cd frontend
DFX_NETWORK=ic \
  CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  CANISTER_ID_MESSAGING=6agwb-myaaa-aaaan-q6mxa-cai \
  VITE_CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  VITE_CANISTER_ID_MESSAGING=6agwb-myaaa-aaaan-q6mxa-cai \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  npm run build
cp -f .ic-assets.json dist/ 2>/dev/null || true
cd ..
dfx deploy assets --network ic --yes
echo DONE
