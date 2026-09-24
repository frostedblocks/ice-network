#!/bin/bash
set -euo pipefail
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"
dfx identity use mynewdeploy

cp -f "$WIN/backend/main.mo" backend/main.mo
cp -f "$WIN/frontend/src/CycleBalance.jsx" frontend/src/CycleBalance.jsx

# Ice must be controller of messaging + assets to read their cycle balances
ICE_PRINCIPAL=$(dfx canister id ice --network ic)
echo "Adding ice ($ICE_PRINCIPAL) as controller of messaging + assets (if needed)..."
dfx canister update-settings messaging --network ic --add-controller "$ICE_PRINCIPAL" 2>&1 || true
dfx canister update-settings assets --network ic --add-controller "$ICE_PRINCIPAL" 2>&1 || true

dfx deploy ice --network ic --yes

mkdir -p frontend/src/declarations/ice frontend/src/declarations/messaging
cp -f .dfx/ic/canisters/ice/service.did.js frontend/src/declarations/ice/ice.did.js
cp -f .dfx/ic/canisters/ice/service.did frontend/src/declarations/ice/ice.did
cp -f .dfx/ic/canisters/ice/service.did.d.ts frontend/src/declarations/ice/ice.did.d.ts 2>/dev/null || true
cp -f .dfx/ic/canisters/messaging/service.did.js frontend/src/declarations/messaging/messaging.did.js 2>/dev/null || true

cp -f "$WIN/frontend/src/"*.jsx frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.js frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.css frontend/src/ 2>/dev/null || true

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)
cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" npm run build
cp -f public/*.html dist/ 2>/dev/null || true
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
cd ..
dfx deploy assets --network ic --yes
echo "DONE"
